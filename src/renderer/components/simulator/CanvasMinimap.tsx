/**
 * CanvasMinimap
 * A thumbnail overview of the circuit canvas in the bottom-right corner.
 * Shows parts as colored rectangles scaled to fit a fixed preview area.
 * Clicking the minimap pans the main canvas to that position.
 */
import React, { useRef, useEffect, useMemo } from 'react';
import type { WokwiDiagram } from '../../types/wokwi.types';

const MINI_W = 160;
const MINI_H = 100;

interface CanvasMinimapProps {
    diagram: WokwiDiagram | null;
    /** Current canvas pan offset */
    pan: { x: number; y: number };
    /** Current canvas zoom level */
    zoom: number;
    /** Viewport size in CSS pixels */
    viewportW: number;
    viewportH: number;
    /** Called when user clicks a position in the minimap */
    onPanTo: (worldX: number, worldY: number) => void;
}

const PART_COLOR = '#3b82f6'; // blue-500
const VIEWPORT_COLOR = 'rgba(59, 130, 246, 0.25)';

export default function CanvasMinimap({
    diagram,
    pan,
    zoom,
    viewportW,
    viewportH,
    onPanTo,
}: CanvasMinimapProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const parts = diagram?.parts ?? [];

    // Compute world bounds from all parts
    const bounds = useMemo(() => {
        if (parts.length === 0) return { minX: -200, minY: -200, maxX: 600, maxY: 500 };
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of parts) {
            minX = Math.min(minX, p.left);
            minY = Math.min(minY, p.top);
            maxX = Math.max(maxX, p.left + 100); // assume ~100px width
            maxY = Math.max(maxY, p.top + 80);   // assume ~80px height
        }
        // Add padding
        const pad = 60;
        return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
    }, [parts]);

    const worldW = bounds.maxX - bounds.minX;
    const worldH = bounds.maxY - bounds.minY;

    // Scale world coords → minimap coords
    const toMini = (wx: number, wy: number) => ({
        mx: ((wx - bounds.minX) / worldW) * MINI_W,
        my: ((wy - bounds.minY) / worldH) * MINI_H,
    });

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, MINI_W, MINI_H);

        // Background — respect theme
        const isLight = !!canvas.closest('.theme-light');
        ctx.fillStyle = isLight ? 'rgba(220,220,220,0.92)' : 'rgba(10,10,10,0.85)';
        ctx.fillRect(0, 0, MINI_W, MINI_H);

        // Draw parts
        for (const part of parts) {
            const { mx, my } = toMini(part.left, part.top);
            const pw = Math.max(4, (100 / worldW) * MINI_W);
            const ph = Math.max(3, (60 / worldH) * MINI_H);
            ctx.fillStyle = PART_COLOR;
            ctx.globalAlpha = 0.8;
            ctx.fillRect(mx, my, pw, ph);
        }
        ctx.globalAlpha = 1;

        // Viewport rectangle
        // viewport in world coords:
        const vpWorldX = -pan.x / zoom;
        const vpWorldY = -pan.y / zoom;
        const vpWorldW = viewportW / zoom;
        const vpWorldH = viewportH / zoom;

        const { mx: vpMx, my: vpMy } = toMini(vpWorldX, vpWorldY);
        const vpMiniW = (vpWorldW / worldW) * MINI_W;
        const vpMiniH = (vpWorldH / worldH) * MINI_H;

        ctx.strokeStyle = 'rgba(250,250,250,0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(vpMx, vpMy, vpMiniW, vpMiniH);
        ctx.fillStyle = VIEWPORT_COLOR;
        ctx.fillRect(vpMx, vpMy, vpMiniW, vpMiniH);

        // Border
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.strokeRect(0, 0, MINI_W, MINI_H);
    }, [parts, pan, zoom, viewportW, viewportH, bounds, worldW, worldH]);

    const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        // Convert click position to world coords
        const wx = bounds.minX + (cx / MINI_W) * worldW;
        const wy = bounds.minY + (cy / MINI_H) * worldH;
        onPanTo(wx, wy);
    };

    return (
        <canvas
            ref={canvasRef}
            width={MINI_W}
            height={MINI_H}
            onClick={handleClick}
            title="Circuit minimap — click to navigate"
            className="rounded border border-[#333] cursor-crosshair"
            style={{
                position: 'absolute',
                bottom: 12,
                right: 12,
                zIndex: 30,
                imageRendering: 'pixelated',
            }}
        />
    );
}
