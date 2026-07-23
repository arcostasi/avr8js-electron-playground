/**
 * CanvasZoomControls
 * Floating zoom in/out/reset widget for the simulator canvas.
 */
import React from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';

interface CanvasZoomControlsProps {
    zoom: number;
    onZoomIn: () => void;
    onZoomOut: () => void;
    onReset: () => void;
}

export default function CanvasZoomControls({
    zoom, onZoomIn, onZoomOut, onReset,
}: Readonly<CanvasZoomControlsProps>) {
    const canZoomOut = zoom > 0.1 + 1e-4;
    const canZoomIn = zoom < 5 - 1e-4;

    return (
        <div
            onPointerDown={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
            className={[
                'absolute right-3 bottom-3 flex items-center',
                'bg-vscode-surface/95 backdrop-blur-sm',
                'border border-vscode-border rounded-lg shadow-xl z-20',
            ].join(' ')}
        >
            <button
                type="button"
                onClick={onZoomOut}
                disabled={!canZoomOut}
                aria-label="Zoom out"
                title="Zoom Out"
                className={[
                    'p-1.5 transition-colors rounded-l-lg',
                    canZoomOut
                        ? 'text-vscode-text hover:text-vscode-textActive hover:bg-vscode-hover'
                        : 'text-vscode-border cursor-not-allowed',
                ].join(' ')}
            >
                <ZoomOut size={15} />
            </button>
            <button
                type="button"
                onClick={onReset}
                aria-label="Reset zoom to 100%"
                title="Click to reset zoom to 100%"
                className={[
                    'min-w-[3.25rem] text-center px-2 py-1.5 text-[10px] font-mono tabular-nums',
                    'text-vscode-text hover:text-vscode-textActive hover:bg-vscode-hover',
                    'border-x border-vscode-border transition-colors',
                ].join(' ')}
            >
                {Math.round(zoom * 100)}%
            </button>
            <button
                type="button"
                onClick={onZoomIn}
                disabled={!canZoomIn}
                aria-label="Zoom in"
                title="Zoom In"
                className={[
                    'p-1.5 transition-colors rounded-r-lg',
                    canZoomIn
                        ? 'text-vscode-text hover:text-vscode-textActive hover:bg-vscode-hover'
                        : 'text-vscode-border cursor-not-allowed',
                ].join(' ')}
            >
                <ZoomIn size={15} />
            </button>
        </div>
    );
}
