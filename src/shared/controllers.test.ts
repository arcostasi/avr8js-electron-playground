import { describe, expect, it } from 'vitest';
import { CPU, AVRIOPort, portBConfig } from 'avr8js';
import { LCD1602Controller } from './lcd1602';
import { LCD2004Controller } from './lcd2004';
import { SSD1306Controller } from './ssd1306';
import { ILI9341Controller } from './ili9341';
import { MPU6050Controller, MPU6050_ADDR } from './mpu6050';

function writeLcd4BitByte(ctrl: { i2cWriteByte: (v: number) => unknown }, byte: number, rs: boolean): void {
    const ctrlBits = (rs ? 0x01 : 0x00) | 0x08; // RS + backlight
    const hi = (byte & 0xf0) | ctrlBits;
    const lo = ((byte << 4) & 0xf0) | ctrlBits;
    ctrl.i2cWriteByte(hi | 0x04);
    ctrl.i2cWriteByte(hi);
    ctrl.i2cWriteByte(lo | 0x04);
    ctrl.i2cWriteByte(lo);
}

function sendSsd1306Cmd(ctrl: SSD1306Controller, bytes: number[]): void {
    ctrl.i2cConnect();
    ctrl.i2cWriteByte(0x00);
    for (const b of bytes) {
        ctrl.i2cWriteByte(b);
    }
}

