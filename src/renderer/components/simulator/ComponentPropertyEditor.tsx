/**
 * ComponentPropertyEditor
 * Collapsible side panel showing live-adjustable properties for
 * simulated components (sensors, ADC values, etc.).
 *
 * Reads runtime controller instances from a ref passed by the simulation
 * and renders appropriate controls (sliders, number inputs).
 */
import React, { useState, useCallback, useEffect } from 'react';
import { Sliders, ChevronDown, ChevronRight } from 'lucide-react';

// ── Property definitions per component type ──

export interface PropertyDef {
    key: string;
    label: string;
    min: number;
    max: number;
    step: number;
    unit: string;
    defaultValue: number;
}

export interface ComponentProperties {
    partId: string;
    partType: string;
    label: string;
    properties: PropertyDef[];
    /** Getter — reads current value from the runtime controller */
    get: (key: string) => number;
    /** Setter — writes value to the runtime controller */
    set: (key: string, value: number) => void;
}

interface ComponentPropertyEditorProps {
    components: ComponentProperties[];
    isPlaying?: boolean;
    hidden?: boolean;
}

// ── Property Definitions Catalog ──

export const PROPERTY_CATALOG: Record<string, {
    label: string;
    props: PropertyDef[];
}> = {
    'wokwi-dht22': {
        label: 'DHT22 Sensor',
        props: [
            {
                key: 'temperature', label: 'Temperature',
                min: -40, max: 80, step: 0.5, unit: '°C',
                defaultValue: 22.5,
            },
            {
                key: 'humidity', label: 'Humidity',
                min: 0, max: 100, step: 1, unit: '%',
                defaultValue: 60,
            },
        ],
    },
    'wokwi-hc-sr04': {
        label: 'HC-SR04 Ultrasonic',
        props: [
            {
                key: 'distance', label: 'Distance',
                min: 2, max: 400, step: 1, unit: 'cm',
                defaultValue: 100,
            },
        ],
    },
    'wokwi-ntc-temperature-sensor': {
        label: 'NTC Temperature',
        props: [
            {
                key: 'adc', label: 'Analog Value',
                min: 0, max: 1023, step: 1, unit: '',
                defaultValue: 512,
            },
        ],
    },
    'wokwi-photoresistor-sensor': {
        label: 'Photoresistor',
        props: [
            {
                key: 'adc', label: 'Light Level',
                min: 0, max: 1023, step: 1, unit: '',
                defaultValue: 512,
            },
        ],
    },
    'wokwi-flame-sensor': {
        label: 'Flame Sensor',
        props: [
            {
                key: 'adc', label: 'Flame Level',
                min: 0, max: 1023, step: 1, unit: '',
                defaultValue: 512,
            },
        ],
    },
    'wokwi-gas-sensor': {
        label: 'Gas Sensor',
        props: [
            {
                key: 'adc', label: 'Gas Level',
                min: 0, max: 1023, step: 1, unit: '',
                defaultValue: 512,
            },
        ],
    },
    'wokwi-big-sound-sensor': {
        label: 'Big Sound Sensor',
        props: [
            {
                key: 'adc', label: 'Sound Level',
                min: 0, max: 1023, step: 1, unit: '',
                defaultValue: 512,
            },
        ],
    },
    'wokwi-small-sound-sensor': {
        label: 'Small Sound Sensor',
        props: [
            {
                key: 'adc', label: 'Sound Level',
                min: 0, max: 1023, step: 1, unit: '',
                defaultValue: 512,
            },
        ],
    },
    'wokwi-pir-motion-sensor': {
        label: 'PIR Motion Sensor',
        props: [
            {
                key: 'motion', label: 'Motion Detected',
                min: 0, max: 1, step: 1, unit: '',
                defaultValue: 0,
            },
        ],
    },
    'wokwi-heart-beat-sensor': {
        label: 'Heartbeat Sensor',
        props: [
            {
                key: 'adc', label: 'Pulse Signal',
                min: 0, max: 1023, step: 1, unit: '',
                defaultValue: 300,
            },
        ],
    },
    'wokwi-tilt-switch': {
        label: 'Tilt Switch',
        props: [
            {
                key: 'tilted', label: 'Tilted',
                min: 0, max: 1, step: 1, unit: '',
                defaultValue: 0,
            },
        ],
    },
    'wokwi-hx711': {
        label: 'HX711 Load Cell',
        props: [
            {
                key: 'weight', label: 'Weight',
                min: 0, max: 5000, step: 10, unit: 'g',
                defaultValue: 0,
            },
        ],
    },
    'wokwi-microsd-card': {
        label: 'microSD Card',
        props: [
            {
                key: 'inserted', label: 'Card Present',
                min: 0, max: 1, step: 1, unit: '',
                defaultValue: 1,
            },
        ],
    },
};

