import React, { useEffect, useRef } from 'react';
import { Trash2 } from 'lucide-react';
import type { PartColorSwatch } from '../../constants/part-colors';

interface PartColorPopupProps {
    x: number;
    y: number;
    title: string;
    currentColor: string;
    swatches: PartColorSwatch[];
    onSelectColor: (color: string) => void;
    onDelete?: () => void;
    onClose: () => void;
}

export const PartColorPopup: React.FC<PartColorPopupProps> = ({
    x,
    y,
    title,
    currentColor,
    swatches,
    onSelectColor,
    onDelete,
    onClose,
}) => {
    const popupRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        const timer = setTimeout(() => {
            document.addEventListener('mousedown', handleClickOutside);
        }, 10);
        return () => {
            clearTimeout(timer);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [onClose]);

    const normalizedCurrent = currentColor.trim().toLowerCase();

    return (
        <div
            ref={popupRef}
            className="absolute z-50 bg-neutral-900 border border-neutral-700/80 rounded-lg shadow-2xl p-2 flex flex-col gap-2 min-w-[164px]"
            style={{
                left: `${x}px`,
                top: `${y}px`,
                transform: 'translate(-50%, -100%) translateY(-10px)',
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
        >
            <div className="text-[11px] font-medium text-neutral-400 px-1 flex items-center justify-between">
                <span>{title}</span>
                <button
                    type="button"
                    onClick={onClose}
                    className="text-neutral-500 hover:text-neutral-300 text-xs leading-none cursor-pointer"
                    aria-label="Close"
                >
                    ×
                </button>
            </div>

            <div className="grid grid-cols-6 gap-1.5 px-0.5">
                {swatches.map((swatch) => {
                    const isActive = swatch.value.toLowerCase() === normalizedCurrent;
                    return (
                        <button
                            key={swatch.value}
                            type="button"
                            title={swatch.label}
                            aria-label={swatch.label}
                            onClick={() => onSelectColor(swatch.value)}
                            className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-125 cursor-pointer ${
                                isActive
                                    ? 'border-white scale-110 ring-2 ring-white/30'
                                    : 'border-neutral-600'
                            }`}
                            style={{ background: swatch.fill }}
                        />
                    );
                })}
            </div>

            {onDelete && (
                <button
                    type="button"
                    onClick={onDelete}
                    className={[
                        'mt-1 pt-1.5 border-t border-neutral-800 text-[11px]',
                        'text-rose-400 hover:text-rose-300 hover:bg-rose-500/10',
                        'rounded px-1.5 py-1 text-left flex items-center gap-1.5',
                        'transition-colors cursor-pointer',
                    ].join(' ')}
                >
                    <Trash2 className="w-3 h-3" />
                    Remove component
                </button>
            )}
        </div>
    );
};
