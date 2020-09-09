/**
 * SSD1306
 * Part of AVR8js
 *
 * Copyright (C) 2019, Uri Shaked
 */
import { I2CDevice } from "./i2c-bus";

// Datasheet: https://cdn-shop.adafruit.com/datasheets/SSD1306.pdf

export const SSD1306_ADDR_32 = 0x3c; // For 32 bit tall display
export const SSD1306_ADDR_OTHER = 0x3d; // For others

const SSD1306_MODE_CMD = 0x0;
const SSD1306_MODE_DATA = 0x40;

const CMD_MEMORY_MODE = 0x20;
const CMD_COLUMN_ADDR = 0x21;
const CMD_PAGE_ADDR = 0x22;
const CMD_SET_CONTRAST = 0x81;
const CMD_CHARGE_PUMP = 0x8d;
const CMD_SEG_REMAP_OFF = 0xa0;
const CMD_SEG_REMAP_ON = 0xa1;
const CMD_DISPLAY_ALL_ON_RESUME = 0xa4;
const CMD_DISPLAY_ALL_ON = 0xa5;
const CMD_NORMAL_DISPLAY = 0xa6;
const CMD_INVERT_DISPLAY = 0xa7;
const CMD_SET_MULTIPLEX = 0xa8;
const CMD_DISPLAY_OFF = 0xae;
const CMD_DISPLAY_ON = 0xaf;
const CMD_COM_SCAN_INC = 0xc0;
const CMD_COM_SCAN_DEC = 0xc8;
const CMD_SET_DISPLAY_OFFSET = 0xd3;
const CMD_SET_DISPLAY_CLOCK_DIV = 0xd5;
const CMD_SET_PRECHARGE = 0xd9;
const CMD_SET_COM_PINS = 0xda;
const CMD_SET_VCOM_DESELECT = 0xdb;
const CMD_NOP = 0xe3;

const CMD_RIGHT_HORIZONTAL_SCROLL = 0x26;
const CMD_LEFT_HORIZONTAL_SCROLL = 0x27;
const CMD_VERTICAL_AND_RIGHT_HORIZONTAL_SCROLL = 0x29;
const CMD_VERTICAL_AND_LEFT_HORIZONTAL_SCROLL = 0x2a;
const CMD_DEACTIVATE_SCROLL = 0x2e;
const CMD_ACTIVATE_SCROLL = 0x2f;
const CMD_SET_VERTICAL_SCROLL_AREA = 0xa3;

const MEM_MODE_HORIZONTAL_ADDRESSING = 0;
const MEM_MODE_VERTICAL_ADDRESSING = 1;
const MEM_MODE_PAGE_ADDRESSING = 2;

/**
 * Specifies the number of parameter bytes for each multi-byte command
 */
const multiByteCommands: { [key: number]: number } = {
  [CMD_SET_CONTRAST]: 1,
  [CMD_RIGHT_HORIZONTAL_SCROLL]: 6,
  [CMD_LEFT_HORIZONTAL_SCROLL]: 6,
  [CMD_VERTICAL_AND_RIGHT_HORIZONTAL_SCROLL]: 5,
  [CMD_VERTICAL_AND_LEFT_HORIZONTAL_SCROLL]: 5,
  [CMD_SET_VERTICAL_SCROLL_AREA]: 2,
  [CMD_MEMORY_MODE]: 1,
  [CMD_COLUMN_ADDR]: 2,
  [CMD_PAGE_ADDR]: 2,
  [CMD_SET_MULTIPLEX]: 1,
  [CMD_SET_DISPLAY_OFFSET]: 1,
  [CMD_SET_COM_PINS]: 1,
  [CMD_SET_DISPLAY_CLOCK_DIV]: 1,
  [CMD_SET_PRECHARGE]: 1,
  [CMD_SET_VCOM_DESELECT]: 1,
  [CMD_CHARGE_PUMP]: 1,
};

type number3bits = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

// Defined in page 28 of the datasheet, frames per scroll step
const scrollSpeeds = {
  0b000: 5,
  0b001: 64,
  0b010: 128,
  0b011: 256,
  0b100: 3,
  0b101: 4,
  0b110: 25,
  0b111: 2,
};

// Oscillator frequency defined in page 49 of the datasheet
const fOsc = 370000; // Hz

export interface ISSD1306Frame {
  pixels: Uint8Array;
  contrast: number;
  invert: boolean;
  scrollOffset: number;
  startLine: number;
}

export class SSD1306Controller implements I2CDevice {
  readonly width = 128;
  readonly height = 64;
  readonly pixels = new Uint8Array((this.width * this.height) / 8);

  // Display settings
  private displayOn = false;
  private updated = false;
  private scrollActive = false;
  private contrast = 0;
  private invert = false;

  // Speed and timing settings
  private clockDivider = 0;
  private multiplexRatio = 0;
  private phase1 = 0;
  private phase2 = 0;
  private nextScrollTime = 0;

  // Memory and addressing settings
  private activeColumn = 0;
  private columnStart = 0;
  private columnEnd = 0;
  private activePage = 0;
  private pageStart = 0;
  private pageEnd = 0;
  private memoryMode = 0;

