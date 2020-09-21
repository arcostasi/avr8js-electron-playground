/**
 * LCD1602
 * Part of AVR8js Electron Playground
 *
 * Copyright (C) 2019, Uri Shaked
 * Copyright (C) 2020, Anderson Costa
 */
import { I2CDevice } from "./i2c-bus";
import { LCD1602Element } from '@wokwi/elements';

export const LCD1602_ADDR          = 0x27;

const LCD_MODE_CMD                 = 0x00;
const LCD_MODE_DATA                = 0x40;

const LCD_CMD_CLEAR                = 0x01;
const LCD_CMD_HOME                 = 0x02;

const LCD_CMD_ENTRY_MODE           = 0x04;
const LCD_CMD_ENTRY_MODE_INCREMENT = 0x02;
const LCD_CMD_ENTRY_MODE_DECREMENT = 0x00;
const LCD_CMD_ENTRY_MODE_SHIFT     = 0x01;

const LCD_CMD_DISPLAY_CONTROL      = 0x08;
const LCD_CMD_DISPLAY_ENABLE       = 0x04;
const LCD_CMD_DISPLAY_CURSOR       = 0x02;
const LCD_CMD_DISPLAY_CURSOR_BLINK = 0x01;

const LCD_CMD_SHIFT                = 0x10;
const LCD_CMD_SHIFT_CURSOR         = 0x00;
const LCD_CMD_SHIFT_DISPLAY        = 0x08;
const LCD_CMD_SHIFT_LEFT           = 0x00;
const LCD_CMD_SHIFT_RIGHT          = 0x04;

const LCD_CMD_FUNCTION             = 0x20;
const LCD_CMD_FUNCTION_LCD_1LINE   = 0x00;
const LCD_CMD_FUNCTION_LCD_2LINE   = 0x08;
const LCD_CMD_FUNCTION_5x10_DOTS   = 0x04;

const LCD_CMD_SET_CGRAM_ADDR       = 0x40;
const LCD_CMD_SET_DRAM_ADDR        = 0x80;

// Extra
const LCD_CMD_SET_CONTRAST         = 0x81;

// Oscillator frequency defined in datasheet is 270 kHz
const fOsc = 270000;

export class LCD1602Controller implements I2CDevice {
  // RAM settings
  private cgram = new Uint8Array(64);
  private ddram = new Uint8Array(128);

  // Memory and addressing settings
  private addr = 0x00;  // Address
  private shift = 0x00; // Shift Register
  private data = 0x00;  // Data Register

  // Display settings
  private displayOn = false;
  private blinkOn = false;
  private cursorOn = false;
  private backlight = false;

  // Command parsing state machine
  private firstByte = true;
  private commandMode = false;
  private cgramMode = false;
  private cgramUpdated = true;
  private incrementMode = true;
  private shiftMode = false;
  private is8bit = true;
  private updated = false;

  constructor(
    private cpuMillis: () => number,
  ) {
    this.render();
  }

  update() {
    if (this.updated) {
      this.updated = false;
      return this.render();
    }

    return false;
  }

  render() {
    let characters = new Uint8Array(32);

    if (this.displayOn) {
        const r1 = this.shift % 64;
        const r2 = 64 + this.shift % 64;
        // Set characters
        characters.set(this.ddram.slice(r1, r1 + 16));
        characters.set(this.ddram.slice(r2, r2 + 16), 16);
    } else {
      characters.fill(32);
    }

    const result = ({
        blink: this.blinkOn,
        cursor: this.cursorOn,
        cursorX: this.addr % 64,
        cursorY: Math.floor(this.addr / 64),
        characters: characters,
        backlight: this.backlight,
        cgram: this.cgram,
        cgramUpdated: this.cgramUpdated,
    });

    this.cgramUpdated = false;

    return result;
  }

  backlightOn(value: boolean) {
    if (this.backlight !== value) {
      this.backlight = value;
    }
  }

  i2cConnect() {
    return true;
  }

  i2cDisconnect() {}

  i2cReadByte(): number {
    return 0xff;
  }

  i2cWriteByte(value: number) {
    const data = value & 0xF0;
    const rs = (value & 0x01) ? true : false; // Register Select
    const bl = (value & LCD_CMD_DISPLAY_CONTROL) ? true : false;

    // Turn on/off backlight
    this.backlightOn(bl);

    // Check data write
    if ((value & 0x04) && !(value & 0x02)) {
     this.writeData(data, rs);
    }

    return this.updated = true;
  }

  writeData(value: number, rs: boolean) {
    if (!this.is8bit) {
      // Check register
      if (this.firstByte) {
        this.firstByte = false;
        this.data = value;
        return false;
      }

      value = this.data | value >> 4;

      this.firstByte = true;
    }

    if (rs) {
      this.processData(value);
    } else {
      this.processCommand(value);
    }

    this.updated = true;
  }

  processCommand(value: number) {
    // Check commands
    if (value & LCD_CMD_FUNCTION) {
      this.is8bit = (value & 0x10) ? true : false;
    } else if (value & LCD_CMD_SET_DRAM_ADDR) {
      this.cgramMode = false;
      this.addr = value & 0x7F;
    } else if (value & LCD_CMD_SET_CGRAM_ADDR) {
      this.cgramMode = true;
      this.addr = value & 0x3F;
    } else if (value & LCD_CMD_SHIFT) {
      const shiftDisplay = (value & LCD_CMD_SHIFT_DISPLAY) ? true : false;
      const shiftRight = (value & LCD_CMD_SHIFT_RIGHT) ? 1 : -1;

      this.cgramMode = false;
      this.addr = (this.addr + shiftRight) % 128;

      if (shiftDisplay) {
        this.shift = (this.shift + shiftRight) % 64;
      }
    } else if (value & LCD_CMD_DISPLAY_CONTROL) {
      this.displayOn = (value & LCD_CMD_DISPLAY_ENABLE) ? true : false;
      this.blinkOn = (value & LCD_CMD_DISPLAY_CURSOR_BLINK) ? true : false;
      this.cursorOn = (value & LCD_CMD_DISPLAY_CURSOR) ? true : false;
    } else if (value & LCD_CMD_ENTRY_MODE) {
      this.cgramMode = false;
      this.incrementMode = (value & LCD_CMD_ENTRY_MODE_INCREMENT) ? true : false;
      this.shiftMode = (value & LCD_CMD_ENTRY_MODE_SHIFT) ? true : false;
    } else if (value & LCD_CMD_HOME) {
      this.cgramMode = false;
      this.addr = 0x00;
      this.shift = 0x00;
    } else if (value & LCD_CMD_CLEAR) {
      this.cgramMode = false;
      this.incrementMode = true;
      this.addr = 0x00;
      this.shift = 0x00;
      this.ddram.fill(32);
    } else {
      console.warn(
        'Unknown LCD1602 Command',
        value.toString(16),
      );
    }
  }

  processData(value: number) {
    // Check RAM type
    if (this.cgramMode) {
      // CGRAM
     const data = (value & 0x01) << 4 | (value & 0x02) << 2 | (value & 0x04) | (value & 0x08) >> 2 | (value & 0x10) >> 4;

     this.cgram[this.addr] = data;
     this.addr = (this.addr + 1) % 64;
     this.cgramUpdated = true;
    } else {
      // DRAM
      const mode = this.incrementMode ? 1 : -1;

      this.ddram[this.addr] = value;
      this.addr = (this.addr + mode) % 128,
      this.shiftMode && (this.shift = (this.shift + mode) % 40);
    }
  }
}
