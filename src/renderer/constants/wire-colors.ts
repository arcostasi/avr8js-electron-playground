export interface WireColorAppearance {
    id: string;
    label: string;
    jacket: string;
    outline: string;
    highlight: string;
    collar: string;
}

export const WIRE_COLOR_DEFINITIONS: readonly WireColorAppearance[] = [
    {
        id: 'red',
        label: 'Red (VCC / 5V)',
        jacket: '#d9383a',
        outline: '#5c1416',
        highlight: 'rgba(255,196,196,0.36)',
        collar: '#e44b4d',
    },
    {
        id: 'black',
        label: 'Black (GND)',
        jacket: '#2c313a',
        outline: '#0b0d11',
        highlight: 'rgba(203,213,225,0.24)',
        collar: '#3f4654',
    },
    {
        id: 'green',
        label: 'Green (Signal)',
        jacket: '#22a355',
        outline: '#0d4222',
        highlight: 'rgba(187,247,208,0.36)',
        collar: '#2ec067',
    },
    {
        id: 'blue',
        label: 'Blue (Data / MOSI)',
        jacket: '#2b6de0',
        outline: '#102b5e',
        highlight: 'rgba(191,219,254,0.38)',
        collar: '#4284f4',
    },
    {
        id: 'yellow',
        label: 'Yellow (Clock / SCL)',
        jacket: '#e2b224',
        outline: '#634b09',
        highlight: 'rgba(254,249,195,0.42)',
        collar: '#f0c43b',
    },
    {
        id: 'orange',
        label: 'Orange (Analog / TX)',
        jacket: '#e46f24',
        outline: '#612b08',
        highlight: 'rgba(255,220,188,0.38)',
        collar: '#f28238',
    },
    {
        id: 'purple',
        label: 'Purple (SCK / Bus)',
        jacket: '#8b56dc',
        outline: '#361b61',
        highlight: 'rgba(233,213,255,0.36)',
        collar: '#9d6deb',
    },
    {
        id: 'cyan',
        label: 'Cyan (RST / Aux)',
        jacket: '#17a4b8',
        outline: '#09434d',
        highlight: 'rgba(186,243,252,0.38)',
        collar: '#25bdd2',
    },
    {
        id: 'magenta',
        label: 'Magenta (Aux Bus)',
        jacket: '#c94687',
        outline: '#541837',
        highlight: 'rgba(251,207,232,0.35)',
        collar: '#dd599a',
    },
    {
        id: 'brown',
        label: 'Brown (Ribbon)',
        jacket: '#945b38',
        outline: '#3e2313',
        highlight: 'rgba(235,205,185,0.30)',
        collar: '#ab6d47',
    },
    {
        id: 'gray',
        label: 'Gray (Shield / MISO)',
        jacket: '#7c8594',
        outline: '#2c313a',
        highlight: 'rgba(226,232,240,0.34)',
        collar: '#919ba9',
    },
    {
        id: 'white',
        label: 'White (Data)',
        jacket: '#dce1e8',
        outline: '#4b5563',
        highlight: 'rgba(255,255,255,0.55)',
        collar: '#eef2f6',
    },
] as const;

export const WIRE_COLORS = [
    'red',
    'black',
    'green',
    'blue',
    'yellow',
    'orange',
    'purple',
    'cyan',
    'magenta',
    'brown',
    'gray',
    'white',
] as const;

const WIRE_APPEARANCE_BY_ID = new Map<string, WireColorAppearance>(
    WIRE_COLOR_DEFINITIONS.map((def) => [def.id, def]),
);

const WIRE_COLOR_ALIASES: Record<string, WireColorAppearance> = {
    grey: WIRE_APPEARANCE_BY_ID.get('gray')!,
    gold: {
        id: 'gold',
        label: 'Gold',
        jacket: '#d69e2e',
        outline: '#5f420a',
        highlight: 'rgba(254,243,199,0.40)',
        collar: '#e5b13f',
    },
    lime: {
        id: 'lime',
        label: 'Lime',
        jacket: '#52b830',
        outline: '#214d12',
        highlight: 'rgba(217,249,157,0.38)',
        collar: '#65cc42',
    },
    pink: {
        id: 'pink',
        label: 'Pink',
        jacket: '#e06498',
        outline: '#5e213b',
        highlight: 'rgba(252,231,243,0.40)',
        collar: '#ed7aa9',
    },
};

const DEFAULT_WIRE_APPEARANCE = WIRE_APPEARANCE_BY_ID.get('green')!;

/**
 * Resolves a diagram wire color token (e.g. "green", "black", "grey", "#f43f5e")
 * to a realistic satin PVC material palette.
 */
export function resolveWireAppearance(color?: string | null): WireColorAppearance {
    const trimmed = typeof color === 'string' ? color.trim() : '';
    if (!trimmed) {
        return DEFAULT_WIRE_APPEARANCE;
    }

    const key = trimmed.toLowerCase();
    const matched = WIRE_APPEARANCE_BY_ID.get(key) ?? WIRE_COLOR_ALIASES[key];
    if (matched) {
        return matched;
    }

    return {
        id: trimmed,
        label: trimmed,
        jacket: trimmed,
        outline: 'rgba(0,0,0,0.68)',
        highlight: 'rgba(255,255,255,0.32)',
        collar: trimmed,
    };
}
