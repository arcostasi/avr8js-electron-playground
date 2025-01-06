/**
 * PinTooltip
 * Floating label that shows the hovered pin name in edit mode.
 */
import React from 'react';
import type { PinPosition } from '../../types/wokwi.types';

interface PinTooltipProps {
    hoveredPin: string | null;
    pinPositions: Record<string, PinPosition>;
    isEditMode: boolean;
    zoom: number;
    pan: { x: number; y: number };
}

export default function PinTooltip({
    hoveredPin, pinPositions, isEditMode, zoom, pan,
}: PinTooltipProps) {
    if (!hoveredPin || !pinPositions[hoveredPin] || !isEditMode) {
        return null;
    }

    const pos = pinPositions[hoveredPin];

    return (
        <div
            className={[
                'absolute z-40 pointer-events-none',
                'px-2 py-0.5 rounded bg-black/80',
                'text-[10px] font-mono text-blue-300',
                'border border-blue-500/30 shadow-lg',
                'whitespace-nowrap',
            ].join(' ')}
            style={{
                left: pos.x * zoom + pan.x + 14,
                top: pos.y * zoom + pan.y - 6,
            }}
        >
            {hoveredPin}
        </div>
    );
}
