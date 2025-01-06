/**
 * AddComponentMenu
 * Dropdown menu for adding Wokwi components to the diagram.
 */
import React, { useState } from 'react';
import { Plus } from 'lucide-react';
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

    return (
        <div className="relative">
            <button
                onClick={() => setShowMenu(!showMenu)}
                className={[
                    'flex items-center justify-center',
                    'w-7 h-7 rounded-full',
                    'bg-[#333] hover:bg-blue-600',
                    'text-gray-400 hover:text-white',
                    'transition-all border border-[#555]',
                    'hover:border-blue-500',
                ].join(' ')}
                title="Add Component"
            >
                <Plus size={16} strokeWidth={2.5} />
            </button>
            {showMenu && (
                <div className={[
                    'absolute left-0 top-8 mt-1 w-60',
                    'max-h-80 overflow-y-auto bg-[#2a2a2a]',
                    'border border-[#444] shadow-2xl',
                    'rounded-lg z-50 py-1',
                ].join(' ')}>
                    {COMMON_COMPONENTS.map((comp) => (
                        <button
                            key={comp.type}
                            className={
                                'w-full text-left px-3 py-1.5 '
                                + 'text-xs text-gray-400 '
                                + 'hover:bg-[#333] hover:text-white '
                                + 'transition-colors'
                            }
                            onClick={() => {
                                if (onAddComponent) {
                                    const shortName = comp.type
                                        .replace('wokwi-', '')
                                        .replace(/-/g, '');
                                    const existingCount = (
                                        diagram?.parts ?? []
                                    ).filter(
                                        p => p.type === comp.type,
                                    ).length;
                                    onAddComponent({
                                        type: comp.type,
                                        id: `${shortName}${existingCount + 1}`,
                                        top: Math.round(
                                            (-pan.y) / zoom + 150
                                            + Math.random() * 50,
                                        ),
                                        left: Math.round(
                                            (-pan.x) / zoom + 150
                                            + Math.random() * 50,
                                        ),
                                        rotate: 0,
                                        attrs: comp.attrs ?? {},
                                    });
                                }
                                setShowMenu(false);
                            }}
                        >
                            {comp.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
