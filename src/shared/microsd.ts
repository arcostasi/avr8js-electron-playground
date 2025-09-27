const SECTOR_SIZE = 512;
const TOTAL_SECTORS = 8192;
const PARTITION_START = 1;
const PARTITION_SECTORS = TOTAL_SECTORS - PARTITION_START;
const RESERVED_SECTORS = 1;
const FAT_COUNT = 2;
const FAT_SECTORS = 32;
const ROOT_ENTRIES = 512;
const SECTORS_PER_CLUSTER = 1;
const CMD0 = 0;
const CMD8 = 8;
const CMD9 = 9;
const CMD10 = 10;
const CMD12 = 12;
const CMD13 = 13;
const CMD16 = 16;
const CMD17 = 17;
const CMD24 = 24;
const CMD55 = 55;
const CMD58 = 58;
const ACMD41 = 41;

function setWord(view: DataView, offset: number, value: number): void {
	view.setUint16(offset, value & 0xffff, true);
}

function setDWord(view: DataView, offset: number, value: number): void {
	view.setUint32(offset, value >>> 0, true);
}

function writeText(target: Uint8Array, offset: number, text: string, length: number): void {
	for (let index = 0; index < length; index++) {
		const codePoint = index < text.length ? text.codePointAt(index) : undefined;
		target[offset + index] = typeof codePoint === 'number' ? codePoint : 0x20;
	}
}

function createCsdRegister(): Uint8Array {
	const csd = new Uint8Array(16);
	csd[0] = 0x40;
	csd[1] = 0x0e;
	csd[2] = 0x00;
	csd[3] = 0x32;
	csd[4] = 0x5b;
	csd[5] = 0x59;
	csd[6] = 0x00;
	csd[7] = 0x00;
	csd[8] = 0x1d;
	csd[9] = 0x7f;
	csd[10] = 0x80;
	csd[11] = 0x0a;
	csd[12] = 0x40;
	csd[13] = 0x00;
	csd[14] = 0x00;
	csd[15] = 0x01;
	return csd;
}

function createCidRegister(): Uint8Array {
	const cid = new Uint8Array(16);
	cid[0] = 0x03;
	writeText(cid, 1, 'AV', 2);
	writeText(cid, 3, 'R8J5', 5);
	cid[8] = 0x10;
	cid[9] = 0x12;
	cid[10] = 0x34;
	cid[11] = 0x56;
	cid[12] = 0x01;
	cid[13] = 0x7a;
	cid[14] = 0x00;
	cid[15] = 0x01;
	return cid;
}

function createFat16Image(): Uint8Array {
	const image = new Uint8Array(TOTAL_SECTORS * SECTOR_SIZE);

	const mbr = image.subarray(0, SECTOR_SIZE);
	const mbrView = new DataView(mbr.buffer, mbr.byteOffset, mbr.byteLength);
	const partOffset = 446;
	mbr[partOffset + 0] = 0x00;
	mbr[partOffset + 4] = 0x04;
	setDWord(mbrView, partOffset + 8, PARTITION_START);
	setDWord(mbrView, partOffset + 12, PARTITION_SECTORS);
	mbr[510] = 0x55;
	mbr[511] = 0xaa;

	const boot = image.subarray(PARTITION_START * SECTOR_SIZE, (PARTITION_START + 1) * SECTOR_SIZE);
	const bootView = new DataView(boot.buffer, boot.byteOffset, boot.byteLength);
	boot[0] = 0xeb;
	boot[1] = 0x3c;
	boot[2] = 0x90;
	writeText(boot, 3, 'MSDOS5.0', 8);
	setWord(bootView, 11, SECTOR_SIZE);
	boot[13] = SECTORS_PER_CLUSTER;
	setWord(bootView, 14, RESERVED_SECTORS);
	boot[16] = FAT_COUNT;
	setWord(bootView, 17, ROOT_ENTRIES);
	setWord(bootView, 19, PARTITION_SECTORS);
	boot[21] = 0xf8;
	setWord(bootView, 22, FAT_SECTORS);
	setWord(bootView, 24, 32);
	setWord(bootView, 26, 64);
	setDWord(bootView, 28, PARTITION_START);
	setDWord(bootView, 32, 0);
	boot[36] = 0x80;
	boot[38] = 0x29;
	setDWord(bootView, 39, 0x41565238);
	writeText(boot, 43, 'AVR8JS SD  ', 11);
	writeText(boot, 54, 'FAT16   ', 8);
	boot[510] = 0x55;
	boot[511] = 0xaa;

	for (let fatIndex = 0; fatIndex < FAT_COUNT; fatIndex++) {
		const fatStart = (PARTITION_START + RESERVED_SECTORS + (fatIndex * FAT_SECTORS)) * SECTOR_SIZE;
		image[fatStart + 0] = 0xf8;
		image[fatStart + 1] = 0xff;
		image[fatStart + 2] = 0xff;
		image[fatStart + 3] = 0xff;
	}

	const rootStart = (PARTITION_START + RESERVED_SECTORS + (FAT_COUNT * FAT_SECTORS)) * SECTOR_SIZE;
	const volumeEntry = image.subarray(rootStart, rootStart + 32);
	writeText(volumeEntry, 0, 'AVR8JS SD', 11);
	volumeEntry[11] = 0x08;

	return image;
}

type PendingWrite = {
	sector: number;
	bytes: number[];
	awaitingToken: boolean;
};

