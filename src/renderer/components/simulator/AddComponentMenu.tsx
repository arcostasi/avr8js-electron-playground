/**
 * AddComponentMenu
 * Dropdown menu for adding Wokwi components to the diagram.
 * Includes live search / filter.
 */
import React, { useState, useRef, useEffect } from 'react';
import { Plus, Search } from 'lucide-react';
import { COMMON_COMPONENTS } from '../../constants/wokwi-components';
import type { WokwiPart, WokwiDiagram } from '../../types/wokwi.types';

interface AddComponentMenuProps {
    diagram?: WokwiDiagram;
    pan: { x: number; y: number };
    zoom: number;
    onAddComponent?: (part: WokwiPart) => void;
}

export default function AddComponentMenu({ diagram, pan, zoom, onAddComponent }: AddComponentMenuProps) {
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

    const q = query.trim().toLowerCase();
    const filtered = q
        ? COMMON_COMPONENTS.filter(c => c.label.toLowerCase().includes(q) || c.type.toLowerCase().includes(q))
        : COMMON_COMPONENTS;

    const handleAdd = (comp: typeof COMMON_COMPONENTS[0]) => {
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
                    'bg-[#333] hover:bg-blue-600',
                    'text-gray-400 hover:text-white',
                    'transition-all border border-[#555]',
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
                        'bg-[#2a2a2a]',
                        'border border-[#444] shadow-2xl',
                        'rounded-lg z-50',
                        'flex flex-col',
                    ].join(' ')}
                    style={{ maxHeight: 320 }}
                >
                    {/* Search input */}
                    <div className="flex items-center gap-1.5 px-2.5 py-2 border-b border-[#3a3a3a]">
                        <Search size={12} className="text-gray-500 shrink-0" />
                        <input
                            ref={searchRef}
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="Search components…"
                            className={[
                                'flex-1 bg-transparent text-[12px]',
                                'text-gray-200 outline-none',
                                'placeholder:text-gray-600',
                            ].join(' ')}
                        />
                        {query && (
                            <button
                                onClick={() => setQuery('')}
                                className="text-gray-600 hover:text-gray-400 text-[10px]"
                            >✕</button>
                        )}
                    </div>

                    {/* Scrollable list */}
                    <div className="overflow-y-auto flex-1 py-1">
                        {filtered.length === 0 ? (
                            <p className="px-3 py-4 text-[12px] text-gray-500 text-center">
                                No components match "{query}"
                            </p>
                        ) : (
                            filtered.map((comp) => (
                                <button
                                    key={comp.type}
                                    className={
                                        'w-full text-left px-3 py-1.5 '
                                        + 'text-xs text-gray-400 '
                                        + 'hover:bg-[#333] hover:text-white '
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
                    <div className="px-3 py-1.5 border-t border-[#3a3a3a] text-[11px] text-gray-600">
                        {filtered.length} / {COMMON_COMPONENTS.length} components
                    </div>
                </div>
            )}
        </div>
    );
}
