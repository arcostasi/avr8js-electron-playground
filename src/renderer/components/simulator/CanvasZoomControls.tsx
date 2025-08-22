/**
 * CanvasZoomControls
 * Floating zoom in/out/reset widget for the simulator canvas.
 */
import React from 'react';
import { ZoomIn, ZoomOut, Maximize } from 'lucide-react';

interface CanvasZoomControlsProps {
    zoom: number;
    onZoomIn: () => void;
    onZoomOut: () => void;
    onReset: () => void;
}

export default function CanvasZoomControls({
    zoom, onZoomIn, onZoomOut, onReset,
}: CanvasZoomControlsProps) {
    const btnCls = [
        'p-1.5 text-vscode-text hover:text-vscode-textActive',
        'hover:bg-vscode-hover',
        'transition-colors',
    ].join(' ');
    return (
        <div className={[
            'absolute right-3 bottom-3 flex',
            'bg-vscode-surface/95 backdrop-blur-sm',
            'border border-vscode-border rounded-lg shadow-xl z-20',
        ].join(' ')}>
            <button
                onClick={onZoomOut}
                className={btnCls}
                title="Zoom Out"
            >
                <ZoomOut size={15} />
            </button>
            <span className={[
                'px-2 py-1.5 text-[10px] font-mono',
                'text-vscode-text border-x border-vscode-border',
            ].join(' ')}>
                {Math.round(zoom * 100)}%
            </span>
            <button
                onClick={onReset}
                className={btnCls}
                title="Reset"
            >
                <Maximize size={15} />
            </button>
            <button
                onClick={onZoomIn}
                className={btnCls}
                title="Zoom In"
            >
                <ZoomIn size={15} />
            </button>
        </div>
    );
}
