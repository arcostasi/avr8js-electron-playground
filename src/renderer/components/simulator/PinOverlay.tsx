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
    pinDescriptors?: Record<string, WiringCandidateDescriptor>;
    onHoverPin: (pinId: string | null) => void;
    onWiringStart: (pinId: string) => void;
    onWiringEnd: (pinId: string) => void;
    setDraggingPart: (id: string | null) => void;
}

export default function PinOverlay({
    pinPositions,
    wiringStart,
    hoveredPin,
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
                const isHovered = hoveredPin === pinId;
                const descriptor = pinDescriptors[pinId] ?? { status: 'neutral', tone: 'neutral' };
                const isCandidate = descriptor.status !== 'neutral';
                const isVisible = isActive || isHovered || isCandidate;
                const palette = getPinOverlayPalette(isActive, descriptor.tone);
                const hitboxClass = descriptor.status === 'invalid'
                    ? 'cursor-not-allowed'
                    : 'cursor-crosshair';

                return (
                    <g key={`pin-${pinId}`}>
                        {/* Glow ring — only on hover/active */}
                        {isVisible && (
                            <circle
                                cx={pos.x} cy={pos.y} r={12}
                                fill="none"
                                stroke={palette.ring}
                                strokeWidth={2}
                                className="animate-pulse"
                            />
                        )}
                        {/* Visible pad dot — only on hover/active */}
                        {isVisible && (
                            <circle
                                cx={pos.x}
                                cy={pos.y}
                                r={isActive ? 6 : 5}
                                fill={palette.fill}
                                stroke={palette.stroke}
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
}
