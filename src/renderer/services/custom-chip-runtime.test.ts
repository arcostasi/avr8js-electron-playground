import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AVRIOPort, AVRTWI } from 'avr8js';

import type { AVRRunner } from '../../shared/execute';
import { I2CBus } from '../../shared/i2c-bus';
import { createCustomChipCompatLayer } from './custom-chip-runtime-compat';
import type { ChipPinBridge } from './custom-chip-runtime-types';

type ImportFunction = (...args: unknown[]) => unknown;

function writeCString(memory: WebAssembly.Memory, ptr: number, text: string): void {
	const bytes = new Uint8Array(memory.buffer);
	for (let index = 0; index < text.length; index++) {
		bytes[ptr + index] = text.codePointAt(index) ?? 0;
	}
	bytes[ptr + text.length] = 0;
}

function createFakePort(): AVRIOPort {
	let value = 0;
	return {
		pinState: (bit: number) => ((value >> bit) & 1) as 0 | 1,
		setPin: (bit: number, high: boolean) => {
			value = high ? (value | (1 << bit)) : (value & ~(1 << bit));
		},
	} as unknown as AVRIOPort;
}

function createRunnerStub() {
	const completeTransfer = vi.fn();
	const serialWrite = vi.fn();
	const adcValues = new Map<number, number>();
	const runner = {
		cpu: {
			cycles: 0,
		},
		frequency: 16_000_000,
		adcRegistry: {
			setValue: vi.fn((channel: number, value: number) => {
				adcValues.set(channel, value);
			}),
			getChannel: vi.fn((channel: number) => adcValues.get(channel) ?? 0),
		},
		spi: {
			onByte: null,
			completeTransfer,
		},
		usart: {
			onByteTransmit: null,
		},
		twi: {},
		serialWrite,
	} as unknown as AVRRunner;

	return {
		runner,
		completeTransfer,
		serialWrite,
		adcValues,
	};
}

function createI2CBusStub(): I2CBus {
	const twi = {
		eventHandler: null,
		completeStart: vi.fn(),
		completeStop: vi.fn(),
		completeConnect: vi.fn(),
		completeWrite: vi.fn(),
		completeRead: vi.fn(),
	} as unknown as AVRTWI;
	return new I2CBus(twi);
}