describe('shared hardware controllers', () => {
    it('LCD1602 initializes blank spaces, handles negative shift wrap, and tracks backlight', () => {
        const lcd = new LCD1602Controller(() => 0);
        lcd.i2cConnect();
        // Switch to 4-bit mode via initial 8-bit function nibble, then 0x28
        lcd.i2cWriteByte(0x20 | 0x08 | 0x04);
        lcd.i2cWriteByte(0x20 | 0x08);
        writeLcd4BitByte(lcd, 0x28, false); // 4-bit, 2 lines
        writeLcd4BitByte(lcd, 0x0c, false); // display ON
        writeLcd4BitByte(lcd, 0x41, true);  // 'A' at DDRAM 0

        const state1 = lcd.update();
        expect(state1).not.toBe(false);
        if (state1 !== false) {
            expect(state1.backlight).toBe(true);
            expect(state1.characters[0]).toBe(0x41);
            expect(state1.characters[1]).toBe(0x20); // space, not NUL
        }

        // Shift display left (-1) wraps shift to 39 cleanly
        writeLcd4BitByte(lcd, 0x18, false);
        writeLcd4BitByte(lcd, 0x1c, false); // shift right (+1) brings 'A' back to index 0
        const state2 = lcd.update();
        expect(state2).not.toBe(false);
        if (state2 !== false) {
            expect(state2.characters[0]).toBe(0x41);
        }
    });

    it('LCD2004 maps all 4 row DDRAM addresses to accurate cursorX/cursorY and characters', () => {
        const lcd = new LCD2004Controller(() => 0);
        lcd.i2cConnect();
        lcd.i2cWriteByte(0x20 | 0x08 | 0x04);
        lcd.i2cWriteByte(0x20 | 0x08);
        writeLcd4BitByte(lcd, 0x28, false);
        writeLcd4BitByte(lcd, 0x0c, false);

        // Write '3' at Row 2 col 1 (DDRAM 0x15 = 0x14 + 1) -> SET_DRAM_ADDR 0x95
        writeLcd4BitByte(lcd, 0x80 | 0x15, false);
        writeLcd4BitByte(lcd, 0x33, true);
        let state = lcd.update();
        expect(state).not.toBe(false);
        if (state !== false) {
            expect(state.characters[41]).toBe(0x33); // row 2 offset 40 + col 1
            expect(state.cursorY).toBe(2);
            expect(state.cursorX).toBe(2);
        }

        // Write '4' at Row 3 col 2 (DDRAM 0x56 = 0x54 + 2)
        writeLcd4BitByte(lcd, 0x80 | 0x56, false);
        writeLcd4BitByte(lcd, 0x34, true);
        state = lcd.update();
        expect(state).not.toBe(false);
        if (state !== false) {
            expect(state.characters[62]).toBe(0x34); // row 3 offset 60 + col 2
            expect(state.cursorY).toBe(3);
            expect(state.cursorX).toBe(3);
        }
    });

    it('SSD1306 updates active window pointers on COLUMN_ADDR/PAGE_ADDR and wraps page mode cleanly', () => {
        const oled = new SSD1306Controller(() => 0);
        sendSsd1306Cmd(oled, [0xaf]); // display ON
        sendSsd1306Cmd(oled, [0x20, 0x00]); // horizontal addressing
        sendSsd1306Cmd(oled, [0x21, 10, 12]); // column 10..12
        sendSsd1306Cmd(oled, [0x22, 2, 3]);   // page 2..3

        oled.i2cConnect();
        oled.i2cWriteByte(0x40);
        oled.i2cWriteByte(0xff); // should write page 2 col 10
        expect(oled.pixels[2 * 128 + 10]).toBe(0xff);

        // Page addressing mode should wrap at column 128 (not 129)
        sendSsd1306Cmd(oled, [0x20, 0x02]);
        sendSsd1306Cmd(oled, [0xb0, 0x0f, 0x17]); // page 0, col 127
        oled.i2cConnect();
        oled.i2cWriteByte(0x40);
        oled.i2cWriteByte(0xaa); // writes page 0 col 127 -> wraps to page 1 col 0
        oled.i2cWriteByte(0x55); // writes page 1 col 0
        expect(oled.pixels[127]).toBe(0xaa);
        expect(oled.pixels[128]).toBe(0x55);

        // Blank imageData when display is OFF
        const img = { width: 128, height: 64, data: new Uint8ClampedArray(128 * 64 * 4) } as ImageData;
        oled.toImageData(img);
        expect(img.data[(1 * 128 + 127) * 4]).toBe(0xff); // bit 1 of 0xaa is 1

        sendSsd1306Cmd(oled, [0xae]); // display OFF
        oled.toImageData(img);
        expect(img.data[(1 * 128 + 127) * 4]).toBe(0);
    });

    it('ILI9341 supports MADCTL landscape rotation (320x240) and preserves early writes before attachCanvas', () => {
        const cpu = new CPU(new Uint16Array(1024));
        const portB = new AVRIOPort(cpu, portBConfig);
        cpu.writeData(portBConfig.DDR, 1); // bit 0 as output (D/C)

        const tft = new ILI9341Controller({ port: portB, bit: 0 });
        const sendCmd = (cmd: number, params: number[] = []) => {
            cpu.writeData(portBConfig.PORT, 0);
            tft.receiveByte(cmd);
            cpu.writeData(portBConfig.PORT, 1);
            for (const p of params) tft.receiveByte(p);
        };

        // Rotation 1 (landscape 320x240): MADCTL = 0x28
        sendCmd(0x36, [0x28]);
        // CASET 319..319, PASET 0..0 (rightmost column of landscape screen!)
        sendCmd(0x2a, [0x01, 0x3f, 0x01, 0x3f]);
        sendCmd(0x2b, [0x00, 0x00, 0x00, 0x00]);
        // Write pure red RGB565 (0xF800) before attachCanvas
        sendCmd(0x2c, [0xf8, 0x00]);

        const canvasBuf = new Uint8ClampedArray(240 * 320 * 4);
        const fakeCtx = {
            createImageData: (w: number, h: number) => ({ width: w, height: h, data: canvasBuf }),
            putImageData: () => {},
        };
        const fakeCanvas = { getContext: () => fakeCtx } as unknown as HTMLCanvasElement;

        tft.attachCanvas(fakeCanvas);

        // For rotation 1 (mv=1, mx=0, my=0), logical (319, 0) maps to physical (239, 319)
        const idx = (319 * 240 + 239) * 4;
        expect(canvasBuf[idx]).toBe(255);
        expect(canvasBuf[idx + 1]).toBe(0);
        expect(canvasBuf[idx + 2]).toBe(0);
        expect(canvasBuf[idx + 3]).toBe(255);
    });

    it('MPU6050 acknowledges standard configuration registers including SIGNAL_PATH_RESET and wakes up cleanly', () => {
        const mpu = new MPU6050Controller(() => 0);
        expect(mpu.i2cConnect(MPU6050_ADDR, true)).toBe(true);
        // SIGNAL_PATH_RESET (0x68) must ACK
        expect(mpu.i2cWriteByte(0x68)).toBe(true);
        expect(mpu.i2cWriteByte(0x07)).toBe(true);

        // Wake up (PWR_MGMT_1 = 0x00)
        expect(mpu.i2cConnect(MPU6050_ADDR, true)).toBe(true);
        expect(mpu.i2cWriteByte(0x6b)).toBe(true);
        expect(mpu.i2cWriteByte(0x00)).toBe(true);

        // Read ACCEL_ZOUT_H..L (0x3F..0x40) -> 1g * 16384 = 0x4000
        expect(mpu.i2cConnect(MPU6050_ADDR, true)).toBe(true);
        expect(mpu.i2cWriteByte(0x3f)).toBe(true);
        expect(mpu.i2cConnect(MPU6050_ADDR, false)).toBe(true);
        expect(mpu.i2cReadByte()).toBe(0x40);
        expect(mpu.i2cReadByte()).toBe(0x00);
    });
});
