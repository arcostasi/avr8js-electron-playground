import { afterEach, describe, expect, it, vi } from 'vitest';
import { I2CBus } from '../../shared/i2c-bus';
import { AVRRunner } from '../../shared/execute';
import type { WokwiDiagram } from '../types/wokwi.types';
import { createHardwareControllers, updateNeopixelMatrix, updateNeopixelRing } from './simulation-engine';

const EMPTY_HEX = ':00000001FF\n';

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('simulation-engine NeoPixel diffing', () => {
    it('skips unchanged pixels in updateNeopixelRing after the initial frame', () => {
        const calls: Array<{ i: number; r: number; g: number; b: number }> = [];
        const fakeRing = {
            setPixel: (i: number, color: { r: number; g: number; b: number }) => {
                calls.push({ i, ...color });
            },
        } as unknown as HTMLElement;

        const frame1 = new Uint32Array([0x00ff0000, 0x0000ff00, 0x000000ff, 0x00112233]);
        updateNeopixelRing(fakeRing, frame1);
        expect(calls).toHaveLength(4);

        calls.length = 0;
        const frame2Same = new Uint32Array([0x00ff0000, 0x0000ff00, 0x000000ff, 0x00112233]);
        updateNeopixelRing(fakeRing, frame2Same);
        expect(calls).toHaveLength(0);

        const frame3OneChanged = new Uint32Array([0x00ff0000, 0x0000ff00, 0x00ffffff, 0x00112233]);
        updateNeopixelRing(fakeRing, frame3OneChanged);
        expect(calls).toHaveLength(1);
        expect(calls[0]).toEqual({ i: 2, r: 1, g: 1, b: 1 });
    });

    it('skips unchanged pixels in updateNeopixelMatrix and maps (row, col) only for changed pixels', () => {
        const calls: Array<{ row: number; col: number }> = [];
        const fakeMatrix = {
            cols: 2,
            setPixel: (row: number, col: number) => {
                calls.push({ row, col });
            },
        } as unknown as HTMLElement;

        const frame1 = new Uint32Array([1, 2, 3, 4]);
        updateNeopixelMatrix(fakeMatrix, frame1);
        expect(calls).toHaveLength(4);

        calls.length = 0;
        updateNeopixelMatrix(fakeMatrix, new Uint32Array([1, 2, 3, 4]));
        expect(calls).toHaveLength(0);

        updateNeopixelMatrix(fakeMatrix, new Uint32Array([1, 2, 3, 99]));
        expect(calls).toEqual([{ row: 1, col: 1 }]);
    });

    it('initializes headless wokwi-neopixel-strip (512 px) for Custom View and emits updates + cleanup', () => {
        vi.stubGlobal('document', {
            getElementById: (): HTMLElement | null => null,
        });

        const updates: Array<{ partId: string; len: number }> = [];
        const runner = new AVRRunner(EMPTY_HEX);
        const i2cBus = new I2CBus(runner.twi);
        const diagram: WokwiDiagram = {
            version: 2,
            editor: 'wokwi',
            customView: 'http://localhost:3000/?size=8',
            parts: [
                { id: 'uno', type: 'wokwi-arduino-mega', top: 0, left: 0, rotate: 0 },
                { id: 'neopixels', type: 'wokwi-neopixel-strip', top: 0, left: 0, rotate: 0, attrs: { pixels: '512' } },
            ],
            connections: [
                { id: 'c1', from: 'uno:3', to: 'neopixels:DIN', color: 'green' },
            ],
        };

        const { controllers, cleanup } = createHardwareControllers(
            diagram,
            runner,
            i2cBus,
            {},
            {},
            undefined,
            undefined,
            (partId, pixels) => updates.push({ partId, len: pixels.length }),
        );

        expect(controllers).toHaveLength(1);
        expect(controllers[0].element).toBeNull();
        expect(controllers[0].type).toBe('neopixel-strip');

        const frame = controllers[0].update() as Uint32Array | null;
        expect(frame).toBeInstanceOf(Uint32Array);
        expect(frame?.length).toBe(512);
        expect(updates).toContainEqual({ partId: 'neopixels', len: 512 });

        updates.length = 0;
        cleanup();
        expect(updates).toEqual([{ partId: 'neopixels', len: 512 }]);
        runner.stop();
    });
});
