/**
 * AddComponentMenu
 * Dropdown menu for adding Wokwi components to the diagram.
 * Includes live search, category filter chips, and ArrowUp/ArrowDown/Enter keyboard navigation.
 */
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Plus, Search } from 'lucide-react';
import { COMMON_COMPONENTS } from '../../constants/wokwi-components';
import type { WokwiPart, WokwiDiagram, WokwiComponentDef } from '../../types/wokwi.types';

type ComponentCategoryId = 'all' | 'boards' | 'leds' | 'displays' | 'sensors' | 'input' | 'actuators' | 'chips';

const COMPONENT_CATEGORIES: Array<{ id: ComponentCategoryId; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'boards', label: 'Boards' },
    { id: 'leds', label: 'LEDs' },
    { id: 'displays', label: 'Displays' },
    { id: 'sensors', label: 'Sensors' },
    { id: 'input', label: 'Input' },
    { id: 'actuators', label: 'Actuators' },
    { id: 'chips', label: 'Chips' },
];

const SENSOR_TYPES = new Set([
    'wokwi-big-sound-sensor',
    'wokwi-dht22',
    'wokwi-ds1307',
    'wokwi-flame-sensor',
    'wokwi-gas-sensor',
    'wokwi-hc-sr04',
    'wokwi-heart-beat-sensor',
    'wokwi-hx711',
    'wokwi-ir-receiver',
    'wokwi-ky040',
    'wokwi-mpu6050',
    'wokwi-ntc-temperature-sensor',
    'wokwi-photoresistor-sensor',
    'wokwi-pir-motion-sensor',
    'wokwi-potentiometer',
    'wokwi-slide-potentiometer',
    'wokwi-small-sound-sensor',
    'wokwi-tilt-switch',
]);

const INPUT_TYPES = new Set([
    'wokwi-analog-joystick',
    'wokwi-dip-switch-8',
    'wokwi-ir-remote',
    'wokwi-membrane-keypad',
    'wokwi-pushbutton',
    'wokwi-pushbutton-6mm',
    'wokwi-rotary-dialer',
    'wokwi-slide-switch',
]);

const ACTUATOR_TYPES = new Set([
    'wokwi-buzzer',
    'wokwi-ks2e-m-dc5',
    'wokwi-servo',
    'wokwi-stepper-motor',
]);

function getComponentCategory(comp: WokwiComponentDef): Exclude<ComponentCategoryId, 'all'> | 'other' {
    if (comp.type.startsWith('chip-')) return 'chips';
    if (
        comp.type.startsWith('wokwi-arduino-')
        || comp.type === 'wokwi-esp32-devkit-v1'
        || comp.type === 'wokwi-franzininho'
        || comp.type === 'wokwi-nano-rp2040-connect'
    ) {
        return 'boards';
    }
    if (
        comp.type.includes('led')
        || comp.type.includes('neopixel')
        || comp.type === 'dot-matrix-react'
    ) {
        return 'leds';
    }
    if (
        comp.type.includes('lcd')
        || comp.type === 'wokwi-7segment'
        || comp.type === 'wokwi-ili9341'
        || comp.type === 'wokwi-ssd1306'
    ) {
        return 'displays';
    }
    if (SENSOR_TYPES.has(comp.type)) return 'sensors';
    if (INPUT_TYPES.has(comp.type)) return 'input';
    if (ACTUATOR_TYPES.has(comp.type)) return 'actuators';
    return 'other';
}

interface AddComponentMenuProps {
    diagram?: WokwiDiagram;
    customChipManifests?: Record<string, { title: string }>;
    pan: { x: number; y: number };
    zoom: number;
    disabled?: boolean;
    onAddComponent?: (part: WokwiPart) => void;
}

