/**
 * PinOverlay
 * SVG overlay with interactive pin dots and hitboxes for wiring.
 */
import React from 'react';
import type { PinPosition } from '../../types/wokwi.types';
import {
    getWiringCandidateToneAppearance,
    type WiringCandidateDescriptor,
    type WiringCandidateTone,
} from '../../utils/pin-capabilities';

interface PinOverlayPalette {
    ring: string;
    fill: string;
    stroke: string;
}

function getPinOverlayPalette(isActive: boolean, tone: WiringCandidateTone): PinOverlayPalette {
    if (isActive) {
        return {
            ring: 'rgba(59,130,246,0.3)',
            fill: '#3b82f6',
            stroke: '#93c5fd',
        };
    }

    const appearance = getWiringCandidateToneAppearance(tone);
    return {
        ring: appearance.ring,
        fill: appearance.fill,
        stroke: appearance.stroke,
    };
}

interface PinOverlayProps {
    pinPositions: Record<string, PinPosition>;
    wiringStart: string | null;
    hoveredPin: string | null;
    snappedPinId?: string | null;
    pinDescriptors?: Record<string, WiringCandidateDescriptor>;
    onHoverPin: (pinId: string | null) => void;
    onWiringStart: (pinId: string) => void;
    onWiringEnd: (pinId: string) => void;
    setDraggingPart: (id: string | null) => void;
}

const PinOverlay = React.memo(function PinOverlay({
    pinPositions,
    wiringStart,
    hoveredPin,
    snappedPinId = null,
    pinDescriptors = {},
    onHoverPin,
    onWiringStart,
    onWiringEnd,
    setDraggingPart,
}: Readonly<PinOverlayProps>) {
    return (
        <>
            {Object.entries(pinPositions).map(([pinId, pos]) => {
                const isActive = wiringStart === pinId;
                const isSnapped = snappedPinId === pinId;
                const isHovered = hoveredPin === pinId;
                const descriptor = pinDescriptors[pinId] ?? { status: 'neutral', tone: 'neutral' };
                const isCandidate = descriptor.status !== 'neutral';
                const isVisible = isActive || isSnapped || isHovered || isCandidate;
                const palette = getPinOverlayPalette(isActive, descriptor.tone);
                const hitboxClass = descriptor.status === 'invalid'
                    ? 'cursor-not-allowed'
                    : 'cursor-crosshair';

                return (
                    <g key={`pin-${pinId}`}>
                        {/* Magnetic snap lock ring */}
                        {isSnapped && !isActive && (
                            <circle
                                cx={pos.x} cy={pos.y} r={14}
                                fill="rgba(56, 189, 248, 0.14)"
                                stroke="#38bdf8"
                                strokeWidth={1.8}
                                strokeDasharray="3,2"
                            />
                        )}
                        {/* Glow ring — only on hover/active/snapped */}
                        {isVisible && (
                            <circle
                                cx={pos.x} cy={pos.y} r={12}
                                fill="none"
                                stroke={palette.ring}
                                strokeWidth={2}
                                className="animate-pulse"
                            />
                        )}
                        {/* Visible pad dot — only on hover/active/snapped */}
                        {isVisible && (
                            <circle
                                cx={pos.x}
                                cy={pos.y}
                                r={isActive || isSnapped ? 6 : 5}
                                fill={isSnapped ? '#38bdf8' : palette.fill}
                                stroke={isSnapped ? '#e0f2fe' : palette.stroke}
                                strokeWidth={1.5}
                            />
                        )}
                        {/* Invisible hitbox — always present for pointer events */}
                        <circle
                            cx={pos.x}
                            cy={pos.y}
                            r={10}
                            fill="transparent"
                            stroke="none"
                            className={hitboxClass}
                            style={{ pointerEvents: 'all' }}
                            onPointerEnter={() => onHoverPin(pinId)}
                            onPointerLeave={() => onHoverPin(null)}
                            onPointerDown={(e) => {
                                e.stopPropagation();
                                setDraggingPart(null);
                                onWiringStart(pinId);
                            }}
                            onPointerUp={(e) => {
                                e.stopPropagation();
                                onWiringEnd(pinId);
                            }}
                        />
                    </g>
                );
            })}
        </>
    );
});

export default PinOverlay;
