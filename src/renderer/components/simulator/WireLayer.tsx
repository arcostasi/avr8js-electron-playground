/**
 * WireLayer
 * SVG layer that renders all wires (permanent + temporary preview).
 */
import React from 'react';

interface WireLayerProps {
    wires: React.ReactNode[];
}

export default function WireLayer({ wires }: WireLayerProps) {
    return (
        <svg
            className="absolute inset-0 pointer-events-none z-30"
            style={{ minWidth: '100%', minHeight: '100%', overflow: 'visible' }}
        >
            {wires}
        </svg>
    );
}