// ── Single property slider row ──

function formatPropertyValue(val: number, step: number): string {
    return step < 1 ? String(Number(val.toFixed(1))) : String(val);
}

function snapPropertyValue(val: number, def: PropertyDef): number {
    const clamped = Math.min(def.max, Math.max(def.min, val));
    if (def.step >= 1) {
        const steps = Math.round((clamped - def.min) / def.step);
        return Math.min(def.max, Math.max(def.min, def.min + steps * def.step));
    }
    return clamped;
}

function PropertySlider({
    def, value, onChange,
}: Readonly<{
    def: PropertyDef;
    value: number;
    onChange: (val: number) => void;
}>) {
    const [isEditing, setIsEditing] = useState(false);
    const [draftText, setDraftText] = useState(() => formatPropertyValue(value, def.step));

    useEffect(() => {
        if (!isEditing) {
            setDraftText(formatPropertyValue(value, def.step));
        }
    }, [def.step, isEditing, value]);

    const commitDraft = () => {
        const trimmed = draftText.trim();
        const parsed = Number(trimmed);
        if (trimmed === '' || !Number.isFinite(parsed)) {
            setDraftText(formatPropertyValue(value, def.step));
            return;
        }
        const snapped = snapPropertyValue(parsed, def);
        onChange(snapped);
        setDraftText(formatPropertyValue(snapped, def.step));
    };

    const isBinaryToggle = def.min === 0 && def.max === 1 && def.step === 1;
    if (isBinaryToggle) {
        const isOn = value >= 0.5;
        return (
            <div className="flex items-center justify-between gap-2 px-2 py-1.5 text-[11px]">
                <span className="text-vscode-text opacity-85 truncate">{def.label}</span>
                <button
                    type="button"
                    role="switch"
                    aria-checked={isOn}
                    aria-label={def.label}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => onChange(isOn ? 0 : 1)}
                    className={[
                        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors',
                        isOn
                            ? 'border-blue-500/60 bg-blue-500/20 text-blue-300'
                            : 'border-vscode-border bg-vscode-input text-vscode-text opacity-75 hover:opacity-100',
                    ].join(' ')}
                >
                    <span className={`w-2 h-2 rounded-full ${isOn ? 'bg-blue-400' : 'bg-neutral-500'}`} />
                    <span>{isOn ? 'ON' : 'OFF'}</span>
                </button>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-1 px-2 py-1">
            <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="text-vscode-text opacity-80 truncate">{def.label}</span>
                <div className="flex items-center gap-1 shrink-0">
                    <input
                        type="number"
                        aria-label={def.label}
                        min={def.min}
                        max={def.max}
                        step={def.step}
                        value={draftText}
                        onPointerDown={(e) => e.stopPropagation()}
                        onFocus={() => setIsEditing(true)}
                        onBlur={() => {
                            setIsEditing(false);
                            commitDraft();
                        }}
                        onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === 'Enter') {
                                commitDraft();
                                e.currentTarget.blur();
                            } else if (e.key === 'Escape') {
                                setDraftText(formatPropertyValue(value, def.step));
                                e.currentTarget.blur();
                            }
                        }}
                        onChange={(e) => {
                            const raw = e.target.value;
                            setDraftText(raw);
                            const trimmed = raw.trim();
                            if (trimmed !== '' && trimmed !== '-' && trimmed !== '.') {
                                const parsed = Number(trimmed);
                                if (Number.isFinite(parsed) && parsed >= def.min && parsed <= def.max) {
                                    onChange(snapPropertyValue(parsed, def));
                                }
                            }
                        }}
                        className={[
                            'w-14 px-1 py-0.5 text-right rounded text-[11px] font-mono',
                            'bg-vscode-input border border-vscode-border text-vscode-textActive',
                            'focus:outline-none focus:border-blue-500/70',
                        ].join(' ')}
                    />
                    {def.unit && (
                        <span className="text-[10px] text-vscode-text opacity-60 font-mono">
                            {def.unit}
                        </span>
                    )}
                </div>
            </div>
            <input
                type="range"
                min={def.min}
                max={def.max}
                step={def.step}
                value={value}
                onPointerDown={(e) => e.stopPropagation()}
                onChange={(e) => {
                    const nextVal = Number(e.target.value);
                    onChange(nextVal);
                    setDraftText(formatPropertyValue(nextVal, def.step));
                }}
                className="w-full h-1 accent-blue-500 cursor-pointer"
            />
        </div>
    );
}

