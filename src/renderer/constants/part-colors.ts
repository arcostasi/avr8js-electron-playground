import type { WokwiDiagram, WokwiPart } from '../types/wokwi.types';

export interface PartColorSwatch {
    value: string;
    label: string;
    fill: string;
}

export interface PartColorConfig {
    title: string;
    defaultColor: string;
    swatches: PartColorSwatch[];
}

const LED_SWATCHES: PartColorSwatch[] = [
    { value: 'red', label: 'Red', fill: '#ef4444' },
    { value: 'green', label: 'Green', fill: '#22c55e' },
    { value: 'blue', label: 'Blue', fill: '#3b82f6' },
    { value: 'yellow', label: 'Yellow', fill: '#eab308' },
    { value: 'orange', label: 'Orange', fill: '#f97316' },
    { value: 'white', label: 'White', fill: '#f8fafc' },
    { value: 'purple', label: 'Purple', fill: '#a855f7' },
];

const PUSHBUTTON_SWATCHES: PartColorSwatch[] = [
    { value: 'red', label: 'Red', fill: '#ef4444' },
    { value: 'green', label: 'Green', fill: '#22c55e' },
    { value: 'blue', label: 'Blue', fill: '#3b82f6' },
    { value: 'yellow', label: 'Yellow', fill: '#eab308' },
    { value: 'orange', label: 'Orange', fill: '#f97316' },
    { value: 'black', label: 'Black', fill: '#1f2937' },
    { value: 'white', label: 'White', fill: '#f8fafc' },
    { value: 'purple', label: 'Purple', fill: '#a855f7' },
];

const LED_BAR_GRAPH_SWATCHES: PartColorSwatch[] = [
    ...LED_SWATCHES,
    {
        value: 'GYR',
        label: 'Green / Yellow / Red',
        fill: 'linear-gradient(135deg, #22c55e 0%, #eab308 50%, #ef4444 100%)',
    },
    {
        value: 'BCYR',
        label: 'Blue / Cyan / Yellow / Red',
        fill: 'linear-gradient(135deg, #3b82f6 0%, #06b6d4 33%, #eab308 66%, #ef4444 100%)',
    },
];

const SEGMENT_SWATCHES: PartColorSwatch[] = [
    { value: 'red', label: 'Red', fill: '#ef4444' },
    { value: 'green', label: 'Green', fill: '#22c55e' },
    { value: 'blue', label: 'Blue', fill: '#3b82f6' },
    { value: 'yellow', label: 'Yellow', fill: '#eab308' },
    { value: 'orange', label: 'Orange', fill: '#f97316' },
    { value: 'white', label: 'White', fill: '#f8fafc' },
];

const PART_COLOR_CONFIGS: Record<string, PartColorConfig> = {
    'wokwi-led': {
        title: 'LED Color',
        defaultColor: 'red',
        swatches: LED_SWATCHES,
    },
    'wokwi-pushbutton': {
        title: 'Button Color',
        defaultColor: 'red',
        swatches: PUSHBUTTON_SWATCHES,
    },
    'wokwi-pushbutton-6mm': {
        title: 'Button Color',
        defaultColor: 'red',
        swatches: PUSHBUTTON_SWATCHES,
    },
    'wokwi-led-bar-graph': {
        title: 'Bar Graph Color',
        defaultColor: 'red',
        swatches: LED_BAR_GRAPH_SWATCHES,
    },
    'wokwi-7segment': {
        title: 'Display Color',
        defaultColor: 'red',
        swatches: SEGMENT_SWATCHES,
    },
};

export function getPartColorConfig(partType: string): PartColorConfig | null {
    return PART_COLOR_CONFIGS[partType] ?? null;
}

export function resolvePartColor(part: Pick<WokwiPart, 'type' | 'attrs'>): string {
    const config = getPartColorConfig(part.type);
    const configured = part.attrs?.color?.trim();
    if (configured) {
        return configured;
    }
    return config?.defaultColor ?? 'red';
}

export function resolvePartSwatchFill(part: Pick<WokwiPart, 'type' | 'attrs'>): string {
    const config = getPartColorConfig(part.type);
    const color = resolvePartColor(part);
    const normalized = color.toLowerCase();
    const matched = config?.swatches.find((swatch) => swatch.value.toLowerCase() === normalized);
    return matched?.fill ?? color;
}

export function updatePartColorInDiagram(
    diagram: WokwiDiagram,
    partId: string,
    color: string,
): WokwiDiagram {
    return {
        ...diagram,
        parts: diagram.parts.map((part) => {
            if (part.id !== partId) {
                return part;
            }
            const nextAttrs: Record<string, string> = {
                ...(part.attrs ?? {}),
                color,
            };
            if (part.type === 'wokwi-led') {
                delete nextAttrs.lightColor;
            }
            return {
                ...part,
                attrs: nextAttrs,
            };
        }),
    };
}