  private startLine = 0;

  private scrollRight = false;
  private scrollVertical = false;
  private scrollStartPage = 0;
  private scrollEndPage = 0;
  private scrollSpeed: number3bits = 0;
  private verticalOffset = 0;
  private scrollOffset = 0;

  // Command parsing state machine
  private firstByte = true;
  private commandMode = false;
  private currentCommandIndex = 0;
  private currentCommandLength = 0;
  private currentCommand = new Uint8Array(8);

  constructor(
    private cpuMillis: () => number,
  ) {
    this.reset();
  }

  update() {
    let result = null;

    if (this.scrollActive && this.cpuMillis() > this.nextScrollTime) {
      this.scroll();
      this.calculateNextScroll();
    }

    if (this.updated) {
      const { pixels, invert, contrast, scrollOffset, startLine } = this;
      result = { pixels, invert, contrast, scrollOffset, startLine };
      this.updated = false;
    }

    return result;
  }

  toImageData(target: ImageData) {
    const { pixels, invert, scrollOffset, width, height } = this;
    const { data } = target;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const virtualY = (y + scrollOffset) % height;
        const pixIndex = Math.floor(virtualY / 8) * width + x;
        const pixValue = pixels[pixIndex] & (1 << virtualY % 8) ? !invert : invert;
        const dataOffset = (y * target.width + x) * 4;
        data.fill(pixValue ? 0xff : 0, dataOffset, dataOffset + 3);
        data[dataOffset + 3] = 0xff;
      }
    }
  }

  reset() {
    this.memoryMode = MEM_MODE_PAGE_ADDRESSING;
    this.contrast = 0x7f;
    this.clockDivider = 1;
    this.multiplexRatio = 63;
    this.phase1 = 2;
    this.phase2 = 2;
    this.scrollActive = false;
    this.currentCommandIndex = 0;
    this.activeColumn = 0;
    this.columnStart = 0;
    this.columnEnd = 127;
    this.activePage = 0;
    this.pageStart = 0;
    this.pageEnd = 7;
    this.startLine = 0;
    this.invert = false;
  }

  i2cConnect() {
    this.firstByte = true;
    return true;
  }

  i2cReadByte(): number {
    return 0xff;
  }

  i2cWriteByte(value: number) {
    if (this.firstByte) {
      this.commandMode = value === SSD1306_MODE_CMD;
      this.firstByte = false;

      return value === SSD1306_MODE_CMD || value === SSD1306_MODE_DATA;
    }

    if (this.commandMode) {
      this.processCommand(value);
    } else {
      this.processData(value);
    }

    return true;
  }

  processCommand(value: number) {
    this.currentCommand[this.currentCommandIndex] = value;

    if (!this.currentCommandIndex) {
      this.currentCommandLength = 1 + (multiByteCommands[value] || 0);
    }

    this.currentCommandIndex++;

    if (this.currentCommandIndex < this.currentCommandLength) {
      // Wait for the next command byte
      return;
    }

    const commandCode = this.currentCommand[0];
    let autoUpdate = false;

    switch (commandCode) {
      case CMD_SET_CONTRAST:
        this.contrast = this.currentCommand[1];
        autoUpdate = true;
        break;

      case CMD_DISPLAY_OFF:
        this.displayOn = false;
        this.updated = true;
        break;

      case CMD_DISPLAY_ON:
        this.displayOn = true;
        this.updated = true;
        break;

      case CMD_NORMAL_DISPLAY:
        this.invert = false;
        autoUpdate = true;
        break;

      case CMD_INVERT_DISPLAY:
        this.invert = true;
        autoUpdate = true;
        break;

      case CMD_NOP:
        break;

      case CMD_MEMORY_MODE:
        this.memoryMode = this.currentCommand[1] & 0x3;
        break;

      case CMD_COLUMN_ADDR:
        this.activeColumn = this.columnStart;
        this.columnStart = this.currentCommand[1] & 0x7f;
        this.columnEnd = this.currentCommand[2] & 0x7f;
        break;

      case CMD_PAGE_ADDR:
        this.activePage = this.pageStart;
        this.pageStart = this.currentCommand[1] & 0x7;
        this.pageEnd = this.currentCommand[2] & 0x7;
        break;

      case CMD_DEACTIVATE_SCROLL:
        this.scrollOffset = 0;
        this.scrollActive = false;
        break;

      case CMD_ACTIVATE_SCROLL:
        this.scrollActive = true;
        this.calculateNextScroll();
        break;

      case CMD_RIGHT_HORIZONTAL_SCROLL:
      case CMD_LEFT_HORIZONTAL_SCROLL:
        this.scrollVertical = false;
        this.scrollRight = commandCode === CMD_RIGHT_HORIZONTAL_SCROLL;
        this.scrollStartPage = this.currentCommand[2] & 0x7;
        this.scrollSpeed = (this.currentCommand[3] & 0x7) as number3bits;
        this.scrollEndPage = this.currentCommand[4] & 0x7;
        break;

      case CMD_VERTICAL_AND_RIGHT_HORIZONTAL_SCROLL:
      case CMD_VERTICAL_AND_LEFT_HORIZONTAL_SCROLL:
        this.scrollRight = commandCode === CMD_VERTICAL_AND_RIGHT_HORIZONTAL_SCROLL;
        this.scrollStartPage = this.currentCommand[2] & 0x7;
        this.scrollSpeed = (this.currentCommand[3] & 0x7) as number3bits;
        this.scrollEndPage = this.currentCommand[4] & 0x7;
        this.verticalOffset = this.currentCommand[5] & 0x3f;
        this.scrollVertical = this.verticalOffset > 0;
        break;

      case CMD_SET_DISPLAY_CLOCK_DIV:
        this.clockDivider = 1 + (this.currentCommand[1] & 0xf);
        break;

      case CMD_SET_PRECHARGE:
        this.phase1 = this.currentCommand[1] & 0xf;
        this.phase2 = (this.currentCommand[1] >> 4) & 0xf;
        break;

      case CMD_CHARGE_PUMP:
      case CMD_SET_DISPLAY_OFFSET:
      case CMD_SET_MULTIPLEX:
      case CMD_COM_SCAN_INC:
      case CMD_COM_SCAN_DEC:
      case CMD_SET_PRECHARGE:
      case CMD_SET_COM_PINS:
      case CMD_SET_VCOM_DESELECT:
      case CMD_SEG_REMAP_OFF:
      case CMD_SEG_REMAP_ON:
      case CMD_SET_VERTICAL_SCROLL_AREA:
      case CMD_DISPLAY_ALL_ON:
      case CMD_DISPLAY_ALL_ON_RESUME:
        // not implemented
        break;

      default:
        if (commandCode <= 0x0f) {
          this.activeColumn = (this.activeColumn & 0xf0) | commandCode;
          break;
        }

        if (commandCode >= 0x10 && commandCode <= 0x1f) {
          this.activeColumn = (this.activeColumn & 0x0f) | ((commandCode & 0x0f) << 4);
          break;
        }

        if (commandCode >= 0x40 && commandCode <= 0x7f) {
          this.startLine = commandCode & 0x3f;
          autoUpdate = true;
          break;
        }

        if (commandCode >= 0xb0 && commandCode <= 0xb7) {
          this.activePage = commandCode & 0x7;
          break;
        }

        console.warn(
          'Unknown SSD1306 Command',
          commandCode.toString(16),
          this.currentCommand.slice(1, this.currentCommandIndex),
        );
    }

    if (autoUpdate && this.displayOn) {
      this.updated = true;
    }

    // Reset command buffer index, ready to read the next command
    this.currentCommandIndex = 0;
  }

  processData(value: number) {
    const target = this.activePage * this.width + this.activeColumn;
    this.pixels[target] = value;

    // Memory modes are explained in pages 34-35 of the datasheet,
    // and determine how the order of writing the pixels to the
    // display RAM.
    switch (this.memoryMode) {
      case MEM_MODE_HORIZONTAL_ADDRESSING:
        this.activeColumn++;
        if (this.activeColumn > this.columnEnd) {
          this.activeColumn = this.columnStart;
          this.activePage++;
          if (this.activePage > this.pageEnd) {
            this.activePage = this.pageStart;
          }
        }

        break;

      case MEM_MODE_VERTICAL_ADDRESSING:
        this.activePage++;

        if (this.activePage > this.pageEnd) {
          this.activePage = this.pageStart;
          this.activeColumn++;
          if (this.activeColumn > this.columnEnd) {
            this.activeColumn = this.columnStart;
          }
        }

        break;

      case MEM_MODE_PAGE_ADDRESSING:
      default:
        this.activeColumn++;

        if (this.activeColumn > this.width) {
          this.activeColumn = 0;
          this.activePage++;
        }

        break;
    }

    this.updated = true;
  }

  i2cDisconnect() {}

  private scroll() {
    // TODO clock
    const pageSize = this.width;

    for (let page = this.scrollStartPage; page <= this.scrollEndPage; page++) {
      const pageStart = page * pageSize;

      if (this.scrollRight) {
        const last = this.pixels[pageStart + pageSize - 1];

        this.pixels.set(this.pixels.slice(pageStart, pageStart + pageSize - 1), pageStart + 1);
        this.pixels[pageStart] = last;
      } else {
        const first = this.pixels[pageStart];

        this.pixels.set(this.pixels.slice(pageStart + 1, pageStart + pageSize), pageStart);
        this.pixels[pageStart + pageSize - 1] = first;
      }

      this.updated = true;
    }

    if (this.scrollVertical) {
      this.scrollOffset = (this.scrollOffset + this.verticalOffset) % this.height;
    }
  }

  get scrollFrameTime() {
    return (1000 * scrollSpeeds[this.scrollSpeed]) / this.frameFrequency;
  }

  calculateNextScroll() {
    this.nextScrollTime = this.cpuMillis() + this.scrollFrameTime;
  }

  get frameFrequency() {
    // Taken from section 8.3 (page 22) of the datasheet
    const K = this.phase1 + this.phase2 + 50;
    return fOsc / (this.clockDivider * K * (1 + this.multiplexRatio));
  }
}
