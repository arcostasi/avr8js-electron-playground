import { describe, expect, it } from 'vitest';
import {
    DOT_MATRIX_BORDER,
    DOT_MATRIX_LIMITS,
    DOT_MATRIX_MIN_INNER_WIDTH,
    DOT_MATRIX_PADDING,
    DOT_MATRIX_PIN_BAR_HEIGHT,
    computeDotMatrixGeometry,
    computeDotMatrixLedAppearance,
    decodeWs2812Grb,
    getDotMatrixPixelCount,
    resolveDotMatrixConfig,
    serializeDotMatrixConfig,
} from './dot-matrix-config';

describe('dot-matrix-config', () => {
    it('resolves default dimensions and hole styling when attrs are missing', () => {
        expect(resolveDotMatrixConfig()).toEqual({
            cols: DOT_MATRIX_LIMITS.defaultCols,
            rows: DOT_MATRIX_LIMITS.defaultRows,
            dotSize: DOT_MATRIX_LIMITS.defaultDotSize,
            dotGap: DOT_MATRIX_LIMITS.defaultDotGap,
        });
    });

    it('clamps out-of-range and invalid attrs safely', () => {
        expect(resolveDotMatrixConfig({
            cols: '999',
            rows: '0',
            dotSize: '2',
            dotGap: 'abc',
        })).toEqual({
            cols: DOT_MATRIX_LIMITS.maxCols,
            rows: DOT_MATRIX_LIMITS.minRows,
            dotSize: DOT_MATRIX_LIMITS.minDotSize,
            dotGap: DOT_MATRIX_LIMITS.defaultDotGap,
        });
    });

    it('serializes patched attrs while preserving unrelated keys', () => {
        const serialized = serializeDotMatrixConfig(
            { cols: 24, rows: 8 },
            { cols: '16', rows: '16', dotSize: '20', dotGap: '3', label: 'Matrix' },
        );

        expect(serialized).toEqual({
            cols: '24',
            rows: '8',
            dotSize: '20',
            dotGap: '3',
            label: 'Matrix',
        });
        expect(getDotMatrixPixelCount(serialized)).toBe(192);
    });

    it('computes geometry and bottom pin layout for custom grids including 1x1', () => {
        const tiny = computeDotMatrixGeometry({ cols: 1, rows: 1, dotSize: 12, dotGap: 2 });
        const chrome = (DOT_MATRIX_BORDER + DOT_MATRIX_PADDING) * 2;

        expect(tiny.gridWidth).toBe(16);
        expect(tiny.gridHeight).toBe(16);
        expect(tiny.width).toBe(DOT_MATRIX_MIN_INNER_WIDTH + chrome);
        expect(tiny.height).toBe(16 + chrome + DOT_MATRIX_PIN_BAR_HEIGHT);
        expect(tiny.pinInfo.map((pin) => pin.name)).toEqual(['GND', 'DIN', 'VCC', 'DOUT']);
        for (const pin of tiny.pinInfo) {
            expect(pin.y).toBe(tiny.height);
            expect(pin.x).toBeGreaterThan(0);
            expect(pin.x).toBeLessThan(tiny.width);
        }

        const wide = computeDotMatrixGeometry({ cols: 24, rows: 8, dotSize: 20, dotGap: 4 });
        expect(wide.gridWidth).toBe(24 * 28);
        expect(wide.gridHeight).toBe(8 * 28);
        expect(wide.width).toBe(24 * 28 + chrome);
        expect(wide.pinInfo[1].x - wide.pinInfo[0].x).toBe(24);
    });

    it('decodes WS2812 GRB uint32 values into RGB and active state', () => {
        expect(decodeWs2812Grb(0x000000)).toEqual({ r: 0, g: 0, b: 0, active: false });
        expect(decodeWs2812Grb(0x11aa22)).toEqual({ r: 0xaa, g: 0x11, b: 0x22, active: true });
    });

    it('computes crisp recessed LED optics and tight halo for lit pixels', () => {
        expect(computeDotMatrixLedAppearance(0x000000)).toEqual({
            active: false,
            background: '',
            boxShadow: '',
            opacity: '0',
        });

        const brightRed = computeDotMatrixLedAppearance(0x00ff00);
        expect(brightRed.active).toBe(true);
        expect(brightRed.opacity).toBe('1.00');
        expect(brightRed.background).toBe(
            'radial-gradient(circle at 50% 50%, rgb(255, 112, 112) 0%, rgb(255, 0, 0) 58%, rgb(214, 0, 0) 84%, rgb(153, 0, 0) 100%)',
        );
        expect(brightRed.boxShadow).toContain('inset 0 0 1.5px rgba(255, 255, 255, 0.36)');
        expect(brightRed.boxShadow).toContain('rgba(255, 0, 0, 0.60)');
        expect(brightRed.boxShadow).toContain('rgba(255, 0, 0, 0.26)');

        const midRed = computeDotMatrixLedAppearance(0x008000);
        expect(midRed.active).toBe(true);
        expect(Number(midRed.opacity)).toBeGreaterThanOrEqual(0.80);

        const veryDimRed = computeDotMatrixLedAppearance(0x000400);
        expect(veryDimRed.active).toBe(true);
        expect(Number(veryDimRed.opacity)).toBeLessThan(0.55);

        const geo = computeDotMatrixGeometry({ cols: 16, rows: 16, dotSize: 24, dotGap: 4 });
        expect(geo.glowSpread).toBe(0);
        expect(geo.glowOuterSpread).toBe(0);
        expect(geo.glowBlur).toBe(8);
        expect(geo.glowInnerBlur).toBe(3);
    });
});
