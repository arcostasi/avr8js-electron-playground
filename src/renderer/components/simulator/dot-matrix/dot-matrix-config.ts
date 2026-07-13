import type { PinInfo } from '../../../types/wokwi.types';
import type { PropertyDef } from '../ComponentPropertyEditor';

export const DOT_MATRIX_PART_TYPE = 'dot-matrix-react';
export const DOT_MATRIX_BORDER = 4;
export const DOT_MATRIX_PADDING = 5;
export const DOT_MATRIX_PIN_BAR_HEIGHT = 20;
export const DOT_MATRIX_MIN_INNER_WIDTH = 104;

export const DOT_MATRIX_LIMITS = {
    minCols: 1,
    maxCols: 64,
    defaultCols: 16,
    minRows: 1,
    maxRows: 64,
    defaultRows: 16,
    minDotSize: 6,
    maxDotSize: 36,
    defaultDotSize: 24,
    minDotGap: 1,
    maxDotGap: 12,
    defaultDotGap: 4,
} as const;

export interface DotMatrixConfig {
    cols: number;
    rows: number;
    dotSize: number;
    dotGap: number;
}

export interface DotMatrixGeometry {
    width: number;
    height: number;
    gridWidth: number;
    gridHeight: number;
    pinBarHeight: number;
    glowBlur: number;
    glowSpread: number;
    glowInnerBlur: number;
    glowOuterSpread: number;
    pinInfo: PinInfo[];
}

export interface DotMatrixLedAppearance {
    active: boolean;
    background: string;
    boxShadow: string;
    opacity: string;
}

export type DotMatrixHostElement = HTMLElement & {
    pinInfo?: PinInfo[];
    getPixelCount?: () => number;
    setPixels?: (pixels: Uint32Array) => void;
    clearPixels?: () => void;
};

export const DOT_MATRIX_PROPERTY_DEFS: PropertyDef[] = [
    {
        key: 'cols',
        label: 'Width (cols)',
        min: DOT_MATRIX_LIMITS.minCols,
        max: DOT_MATRIX_LIMITS.maxCols,
        step: 1,
        unit: 'cols',
        defaultValue: DOT_MATRIX_LIMITS.defaultCols,
    },
    {
        key: 'rows',
        label: 'Height (rows)',
        min: DOT_MATRIX_LIMITS.minRows,
        max: DOT_MATRIX_LIMITS.maxRows,
        step: 1,
        unit: 'rows',
        defaultValue: DOT_MATRIX_LIMITS.defaultRows,
    },
    {
        key: 'dotSize',
        label: 'Hole Size',
        min: DOT_MATRIX_LIMITS.minDotSize,
        max: DOT_MATRIX_LIMITS.maxDotSize,
        step: 1,
        unit: 'px',
        defaultValue: DOT_MATRIX_LIMITS.defaultDotSize,
    },
    {
        key: 'dotGap',
        label: 'Hole Gap',
        min: DOT_MATRIX_LIMITS.minDotGap,
        max: DOT_MATRIX_LIMITS.maxDotGap,
        step: 1,
        unit: 'px',
        defaultValue: DOT_MATRIX_LIMITS.defaultDotGap,
    },
];

function clampInt(raw: string | number | undefined, min: number, max: number, fallback: number): number {
    if (raw === undefined) {
        return fallback;
    }
    const parsed = typeof raw === 'number' ? Math.round(raw) : Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    return Math.min(max, Math.max(min, parsed));
}

export function resolveDotMatrixConfig(attrs?: Record<string, string>): DotMatrixConfig {
    return {
        cols: clampInt(attrs?.cols, DOT_MATRIX_LIMITS.minCols, DOT_MATRIX_LIMITS.maxCols, DOT_MATRIX_LIMITS.defaultCols),
        rows: clampInt(attrs?.rows, DOT_MATRIX_LIMITS.minRows, DOT_MATRIX_LIMITS.maxRows, DOT_MATRIX_LIMITS.defaultRows),
        dotSize: clampInt(
            attrs?.dotSize,
            DOT_MATRIX_LIMITS.minDotSize,
            DOT_MATRIX_LIMITS.maxDotSize,
            DOT_MATRIX_LIMITS.defaultDotSize,
        ),
        dotGap: clampInt(
            attrs?.dotGap,
            DOT_MATRIX_LIMITS.minDotGap,
            DOT_MATRIX_LIMITS.maxDotGap,
            DOT_MATRIX_LIMITS.defaultDotGap,
        ),
    };
}

export function serializeDotMatrixConfig(
    patch: Partial<DotMatrixConfig>,
    existingAttrs?: Record<string, string>,
): Record<string, string> {
    const current = resolveDotMatrixConfig(existingAttrs);
    const next = resolveDotMatrixConfig({
        cols: String(patch.cols ?? current.cols),
        rows: String(patch.rows ?? current.rows),
        dotSize: String(patch.dotSize ?? current.dotSize),
        dotGap: String(patch.dotGap ?? current.dotGap),
    });

    return {
        ...(existingAttrs ?? {}),
        cols: String(next.cols),
        rows: String(next.rows),
        dotSize: String(next.dotSize),
        dotGap: String(next.dotGap),
    };
}

