/**
 * LCD2004
 * 4×20 character LCD controller (HD44780 compatible via I2C).
 * Same I2C protocol as LCD1602 but renders 80 characters (4 rows × 20 columns).
 *
 * DDRAM address map:
 *   Row 0: 0x00 - 0x13
 *   Row 1: 0x40 - 0x53
 *   Row 2: 0x14 - 0x27
 *   Row 3: 0x54 - 0x67
 */
import { I2CDevice } from "./i2c-bus";

export const LCD2004_ADDR = 0x27;

const LCD_CMD_CLEAR = 0x01;
const LCD_CMD_HOME = 0x02;
const LCD_CMD_ENTRY_MODE = 0x04;
const LCD_CMD_ENTRY_MODE_INCREMENT = 0x02;
const LCD_CMD_ENTRY_MODE_SHIFT = 0x01;
const LCD_CMD_DISPLAY_CONTROL = 0x08;
const LCD_CMD_DISPLAY_ENABLE = 0x04;
const LCD_CMD_DISPLAY_CURSOR = 0x02;
const LCD_CMD_DISPLAY_CURSOR_BLINK = 0x01;
const LCD_CMD_SHIFT = 0x10;
const LCD_CMD_SHIFT_DISPLAY = 0x08;
const LCD_CMD_SHIFT_RIGHT = 0x04;
const LCD_CMD_FUNCTION = 0x20;
const LCD_CMD_SET_CGRAM_ADDR = 0x40;
const LCD_CMD_SET_DRAM_ADDR = 0x80;

export class LCD2004Controller implements I2CDevice {
    private cgram = new Uint8Array(64);
    private ddram = new Uint8Array(128);
    private addr = 0x00;
    private shift = 0x00;
    private data = 0x00;
    private displayOn = false;
    private blinkOn = false;
    private cursorOn = false;
    private backlight = false;
    private firstByte = true;
    private commandMode = false;
    private cgramMode = false;
    private cgramUpdated = true;
    private incrementMode = true;
    private shiftMode = false;
    private is8bit = true;
    private updated = false;

    constructor(private cpuMillis: () => number) {
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
        const characters = new Uint8Array(80);

        if (this.displayOn) {
            const s = this.shift;
            // Row 0: DDRAM 0x00+ (first 20 of lower bank)
            for (let i = 0; i < 20; i++) characters[i] = this.ddram[(0 + s + i) % 40];
            // Row 1: DDRAM 0x40+ (first 20 of upper bank)
            for (let i = 0; i < 20; i++) characters[20 + i] = this.ddram[64 + (0 + s + i) % 40];
            // Row 2: DDRAM 0x14+ (next 20 of lower bank)
            for (let i = 0; i < 20; i++) characters[40 + i] = this.ddram[(20 + s + i) % 40];
            // Row 3: DDRAM 0x54+ (next 20 of upper bank)
            for (let i = 0; i < 20; i++) characters[60 + i] = this.ddram[64 + (20 + s + i) % 40];
        } else {
            characters.fill(32);
        }

        const result = {
            blink: this.blinkOn,
            cursor: this.cursorOn,
            cursorX: this.addr % 64,
            cursorY: Math.floor(this.addr / 64),
            characters,
            backlight: this.backlight,
            cgram: this.cgram,
            cgramUpdated: this.cgramUpdated,
        };

        this.cgramUpdated = false;
        return result;
    }

    backlightOn(value: boolean) {
        if (this.backlight !== value) {
            this.backlight = value;
        }
    }

    i2cConnect() { return true; }
    i2cDisconnect() { /* no-op */ }
    i2cReadByte(): number { return 0xff; }

    i2cWriteByte(value: number) {
        const data = value & 0xF0;
        const rs = (value & 0x01) ? true : false;
        const bl = (value & LCD_CMD_DISPLAY_CONTROL) ? true : false;
        this.backlightOn(bl);
        if ((value & 0x04) && !(value & 0x02)) {
            this.writeData(data, rs);
        }
        return this.updated = true;
    }

    writeData(value: number, rs: boolean) {
        if (!this.is8bit) {
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
        if (value & LCD_CMD_FUNCTION) {
            this.is8bit = (value & 0x10) ? true : false;
        } else if (value & LCD_CMD_SET_DRAM_ADDR) {
            this.cgramMode = false;
            this.addr = value & 0x7F;
        } else if (value & LCD_CMD_SET_CGRAM_ADDR) {
            this.cgramMode = true;
            this.addr = value & 0x3F;
        } else if (value & LCD_CMD_SHIFT) {
            const shiftRight = (value & LCD_CMD_SHIFT_RIGHT) ? 1 : -1;
            const shiftDisplay = (value & LCD_CMD_SHIFT_DISPLAY) ? true : false;
            this.cgramMode = false;
            this.addr = (this.addr + shiftRight) % 128;
            if (shiftDisplay) {
                this.shift = (this.shift + shiftRight) % 40;
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
        }
    }

    processData(value: number) {
        if (this.cgramMode) {
            const data = (value & 0x01) << 4 | (value & 0x02) << 2 | (value & 0x04) | (value & 0x08) >> 2 | (value & 0x10) >> 4;
            this.cgram[this.addr] = data;
            this.addr = (this.addr + 1) % 64;
            this.cgramUpdated = true;
        } else {
            const mode = this.incrementMode ? 1 : -1;
            this.ddram[this.addr] = value;
            this.addr = (this.addr + mode) % 128;
            if (this.shiftMode) {
                this.shift = (this.shift + mode) % 40;
            }
        }
    }
}
