/**
 * AddComponentMenu
 * Dropdown menu for adding Wokwi components to the diagram.
 * Includes live search / filter.
 */
import React, { useState, useRef, useEffect } from 'react';
import { Plus, Search } from 'lucide-react';
import { COMMON_COMPONENTS } from '../../constants/wokwi-components';
import type { WokwiPart, WokwiDiagram } from '../../types/wokwi.types';
import type { WokwiComponentDef } from '../../types/wokwi.types';

interface AddComponentMenuProps {
    diagram?: WokwiDiagram;
    customChipManifests?: Record<string, { title: string }>;
    pan: { x: number; y: number };
    zoom: number;
    onAddComponent?: (part: WokwiPart) => void;
}

export default function AddComponentMenu({ diagram, customChipManifests, pan, zoom, onAddComponent }: AddComponentMenuProps) {
    const [showMenu, setShowMenu] = useState(false);
    const [query, setQuery] = useState('');
    const searchRef = useRef<HTMLInputElement>(null);

    // Focus search input when menu opens
    useEffect(() => {
        if (showMenu) {
            setQuery('');
            setTimeout(() => searchRef.current?.focus(), 30);
        }
    }, [showMenu]);

    // Close on Escape
    useEffect(() => {
        if (!showMenu) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setShowMenu(false);
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [showMenu]);

    const customChipComponents: WokwiComponentDef[] = Object.entries(customChipManifests ?? {}).map(([chipName, manifest]) => ({
        type: `chip-${chipName}`,
        label: `Chip: ${manifest.title || chipName}`,
        attrs: {},
    }));

    const allComponents = [...COMMON_COMPONENTS, ...customChipComponents];

    const q = query.trim().toLowerCase();
    const filtered = q
        ? allComponents.filter(c => c.label.toLowerCase().includes(q) || c.type.toLowerCase().includes(q))
        : allComponents;

    const handleAdd = (comp: WokwiComponentDef) => {
        if (onAddComponent) {
            const shortName = comp.type.replace('wokwi-', '').replace(/-/g, '');
            const existingCount = (diagram?.parts ?? []).filter(p => p.type === comp.type).length;
            onAddComponent({
                type: comp.type,
                id: `${shortName}${existingCount + 1}`,
                top: Math.round((-pan.y) / zoom + 150 + Math.random() * 50),
                left: Math.round((-pan.x) / zoom + 150 + Math.random() * 50),
                rotate: 0,
                attrs: comp.attrs ?? {},
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
                onClick={() => setShowMenu(!showMenu)}
                className={[
                    'flex items-center justify-center',
                    'w-7 h-7 rounded-full',
                    'bg-vscode-input hover:bg-blue-600',
                    'text-vscode-text opacity-80 hover:text-vscode-textActive hover:opacity-100',
                    'transition-all border border-vscode-border',
                    'hover:border-blue-500',
                    showMenu ? 'bg-blue-600 text-white border-blue-500' : '',
                ].join(' ')}
                title="Add Component"
            >
                <Plus size={16} strokeWidth={2.5} />
            </button>

            {showMenu && (
                <div
                    className={[
                        'absolute left-0 top-8 mt-1 w-64',
                        'bg-vscode-bg',
                        'border border-vscode-border shadow-2xl',
                        'rounded-lg z-50',
                        'flex flex-col',
                    ].join(' ')}
                    style={{ maxHeight: 320 }}
                >
                    {/* Search input */}
                    <div className="flex items-center gap-1.5 px-2.5 py-2 border-b border-vscode-border bg-vscode-surface">
                        <Search size={12} className="text-vscode-text opacity-60 shrink-0" />
                        <input
                            ref={searchRef}
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="Search components…"
                            className={[
                                'flex-1 bg-transparent text-[12px]',
                                'text-vscode-text outline-none',
                                'placeholder:text-vscode-text placeholder:opacity-55',
                            ].join(' ')}
                        />
                        {query && (
                            <button
                                onClick={() => setQuery('')}
                                className="text-vscode-text opacity-55 hover:opacity-100 text-[10px]"
                            >✕</button>
                        )}
                    </div>

                    {/* Scrollable list */}
                    <div className="overflow-y-auto flex-1 py-1">
                        {filtered.length === 0 ? (
                            <p className="px-3 py-4 text-[12px] text-vscode-text opacity-60 text-center">
                                No components match "{query}"
                            </p>
                        ) : (
                            filtered.map((comp) => (
                                <button
                                    key={comp.type}
                                    className={
                                        'w-full text-left px-3 py-1.5 '
                                        + 'text-xs text-vscode-text '
                                        + 'hover:bg-vscode-hover hover:text-vscode-textActive '
                                        + 'transition-colors'
                                    }
                                    onClick={() => handleAdd(comp)}
                                >
                                    {comp.label}
                                </button>
                            ))
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