export function getDotMatrixPixelCount(attrs?: Record<string, string>): number {
    const { cols, rows } = resolveDotMatrixConfig(attrs);
    return cols * rows;
}

export function decodeWs2812Grb(grb: number): { r: number; g: number; b: number; active: boolean } {
    const g = (grb >> 16) & 0xff;
    const r = (grb >> 8) & 0xff;
    const b = grb & 0xff;
    return {
        r,
        g,
        b,
        active: r > 0 || g > 0 || b > 0,
    };
}

const LED_GAMMA_LUT = Uint8Array.from({ length: 256 }, (_, value) => (
    value === 0 ? 0 : Math.max(1, Math.round(Math.pow(value / 255, 0.75) * 255))
));

export function computeDotMatrixLedAppearance(grb: number): DotMatrixLedAppearance {
    const { r, g, b, active } = decodeWs2812Grb(grb);
    if (!active) {
        return {
            active: false,
            background: '',
            boxShadow: '',
            opacity: '0',
        };
    }

    const vr = LED_GAMMA_LUT[r];
    const vg = LED_GAMMA_LUT[g];
    const vb = LED_GAMMA_LUT[b];
    const peak = Math.max(vr, vg, vb) / 255;
    const bloom = peak * peak;

    const coreBoost = Math.pow(peak, 2.2) * 0.44;
    const cr = Math.min(255, Math.round(vr + (255 - vr) * coreBoost));
    const cg = Math.min(255, Math.round(vg + (255 - vg) * coreBoost));
    const cb = Math.min(255, Math.round(vb + (255 - vb) * coreBoost));

    const er = Math.round(vr * 0.84);
    const eg = Math.round(vg * 0.84);
    const eb = Math.round(vb * 0.84);

    const rr = Math.round(vr * 0.60);
    const rg = Math.round(vg * 0.60);
    const rb = Math.round(vb * 0.60);

    const highlightAlpha = (0.10 + 0.26 * bloom).toFixed(2);
    const innerAlpha = Math.min(0.60, 0.14 + 0.46 * bloom).toFixed(2);
    const outerAlpha = Math.min(0.26, 0.04 + 0.22 * bloom).toFixed(2);
    const opacity = Math.min(1, 0.32 + Math.pow(peak, 0.48) * 0.68).toFixed(2);

    const background = [
        `radial-gradient(circle at 50% 50%, rgb(${cr}, ${cg}, ${cb}) 0%,`,
        `rgb(${vr}, ${vg}, ${vb}) 58%, rgb(${er}, ${eg}, ${eb}) 84%, rgb(${rr}, ${rg}, ${rb}) 100%)`,
    ].join(' ');
    const boxShadow = [
        `inset 0 0 1.5px rgba(255, 255, 255, ${highlightAlpha})`,
        `0 0 var(--dot-glow-inner, 3px) var(--dot-glow-spread, 0px) rgba(${vr}, ${vg}, ${vb}, ${innerAlpha})`,
        `0 0 var(--dot-glow-blur, 8px) var(--dot-glow-outer-spread, 0px) rgba(${vr}, ${vg}, ${vb}, ${outerAlpha})`,
    ].join(', ');

    return {
        active: true,
        background,
        boxShadow,
        opacity,
    };
}

const PIN_NAMES = ['GND', 'DIN', 'VCC', 'DOUT'] as const;

export function computeDotMatrixGeometry(config: DotMatrixConfig): DotMatrixGeometry {
    const cellStep = config.dotSize + config.dotGap * 2;
    const gridWidth = config.cols * cellStep;
    const gridHeight = config.rows * cellStep;
    const innerWidth = Math.max(gridWidth, DOT_MATRIX_MIN_INNER_WIDTH);
    const chrome = (DOT_MATRIX_BORDER + DOT_MATRIX_PADDING) * 2;
    const width = innerWidth + chrome;
    const height = gridHeight + chrome + DOT_MATRIX_PIN_BAR_HEIGHT;

    const glowBlur = Math.max(4, Math.round(config.dotSize * 0.34));
    const glowSpread = 0;
    const glowInnerBlur = Math.max(2, Math.round(config.dotSize * 0.14));
    const glowOuterSpread = 0;

    const pinSpacing = Math.min(24, Math.max(18, Math.floor((innerWidth - 16) / (PIN_NAMES.length - 1))));
    const totalPinSpan = pinSpacing * (PIN_NAMES.length - 1);
    const startX = Math.round((width - totalPinSpan) / 2);

    const pinInfo: PinInfo[] = PIN_NAMES.map((name, index) => ({
        name,
        x: startX + index * pinSpacing,
        y: height,
    }));

    return {
        width,
        height,
        gridWidth,
        gridHeight,
        pinBarHeight: DOT_MATRIX_PIN_BAR_HEIGHT,
        glowBlur,
        glowSpread,
        glowInnerBlur,
        glowOuterSpread,
        pinInfo,
    };
}