export default function AddComponentMenu({
    diagram,
    customChipManifests,
    pan,
    zoom,
    disabled = false,
    onAddComponent,
}: Readonly<AddComponentMenuProps>) {
    const [showMenu, setShowMenu] = useState(false);
    const [query, setQuery] = useState('');
    const [category, setCategory] = useState<ComponentCategoryId>('all');
    const [activeIndex, setActiveIndex] = useState(0);
    const searchRef = useRef<HTMLInputElement>(null);
    const itemRefs = useRef<Record<number, HTMLButtonElement | null>>({});

    useEffect(() => {
        if (disabled) {
            setShowMenu(false);
        }
    }, [disabled]);

    useEffect(() => {
        if (showMenu) {
            setQuery('');
            setCategory('all');
            setActiveIndex(0);
            setTimeout(() => searchRef.current?.focus(), 30);
        }
    }, [showMenu]);

    useEffect(() => {
        if (!showMenu) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setShowMenu(false);
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [showMenu]);

    const allComponents = useMemo(() => {
        const customChipComponents: WokwiComponentDef[] = Object.entries(customChipManifests ?? {}).map(([chipName, manifest]) => ({
            type: `chip-${chipName}`,
            label: `Chip: ${manifest.title || chipName}`,
            attrs: {},
        }));
        return [...COMMON_COMPONENTS, ...customChipComponents];
    }, [customChipManifests]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return allComponents.filter((comp) => {
            if (category !== 'all' && getComponentCategory(comp) !== category) {
                return false;
            }
            if (!q) return true;
            return comp.label.toLowerCase().includes(q) || comp.type.toLowerCase().includes(q);
        });
    }, [allComponents, category, query]);

    const safeActiveIndex = filtered.length > 0 ? Math.min(activeIndex, filtered.length - 1) : 0;

    useEffect(() => {
        if (!showMenu || filtered.length === 0) return;
        itemRefs.current[safeActiveIndex]?.scrollIntoView({ block: 'nearest' });
    }, [filtered.length, safeActiveIndex, showMenu]);

    const handleAdd = (comp: WokwiComponentDef) => {
        if (onAddComponent) {
            const shortName = comp.type.replace('wokwi-', '').replace(/-/g, '');
            const existingIds = new Set((diagram?.parts ?? []).map((p) => p.id));
            let suffix = (diagram?.parts ?? []).filter((p) => p.type === comp.type).length + 1;
            while (existingIds.has(`${shortName}${suffix}`)) {
                suffix += 1;
            }
            onAddComponent({
                type: comp.type,
                id: `${shortName}${suffix}`,
                top: Math.round((-pan.y) / zoom + 150 + Math.random() * 50),
                left: Math.round((-pan.x) / zoom + 150 + Math.random() * 50),
                rotate: 0,
                attrs: comp.attrs ? { ...comp.attrs } : {},
            });
        }
        setShowMenu(false);
    };

    return (
        <div className="relative">
            {/* Transparent backdrop to close menu on outside click */}
            {showMenu && (
                <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowMenu(false)}
                />
            )}

            <button
                type="button"
                disabled={disabled}
                onClick={() => { if (!disabled) setShowMenu(!showMenu); }}
                className={[
                    'flex items-center justify-center',
                    'w-7 h-7 rounded-full transition-all border',
                    disabled
                        ? 'opacity-40 cursor-not-allowed bg-vscode-input text-vscode-text border-vscode-border'
                        : [
                            'bg-vscode-input hover:bg-blue-600',
                            'text-vscode-text opacity-80 hover:text-vscode-textActive hover:opacity-100',
                            'border-vscode-border hover:border-blue-500',
                            showMenu ? 'bg-blue-600 text-white border-blue-500' : '',
                        ].join(' '),
                ].join(' ')}
                title={disabled ? 'Open or create a project to add components' : 'Add Component'}
            >
                <Plus size={16} strokeWidth={2.5} />
            </button>

            {showMenu && (
                <div
                    className={[
                        'absolute left-0 top-8 mt-1 w-72',
                        'bg-vscode-bg',
                        'border border-vscode-border shadow-2xl',
                        'rounded-lg z-50',
                        'flex flex-col overflow-hidden',
                    ].join(' ')}
                    style={{ maxHeight: 360 }}
                >
                    {/* Search input */}
                    <div className="flex items-center gap-1.5 px-2.5 py-2 border-b border-vscode-border bg-vscode-surface">
                        <Search size={12} className="text-vscode-text opacity-60 shrink-0" />
                        <input
                            ref={searchRef}
                            value={query}
                            onChange={(e) => {
                                setQuery(e.target.value);
                                setActiveIndex(0);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'ArrowDown' && filtered.length > 0) {
                                    e.preventDefault();
                                    setActiveIndex((idx) => Math.min(filtered.length - 1, idx + 1));
                                } else if (e.key === 'ArrowUp' && filtered.length > 0) {
                                    e.preventDefault();
                                    setActiveIndex((idx) => Math.max(0, idx - 1));
                                } else if (e.key === 'Enter' && filtered[safeActiveIndex]) {
                                    e.preventDefault();
                                    handleAdd(filtered[safeActiveIndex]);
                                }
                            }}
                            placeholder="Search components… (↑/↓ Enter)"
                            className={[
                                'flex-1 bg-transparent text-[12px]',
                                'text-vscode-textActive outline-none',
                                'placeholder:text-vscode-text placeholder:opacity-55',
                            ].join(' ')}
                        />
                        {query && (
                            <button
                                onClick={() => {
                                    setQuery('');
                                    setActiveIndex(0);
                                }}
                                className="text-vscode-text opacity-55 hover:opacity-100 text-[10px]"
                            >
                                ✕
                            </button>
                        )}
                    </div>

                    {/* Category chips */}
                    <div className="flex items-center gap-1 px-2 py-1.5 border-b border-vscode-border bg-vscode-surface overflow-x-auto no-scrollbar shrink-0">
                        {COMPONENT_CATEGORIES.map((cat) => {
                            if (cat.id === 'chips' && !allComponents.some((c) => c.type.startsWith('chip-'))) {
                                return null;
                            }
                            const isActive = category === cat.id;
                            return (
                                <button
                                    key={cat.id}
                                    type="button"
                                    onClick={() => {
                                        setCategory(cat.id);
                                        setActiveIndex(0);
                                    }}
                                    className={[
                                        'px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0 border transition-colors',
                                        isActive
                                            ? 'bg-blue-600/25 border-blue-500/60 text-blue-300'
                                            : 'border-vscode-border bg-vscode-bg/40 text-vscode-text opacity-70 hover:opacity-100',
                                    ].join(' ')}
                                >
                                    {cat.label}
                                </button>
                            );
                        })}
                    </div>

                    {/* Scrollable list */}
                    <div className="overflow-y-auto flex-1 py-1">
                        {filtered.length === 0 ? (
                            <p className="px-3 py-4 text-[12px] text-vscode-text opacity-60 text-center">
                                No components match &ldquo;{query}&rdquo;
                            </p>
                        ) : (
                            filtered.map((comp, idx) => {
                                const isHighlighted = idx === safeActiveIndex;
                                return (
                                    <button
                                        key={comp.type}
                                        ref={(el) => {
                                            itemRefs.current[idx] = el;
                                        }}
                                        type="button"
                                        onMouseEnter={() => setActiveIndex(idx)}
                                        className={[
                                            'w-full text-left px-3 py-1.5 text-xs flex items-center justify-between gap-2 transition-colors',
                                            isHighlighted
                                                ? 'bg-vscode-hover text-vscode-textActive'
                                                : 'text-vscode-text hover:bg-vscode-hover hover:text-vscode-textActive',
                                        ].join(' ')}
                                        onClick={() => handleAdd(comp)}
                                    >
                                        <span>{comp.label}</span>
                                        <span className="text-[10px] font-mono opacity-45 truncate">
                                            {comp.type.replace('wokwi-', '')}
                                        </span>
                                    </button>
                                );
                            })
                        )}
                    </div>

                    {/* Footer count */}
                    <div className="px-3 py-1.5 border-t border-vscode-border text-[11px] text-vscode-text opacity-60 bg-vscode-surface">
                        {filtered.length} / {allComponents.length} components
                    </div>
                </div>
            )}
        </div>
    );
}