function createCompat(importsList: WebAssembly.ModuleImportDescriptor[], pinBridge: ChipPinBridge[] = []) {
	vi.spyOn(WebAssembly.Module, 'imports').mockReturnValue(importsList);
	const { runner, completeTransfer, serialWrite, adcValues } = createRunnerStub();
	const i2cBus = createI2CBusStub();
	const compat = createCustomChipCompatLayer({} as WebAssembly.Module, {
		runner,
		chipName: 'test-chip',
		partId: 'chip1',
		pinBridge,
		i2cBus,
	});

	const memory = new WebAssembly.Memory({ initial: 2 });
	const table = new WebAssembly.Table({ element: 'externref', initial: 32 });
	compat.bindInstance({
		exports: {
			memory,
			__indirect_function_table: table,
		},
	} as unknown as WebAssembly.Instance);

	return {
		compat,
		env: compat.imports.env as Record<string, ImportFunction>,
		memory,
		table,
		runner,
		i2cBus,
		completeTransfer,
		serialWrite,
		adcValues,
	};
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('custom chip runtime compat', () => {
	it('supports virtual GPIO pins, DAC/ADC bridging, and watch callbacks', () => {
		const callback = vi.fn();
		const { env, compat, memory, table } = createCompat([
			{ module: 'env', name: 'pin_init', kind: 'function' },
			{ module: 'env', name: 'pin_write', kind: 'function' },
			{ module: 'env', name: 'pin_read', kind: 'function' },
			{ module: 'env', name: 'pin_watch', kind: 'function' },
			{ module: 'env', name: 'pin_dac_write', kind: 'function' },
			{ module: 'env', name: 'pin_adc_read', kind: 'function' },
		]);

		table.set(1, callback);
		writeCString(memory, 32, 'VIRTUAL0');
		const pinId = env.pin_init(32, 0);

		expect(pinId).toBe(0);
		expect(env.pin_read(pinId)).toBe(0);

		const view = new DataView(memory.buffer);
		view.setUint32(64, 3, true);
		view.setUint32(68, 1, true);
		view.setUint32(72, 99, true);
		expect(env.pin_watch(pinId, 64)).toBe(1);

		env.pin_write(pinId, 1);
		compat.poll();
		expect(callback).toHaveBeenCalledWith(99, pinId, 1);
		expect(env.pin_read(pinId)).toBe(1);

		env.pin_dac_write(pinId, 1.25);
		expect(env.pin_adc_read(pinId)).toBe(1.25);
		expect(env.pin_read(pinId)).toBe(0);
	});

	it('mirrors mapped chip analog outputs into the Arduino ADC registry', () => {
		const pinBridge: ChipPinBridge[] = [
			{ chipPinName: 'AOUT', arduinoPin: 'A0', port: createFakePort(), bit: 0, adcChannel: 0 },
		];
		const { env, adcValues } = createCompat([
			{ module: 'env', name: 'pin_write', kind: 'function' },
			{ module: 'env', name: 'pin_dac_write', kind: 'function' },
		], pinBridge);

		env.pin_write(0, 1);
		expect(adcValues.get(0)).toBe(1023);

		env.pin_dac_write(0, 1.25);
		expect(adcValues.get(0)).toBe(256);

		env.pin_write(0, 0);
		expect(adcValues.get(0)).toBe(0);
	});

	it('fires timer callbacks when simulated time advances', () => {
		const callback = vi.fn();
		const { env, compat, memory, table, runner } = createCompat([
			{ module: 'env', name: 'timer_init', kind: 'function' },
			{ module: 'env', name: 'timer_start', kind: 'function' },
		]);

		table.set(1, callback);
		const view = new DataView(memory.buffer);
		view.setUint32(16, 1, true);
		view.setUint32(20, 123, true);
		const timerId = env.timer_init(16);
		env.timer_start(timerId, 10, 1);

		runner.cpu.cycles = 320;
		compat.poll();

		expect(callback).toHaveBeenCalledTimes(2);
		expect(callback).toHaveBeenNthCalledWith(1, 123);
		expect(callback).toHaveBeenNthCalledWith(2, 123);
	});

	it('registers I2C devices and routes SPI/UART flows through the compat layer', async () => {
		const i2cConnect = vi.fn(() => 1);
		const i2cRead = vi.fn(() => 0x5A);
		const i2cWrite = vi.fn(() => 1);
		const i2cDisconnect = vi.fn();
		const uartRxData = vi.fn();
		const uartWriteDone = vi.fn();
		const spiDone = vi.fn();

		const pinBridge: ChipPinBridge[] = [
			{ chipPinName: 'RX', arduinoPin: '1', port: createFakePort(), bit: 0 },
			{ chipPinName: 'TX', arduinoPin: '0', port: createFakePort(), bit: 1 },
		];
		const { env, memory, table, i2cBus, runner, completeTransfer, serialWrite } = createCompat([
			{ module: 'env', name: 'i2c_init', kind: 'function' },
			{ module: 'env', name: 'uart_init', kind: 'function' },
			{ module: 'env', name: 'uart_write', kind: 'function' },
			{ module: 'env', name: 'spi_init', kind: 'function' },
			{ module: 'env', name: 'spi_start', kind: 'function' },
		], pinBridge);

		table.set(1, i2cConnect);
		table.set(2, i2cRead);
		table.set(3, i2cWrite);
		table.set(4, i2cDisconnect);
		table.set(5, uartRxData);
		table.set(6, uartWriteDone);
		table.set(7, spiDone);

		const view = new DataView(memory.buffer);
		view.setUint32(0, 0x42, true);
		view.setUint32(12, 1, true);
		view.setUint32(16, 2, true);
		view.setUint32(20, 3, true);
		view.setUint32(24, 4, true);
		view.setUint32(28, 77, true);
		expect(env.i2c_init(0)).toBe(1);

		const i2cDevice = i2cBus.devices[0x42];
		expect(i2cDevice).toBeDefined();
		expect(i2cDevice.i2cConnect(0x42, true)).toBe(true);
		expect(i2cDevice.i2cReadByte(true)).toBe(0x5A);
		expect(i2cDevice.i2cWriteByte(0x33)).toBe(true);
		i2cDevice.i2cDisconnect();
		expect(i2cConnect).toHaveBeenCalledWith(77, 0x42, true);
		expect(i2cRead).toHaveBeenCalledWith(77, true);
		expect(i2cWrite).toHaveBeenCalledWith(77, 0x33);
		expect(i2cDisconnect).toHaveBeenCalledWith(77);

		view.setUint32(96, 0, true);
		view.setUint32(100, 1, true);
		view.setUint32(108, 5, true);
		view.setUint32(112, 6, true);
		view.setUint32(116, 15, true);
		const uartId = env.uart_init(96);
		expect(uartId).toBe(1);

		(runner.usart.onByteTransmit as (value: number) => void)(0x41);
		expect(uartRxData).toHaveBeenCalledWith(15, 0x41);

		new Uint8Array(memory.buffer).set([0x4F, 0x4B], 128);
		expect(env.uart_write(uartId, 128, 2)).toBe(1);
		await Promise.resolve();
		expect(serialWrite).toHaveBeenCalledWith('OK');
		expect(uartWriteDone).toHaveBeenCalledWith(15);

		view.setUint32(216, 7, true);
		view.setUint32(220, 25, true);
		const spiId = env.spi_init(200);
		new Uint8Array(memory.buffer)[160] = 0xAA;
		env.spi_start(spiId, 160, 1);

		(runner.spi.onByte as (value: number) => void)(0x55);
		expect(completeTransfer).toHaveBeenCalledWith(0xAA);
		expect(new Uint8Array(memory.buffer)[160]).toBe(0x55);
		expect(spiDone).toHaveBeenCalledWith(25, 160, 1);
	});
});