// ── Component group (collapsible) ──

function ComponentGroup({
    comp, forceOpen,
}: Readonly<{
    comp: ComponentProperties;
    forceOpen: boolean;
}>) {
    const [open, setOpen] = useState(forceOpen);
    const [values, setValues] = useState<Record<string, number>>(() => {
        const init: Record<string, number> = {};
        for (const p of comp.properties) {
            init[p.key] = comp.get(p.key);
        }
        return init;
    });

    // Sync local state when component list changes
    useEffect(() => {
        const fresh: Record<string, number> = {};
        for (const p of comp.properties) {
            fresh[p.key] = comp.get(p.key);
        }
        setValues(fresh);
    }, [comp]);

    const handleChange = useCallback((key: string, val: number) => {
        comp.set(key, val);
        setValues(prev => ({ ...prev, [key]: val }));
    }, [comp]);

    return (
        <div className="border-b border-vscode-border">
            <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpen(o => !o)}
                className="flex items-center gap-1.5 w-full px-2 py-1.5
                    text-[12px] font-medium text-vscode-text
                    hover:bg-vscode-hover transition-colors"
            >
                {open
                    ? <ChevronDown size={12} />
                    : <ChevronRight size={12} />
                }
                <span>{comp.label}</span>
                <span className="text-[10px] text-vscode-text opacity-55 ml-auto font-mono">
                    {comp.partId}
                </span>
            </button>
            {open && (
                <div className="pb-1">
                    {comp.properties.map(p => (
                        <PropertySlider
                            key={p.key}
                            def={p}
                            value={values[p.key] ?? p.defaultValue}
                            onChange={(v) => handleChange(p.key, v)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Main Component ──

export default function ComponentPropertyEditor({
    components, hidden = false,
}: Readonly<ComponentPropertyEditorProps>) {
    const [collapsed, setCollapsed] = useState(false);

    if (components.length === 0 || hidden) return null;

    return (
        <div
            className="absolute top-12 right-2 z-40 bg-vscode-bg
                border border-vscode-border rounded-lg shadow-xl
                overflow-hidden select-none"
            style={{ width: collapsed ? 'auto' : 220 }}
        >
            {/* Header */}
            <button
                type="button"
                aria-expanded={!collapsed}
                onClick={() => setCollapsed(c => !c)}
                className="flex items-center gap-1.5 w-full px-2.5 py-1.5
                    bg-vscode-surface text-[12px] font-semibold text-vscode-text
                    hover:bg-vscode-hover transition-colors uppercase tracking-wide"
            >
                <Sliders size={13} className="text-blue-400" />
                {!collapsed && <span>Properties</span>}
                <span className="ml-auto text-[10px] text-vscode-text opacity-60 font-mono">
                    {components.length}
                </span>
            </button>

            {/* Body */}
            {!collapsed && (
                <div className="max-h-[400px] overflow-y-auto">
                    {components.map(c => (
                        <ComponentGroup
                            key={c.partId}
                            comp={c}
                            forceOpen={components.length <= 3}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
