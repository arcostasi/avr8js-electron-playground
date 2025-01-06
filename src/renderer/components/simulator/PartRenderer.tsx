/**
 * PartRenderer
 * Renders a single Wokwi custom element with optional drag overlay in edit mode.
 * Interactive components (buttons, switches, potentiometers) receive pointer events
 * during simulation (run mode) and stop propagation to prevent canvas panning.
 */
import React from 'react';
import type { WokwiPart } from '../../types/wokwi.types';

/** Component types that need to receive pointer events during simulation */
const INTERACTIVE_TYPES = new Set([
    'wokwi-pushbutton',
    'wokwi-pushbutton-6mm',
    'wokwi-slide-switch',
    'wokwi-tilt-switch',
    'wokwi-dip-switch-8',
    'wokwi-potentiometer',
    'wokwi-slide-potentiometer',
    'wokwi-analog-joystick',
    'wokwi-membrane-keypad',
    'wokwi-ky-040',
    'wokwi-rotary-dialer',
    'wokwi-ir-remote',
]);

interface PartRendererProps {
    part: WokwiPart;
    isEditMode: boolean;
    isDragging: boolean;
    onPartPointerDown: (e: React.PointerEvent, part: WokwiPart) => void;
}

export default function PartRenderer({ part, isEditMode, isDragging, onPartPointerDown }: PartRendererProps) {
    if (part.hide) return null;

    const TagName = part.type as string;
    const isInteractive = INTERACTIVE_TYPES.has(part.type);

    // In run mode, interactive components get pointer-events-auto and stop propagation
    // to prevent accidental canvas panning when clicking buttons/turning knobs.
    const handleInteractivePointerDown = (e: React.PointerEvent) => {
        if (!isEditMode && isInteractive) {
            e.stopPropagation();
        }
    };

    return (
        <div
            className={`absolute ${isDragging ? 'z-50 opacity-80' : 'z-10'} ${isEditMode ? '' : 'pointer-events-auto'}`}
            style={{
                top: `${part.top}px`,
                left: `${part.left}px`,
                transform: part.rotate ? `rotate(${part.rotate}deg)` : undefined,
                filter: isDragging ? 'drop-shadow(0 4px 12px rgba(59,130,246,0.4))' : undefined,
            }}
            onPointerDown={handleInteractivePointerDown}
        >
            {/* @ts-expect-error Wokwi custom elements are not standard HTML elements */}
            <TagName id={part.id} {...(part.attrs ?? {})} />
            {isEditMode && (
                <div
                    className="absolute inset-0 z-20 pointer-events-auto rounded"
                    style={{
                        cursor: isDragging ? 'grabbing' : 'grab',
                        outline: isDragging ? '2px solid rgba(59,130,246,0.5)' : 'none',
                    }}
                    onPointerDown={(e) => onPartPointerDown(e, part)}
                />
            )}
        </div>
    );
}
