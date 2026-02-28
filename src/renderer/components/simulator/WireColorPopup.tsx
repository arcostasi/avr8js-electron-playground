import React, { useEffect, useRef } from 'react';
import { WIRE_COLORS } from '../../constants/wokwi-components';

interface WireColorPopupProps {
    x: number;
    y: number;
    currentColor: string;
    onSelectColor: (color: string) => void;
    onClose: () => void;
}

export default function WireColorPopup({ x, y, currentColor, onSelectColor, onClose }: WireColorPopupProps) {
    const popupRef = useRef<HTMLDivElement>(null);

    // Close on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
                onClose();
            }
        };

        // Small delay so the click that opened it doesn't immediately close it
        const timer = setTimeout(() => {
            document.addEventListener('click', handleClickOutside);
        }, 10);

        return () => {
            clearTimeout(timer);
            document.removeEventListener('click', handleClickOutside);
        };
    }, [onClose]);

    return (
        <div
            ref={popupRef}
            className={[
                'absolute z-50 bg-[#2a2a2a]',
                'border border-[#444] rounded-lg',
                'shadow-xl shadow-black/50 p-2',
                'flex flex-wrap gap-1.5 w-[140px]',
            ].join(' ')}
            style={{
                left: `${x}px`,
                top: `${y}px`,
                transform: 'translate(-50%, -100%)',
                marginTop: '-10px'
            }}
            // Stop pointerdown from bubbling to the canvas container.
            // Without this, handleCanvasPointerDown fires and calls
            // setPopupState(null) BEFORE the color-swatch click event is
            // processed, so the color never gets applied.
            onPointerDown={(e) => e.stopPropagation()}
        >
            {/* Tailwind/Lucide standard tip pointing down */}
            <div className={
                'absolute -bottom-2 left-1/2 '
                + '-translate-x-1/2 w-0 h-0 '
                + 'border-l-[8px] border-r-[8px] '
                + 'border-t-[8px] border-l-transparent '
                + 'border-r-transparent '
                + 'border-t-[#2a2a2a] drop-shadow-sm'
            } />

            <div className="w-full text-center text-[10px] text-gray-400 font-medium mb-1 uppercase tracking-wider">
                Wire Color
            </div>

            <div className="flex flex-wrap gap-2 justify-center pb-1">
                {WIRE_COLORS.map(c => (
                    <button
                        key={c}
                        onClick={() => {
                            onSelectColor(c);
                            onClose();
                        }}
                        title={c}
                        className={`w-5 h-5 rounded-full transition-all border ${currentColor === c
                                ? 'border-white scale-110 shadow-sm shadow-white/30'
                                : 'border-[#555] opacity-70 hover:opacity-100 hover:scale-110'
                            }`}
                        style={{ backgroundColor: c }}
                    />
                ))}
            </div>
        </div>
    );
}
