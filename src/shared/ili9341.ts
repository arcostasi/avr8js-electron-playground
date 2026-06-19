/**
 * ILI9341 TFT Display Controller
 *
 * Intercepts SPI bytes from the AVR and renders them to the wokwi-ili9341
 * element's canvas.
 *
 * Protocol:
 *   D/C pin LOW  → next byte is a command
 *   D/C pin HIGH → next byte is data for the current command
 *
 * Key commands handled:
 *   0x2A  CASET  — set column address window (4 data bytes)
 *   0x2B  PASET  — set page (row) address window (4 data bytes)
 *   0x2C  RAMWR  — write pixel stream (RGB565 big-endian, 2 bytes / pixel)
 *
 * All other commands are accepted but ignored; the canvas already renders
 * at full 24-bit colour so COLMOD, MADCTL etc. don't need to be emulated.
 */

import type { AVRIOPort } from 'avr8js';

export interface PinState {
    port: AVRIOPort;
    bit: number;
}

export class ILI9341Controller {
    // ── Canvas ────────────────────────────────────────────────────────────
    private ctx: CanvasRenderingContext2D | null = null;
    private imageData: ImageData | null = null;
    private readonly frameBuffer = new Uint8ClampedArray(240 * 320 * 4);

    // ── Address window (CASET / PASET) & orientation (MADCTL) ─────────────
    private colStart = 0;
    private colEnd   = 239;
    private rowStart = 0;
    private rowEnd   = 319;
    private madctl   = 0x48;             // Portrait default (MX | BGR)

    // ── Command state machine ─────────────────────────────────────────────
    private cmd       = -1;              // -1 = idle
    private dataBytes: number[] = [];
    private inRAMWR   = false;

    // ── RAMWR pixel cursor ────────────────────────────────────────────────
    private curCol       = 0;
    private curRow       = 0;
    private pixelHiByte  = -1;           // -1 = waiting for high byte

    // ── Dirty-row tracking for incremental canvas flushes ─────────────────
    private dirtyMin = 320;
    private dirtyMax = -1;

    constructor(private readonly dcPin: PinState) {
        for (let i = 3; i < this.frameBuffer.length; i += 4) {
            this.frameBuffer[i] = 255;
        }
    }

    // ── Public API ─────────────────────────────────────────────────────────

    /**
     * Attach the canvas element provided by the wokwi-ili9341 element.
     * Must be called when or after the `canvas-ready` event fires.
     */
    attachCanvas(canvas: HTMLCanvasElement): void {
        this.ctx = canvas.getContext('2d');
        if (!this.ctx) return;
        this.imageData = this.ctx.createImageData(240, 320);
        this.imageData.data.set(this.frameBuffer);
        this.ctx.putImageData(this.imageData, 0, 0);
        this.dirtyMin = 320;
        this.dirtyMax = -1;
    }

    /**
     * Called for every byte received via SPI (from `runner.spi.onByte`).
     */
    receiveByte(value: number): void {
        const isData = this.dcPin.port.pinState(this.dcPin.bit) !== 0;

        if (!isData) {
            // ── Command byte ──────────────────────────────────────────────
            this.cmd       = value;
            this.dataBytes = [];
            this.inRAMWR   = (value === 0x2C);

            if (value === 0x01) {
                // SWRESET — restore default orientation and address window
                this.madctl   = 0x48;
                this.colStart = 0;
                this.colEnd   = 239;
                this.rowStart = 0;
                this.rowEnd   = 319;
            } else if (this.inRAMWR) {
                // Start pixel stream at top-left of the address window
                this.curCol      = this.colStart;
                this.curRow      = this.rowStart;
                this.pixelHiByte = -1;
            }
        } else if (this.inRAMWR) {
            // ── Pixel data byte ───────────────────────────────────────────
            this.writePixelByte(value);
        } else {
            // ── Parameter byte for non-RAMWR command ─────────────────────
            this.dataBytes.push(value);
            this.applyParameters();
        }
    }

    /**
     * Flush any dirty rows to the canvas.
     * Called once per simulation tick from the controller's `update()` hook.
     */
    flush(): void {
        if (!this.ctx || !this.imageData) return;
        if (this.dirtyMin > this.dirtyMax) return;

        const y = this.dirtyMin;
        const h = this.dirtyMax - this.dirtyMin + 1;
        this.ctx.putImageData(this.imageData, 0, 0, 0, y, 240, h);
        this.dirtyMin = 320;
        this.dirtyMax = -1;
    }

    // ── Private helpers ────────────────────────────────────────────────────

    private applyParameters(): void {
        const d = this.dataBytes;
        switch (this.cmd) {
            case 0x2A: // CASET — column address set
                if (d.length === 4) {
                    this.colStart = (d[0] << 8) | d[1];
                    this.colEnd   = (d[2] << 8) | d[3];
                }
                break;
            case 0x2B: // PASET — page (row) address set
                if (d.length === 4) {
                    this.rowStart = (d[0] << 8) | d[1];
                    this.rowEnd   = (d[2] << 8) | d[3];
                }
                break;
            case 0x36: // MADCTL — memory access control (orientation / mirroring)
                if (d.length === 1) {
                    this.madctl = d[0] & 0xff;
                }
                break;
            // All other commands (COLMOD, DISPON, etc.) are ignored.
        }
    }

    private writePixelByte(value: number): void {
        // Accumulate 2 bytes to form one RGB565 pixel
        if (this.pixelHiByte === -1) {
            this.pixelHiByte = value;
            return;
        }

        const pixel = (this.pixelHiByte << 8) | value;
        this.pixelHiByte = -1;

        // RGB565 → RGB888 (nearest-neighbour scaling)
        const r = Math.trunc(((pixel >> 11) & 0x1F) * 255 / 31);
        const g = Math.trunc(((pixel >>  5) & 0x3F) * 255 / 63);
        const b = Math.trunc( (pixel        & 0x1F) * 255 / 31);

        const mv = (this.madctl & 0x20) !== 0;
        const mx = (this.madctl & 0x40) !== 0;
        const my = (this.madctl & 0x80) !== 0;
        const logicalW = mv ? 320 : 240;
        const logicalH = mv ? 240 : 320;

        const col = this.curCol;
        const row = this.curRow;
        const physX = mv
            ? (mx ? row : (239 - row))
            : (mx ? col : (239 - col));
        const physY = mv
            ? (my ? (319 - col) : col)
            : (my ? (319 - row) : row);

        if (physX >= 0 && physX < 240 && physY >= 0 && physY < 320) {
            const idx = (physY * 240 + physX) * 4;
            this.frameBuffer[idx]     = r;
            this.frameBuffer[idx + 1] = g;
            this.frameBuffer[idx + 2] = b;
            this.frameBuffer[idx + 3] = 255;

            if (this.imageData) {
                const data = this.imageData.data;
                data[idx]     = r;
                data[idx + 1] = g;
                data[idx + 2] = b;
                data[idx + 3] = 255;
            }

            // Track dirty region in physical canvas coordinates
            if (physY < this.dirtyMin) this.dirtyMin = physY;
            if (physY > this.dirtyMax) this.dirtyMax = physY;
        }

        // Advance horizontally, wrap at colEnd, then advance row
        this.curCol++;
        const maxCol = Math.min(this.colEnd, logicalW - 1);
        const maxRow = Math.min(this.rowEnd, logicalH - 1);

        if (this.curCol > maxCol) {
            this.curCol = this.colStart;
            this.curRow++;
            if (this.curRow > maxRow) {
                this.curRow = this.rowStart;
            }
        }
    }
}