export class MicroSdCardController {
	private readonly image = createFat16Image();
	private readonly responseQueue: number[] = [];
	private readonly cmdBuffer: number[] = [];
	private readonly csd = createCsdRegister();
	private readonly cid = createCidRegister();
	private inserted = true;
	private selected = false;
	private idle = true;
	private appCommandPending = false;
	private pendingWrite: PendingWrite | null = null;
	private readonly highCapacity = true;

	beginTransaction(): void {
		this.selected = true;
	}

	endTransaction(): void {
		this.selected = false;
		this.responseQueue.length = 0;
		this.cmdBuffer.length = 0;
		this.pendingWrite = null;
		this.appCommandPending = false;
	}

	isInserted(): number {
		return this.inserted ? 1 : 0;
	}

	setInserted(value: number): void {
		this.inserted = value >= 0.5;
		if (!this.inserted) {
			this.endTransaction();
			this.idle = true;
		}
	}

	transferByte(value: number): number {
		if (!this.selected || !this.inserted) {
			return 0xff;
		}

		if (this.responseQueue.length > 0) {
			return this.responseQueue.shift() ?? 0xff;
		}

		if (this.pendingWrite) {
			this.handleWriteByte(value);
			return 0xff;
		}

		if (this.cmdBuffer.length > 0 || (value & 0xc0) === 0x40) {
			this.cmdBuffer.push(value);
			if (this.cmdBuffer.length === 6) {
				this.handleCommand(this.cmdBuffer);
				this.cmdBuffer.length = 0;
			}
			return 0xff;
		}

		return 0xff;
	}

	private handleWriteByte(value: number): void {
		const pendingWrite = this.pendingWrite;
		if (!pendingWrite) {
			return;
		}

		if (pendingWrite.awaitingToken) {
			if (value === 0xfe) {
				pendingWrite.awaitingToken = false;
			}
			return;
		}

		pendingWrite.bytes.push(value & 0xff);
		if (pendingWrite.bytes.length >= SECTOR_SIZE + 2) {
			const sectorData = pendingWrite.bytes.slice(0, SECTOR_SIZE);
			this.writeSector(pendingWrite.sector, sectorData);
			this.pendingWrite = null;
			this.responseQueue.push(0x05, 0x00, 0xff);
		}
	}

	private handleCommand(packet: number[]): void {
		const command = packet[0] & 0x3f;
		const arg = ((packet[1] << 24) >>> 0)
			| (packet[2] << 16)
			| (packet[3] << 8)
			| packet[4];

		switch (command) {
			case CMD0:
				this.idle = true;
				this.appCommandPending = false;
				this.responseQueue.push(0x01);
				break;

			case CMD8:
				this.responseQueue.push(0x01, 0x00, 0x00, 0x01, 0xaa);
				break;

			case CMD55:
				this.appCommandPending = true;
				this.responseQueue.push(this.idle ? 0x01 : 0x00);
				break;

			case ACMD41:
				if (this.appCommandPending) {
					this.idle = false;
					this.appCommandPending = false;
					this.responseQueue.push(0x00);
				} else {
					this.responseQueue.push(0x05);
				}
				break;

			case CMD58:
				this.responseQueue.push(this.idle ? 0x01 : 0x00, 0x40, 0x00, 0x00, 0x00);
				break;

			case CMD16:
				this.responseQueue.push(arg === SECTOR_SIZE ? 0x00 : 0x04);
				break;

			case CMD17:
				this.queueDataBlock(this.readSector(this.resolveSector(arg)));
				break;

			case CMD24:
				this.pendingWrite = {
					sector: this.resolveSector(arg),
					bytes: [],
					awaitingToken: true,
				};
				this.responseQueue.push(0x00);
				break;

			case CMD9:
				this.queueRegister(this.csd);
				break;

			case CMD10:
				this.queueRegister(this.cid);
				break;

			case CMD12:
				this.responseQueue.push(0x00);
				break;

			case CMD13:
				this.responseQueue.push(0x00, 0x00);
				break;

			default:
				this.responseQueue.push(this.idle ? 0x01 : 0x00);
				break;
		}
	}

	private queueRegister(register: Uint8Array): void {
		this.responseQueue.push(this.idle ? 0x01 : 0x00);
		if (!this.idle) {
			this.responseQueue.push(0xff, 0xfe, ...register, 0xff, 0xff);
		}
	}

	private queueDataBlock(data: Uint8Array): void {
		this.responseQueue.push(this.idle ? 0x01 : 0x00);
		if (!this.idle) {
			this.responseQueue.push(0xff, 0xfe, ...data, 0xff, 0xff);
		}
	}

	private resolveSector(arg: number): number {
		if (this.highCapacity) {
			return arg >>> 0;
		}
		return Math.floor(arg / SECTOR_SIZE) >>> 0;
	}

	private readSector(sector: number): Uint8Array {
		const offset = sector * SECTOR_SIZE;
		return this.image.slice(offset, offset + SECTOR_SIZE);
	}

	private writeSector(sector: number, data: number[]): void {
		if (sector < 0 || sector >= TOTAL_SECTORS) {
			return;
		}
		const offset = sector * SECTOR_SIZE;
		this.image.set(data, offset);
		if (sector === PARTITION_START) {
			this.image[offset + 510] = 0x55;
			this.image[offset + 511] = 0xaa;
		}
	}
}
