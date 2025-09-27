import { describe, expect, it } from 'vitest';

import { MicroSdCardController } from './microsd';

function sendCommand(
	controller: MicroSdCardController,
	command: number,
	argument: number,
	crc: number,
	responseLength = 1,
): number[] {
	controller.transferByte(0x40 | (command & 0x3f));
	controller.transferByte((argument >>> 24) & 0xff);
	controller.transferByte((argument >>> 16) & 0xff);
	controller.transferByte((argument >>> 8) & 0xff);
	controller.transferByte(argument & 0xff);
	controller.transferByte(crc & 0xff);

	const response: number[] = [];
	for (let index = 0; index < 32 && response.length === 0; index++) {
		const value = controller.transferByte(0xff);
		if (value !== 0xff) {
			response.push(value);
		}
	}

	while (response.length < responseLength) {
		response.push(controller.transferByte(0xff));
	}

	return response;
}

function initializeCard(controller: MicroSdCardController): void {
	controller.beginTransaction();
	expect(sendCommand(controller, 0, 0, 0x95)).toEqual([0x01]);
	expect(sendCommand(controller, 8, 0x1aa, 0x87, 5)).toEqual([0x01, 0x00, 0x00, 0x01, 0xaa]);
	expect(sendCommand(controller, 55, 0, 0x65)).toEqual([0x01]);
	expect(sendCommand(controller, 41, 0x40000000, 0x77)).toEqual([0x00]);
	expect(sendCommand(controller, 58, 0, 0xfd, 5)).toEqual([0x00, 0x40, 0x00, 0x00, 0x00]);
}

function readSector(controller: MicroSdCardController, sector: number): Uint8Array {
	const response = sendCommand(controller, 17, sector, 0xff, 1);
	expect(response).toEqual([0x00]);

	let token = 0xff;
	for (let index = 0; index < 32 && token === 0xff; index++) {
		token = controller.transferByte(0xff);
	}
	expect(token).toBe(0xfe);

	const data = new Uint8Array(512);
	for (let index = 0; index < data.length; index++) {
		data[index] = controller.transferByte(0xff);
	}

	controller.transferByte(0xff);
	controller.transferByte(0xff);
	return data;
}

function writeSector(controller: MicroSdCardController, sector: number, data: Uint8Array): void {
	expect(sendCommand(controller, 24, sector, 0xff)).toEqual([0x00]);
	controller.transferByte(0xfe);
	for (const value of data) {
		controller.transferByte(value);
	}
	controller.transferByte(0xff);
	controller.transferByte(0xff);
	expect(controller.transferByte(0xff)).toBe(0x05);
	controller.transferByte(0xff);
	controller.transferByte(0xff);
}

describe('MicroSdCardController', () => {
	it('initializes over SPI and exposes a valid MBR sector', () => {
		const controller = new MicroSdCardController();

		initializeCard(controller);
		const sector0 = readSector(controller, 0);

		expect(sector0[446 + 4]).toBe(0x04);
		expect(sector0[510]).toBe(0x55);
		expect(sector0[511]).toBe(0xaa);
	});

	it('persists written sectors for subsequent reads', () => {
		const controller = new MicroSdCardController();

		initializeCard(controller);
		const payload = new Uint8Array(512);
		payload[0] = 0x41;
		payload[1] = 0x56;
		payload[2] = 0x52;
		payload[3] = 0x38;
		payload[511] = 0x99;

		writeSector(controller, 8, payload);
		const reloaded = readSector(controller, 8);

		expect(reloaded).toEqual(payload);
	});

	it('stops responding when the card is removed', () => {
		const controller = new MicroSdCardController();

		initializeCard(controller);
		controller.setInserted(0);

		expect(controller.transferByte(0xff)).toBe(0xff);
	});
});