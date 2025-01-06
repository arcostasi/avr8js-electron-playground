/**
 * PinOverlay
 * SVG overlay with interactive pin dots and hitboxes for wiring.
 */
import React from 'react';
import type { PinPosition } from '../../types/wokwi.types';

interface PinOverlayProps {
    pinPositions: Record<string, PinPosition>;
    wiringStart: string | null;
    hoveredPin: string | null;
    onHoverPin: (pinId: string | null) => void;
    onWiringStart: (pinId: string) => void;
    onWiringEnd: (pinId: string) => void;
    setDraggingPart: (id: string | null) => void;
}

export default function PinOverlay({
    pinPositions,
    wiringStart,
    hoveredPin,
    onHoverPin,
    onWiringStart,
    onWiringEnd,
    setDraggingPart,
}: PinOverlayProps) {
    return (
        <>
            {Object.entries(pinPositions).map(([pinId, pos]) => {
                const isActive = wiringStart === pinId;
                const isHovered = hoveredPin === pinId;
                const isVisible = isActive || isHovered;

                return (
                    <g key={`pin-${pinId}`}>
                        {/* Glow ring — only on hover/active */}
                        {isVisible && (
                            <circle
                                cx={pos.x} cy={pos.y} r={12}
                                fill="none"
                                stroke="rgba(59,130,246,0.3)"
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
                                fill={isActive ? '#3b82f6' : 'rgba(59,130,246,0.6)'}
                                stroke={isActive ? '#93c5fd' : '#60a5fa'}
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
                            className="cursor-crosshair"
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
