/**
 * useCanvasInteraction
 * Manages all canvas interaction state: pan, zoom, drag, and pointer handlers.
 */
import { useRef, useState, useCallback } from 'react';
import type { WokwiPart, WokwiDiagram } from '../types/wokwi.types';

export interface CanvasInteractionState {
    pan: { x: number; y: number };
    zoom: number;
    isPanning: boolean;
    draggingPart: string | null;
    mousePos: { x: number; y: number };
    containerRef: React.RefObject<HTMLDivElement | null>;
}

export interface CanvasInteractionHandlers {
    handleWheel: (e: React.WheelEvent) => void;
    handlePointerDown: (e: React.PointerEvent) => void;
    handlePointerMove: (e: React.PointerEvent) => void;
    handlePointerUp: () => void;
    handlePartPointerDown: (e: React.PointerEvent, part: WokwiPart) => void;
    setZoom: React.Dispatch<React.SetStateAction<number>>;
    setPan: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
    setDraggingPart: React.Dispatch<React.SetStateAction<string | null>>;
}

export function useCanvasInteraction(
    diagramRef: React.RefObject<WokwiDiagram | undefined>,
    onDiagramChange?: (newDiagram: WokwiDiagram) => void,
): CanvasInteractionState & CanvasInteractionHandlers {
    const containerRef = useRef<HTMLDivElement | null>(null);

    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [isPanning, setIsPanning] = useState(false);
    const [draggingPart, setDraggingPart] = useState<string | null>(null);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

    const handleWheel = useCallback((e: React.WheelEvent) => {
        if (e.ctrlKey || e.metaKey) {
            const zoomDelta = e.deltaY > 0 ? 0.9 : 1.1;
            setZoom(z => Math.max(0.1, Math.min(z * zoomDelta, 5)));
        } else {
            setPan(p => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
        }
    }, []);

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        if (e.button === 1 || e.button === 2 || (e.button === 0 && e.target === containerRef.current)) {
            setIsPanning(true);
        }
    }, []);

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (!containerRef.current) return;
        const containerRect = containerRef.current.getBoundingClientRect();

        setMousePos({
            x: e.clientX - containerRect.left,
            y: e.clientY - containerRect.top,
        });

        if (isPanning) {
            setPan(p => ({ x: p.x + e.movementX, y: p.y + e.movementY }));
        } else if (draggingPart && diagramRef.current) {
            const clickX = e.clientX - containerRect.left;
            const clickY = e.clientY - containerRect.top;

            const newLeft = (clickX - dragOffset.x - pan.x) / zoom;
            const newTop = (clickY - dragOffset.y - pan.y) / zoom;

            const updatedParts = diagramRef.current.parts.map(p =>
                p.id === draggingPart ? { ...p, left: Math.round(newLeft), top: Math.round(newTop) } : p
            );

            if (onDiagramChange) {
                onDiagramChange({ ...diagramRef.current, parts: updatedParts });
            }
        }
    }, [isPanning, draggingPart, dragOffset, pan, zoom, diagramRef, onDiagramChange]);

    const handlePointerUp = useCallback(() => {
        setIsPanning(false);
        setDraggingPart(null);
    }, []);

    const handlePartPointerDown = useCallback((e: React.PointerEvent, part: WokwiPart) => {
        e.stopPropagation();
        if (e.button !== 0) return;

        const container = containerRef.current;
        if (!container) return;
        const containerRect = container.getBoundingClientRect();
        const clickX = e.clientX - containerRect.left;
        const clickY = e.clientY - containerRect.top;

        setDragOffset({
            x: clickX - (part.left * zoom + pan.x),
            y: clickY - (part.top * zoom + pan.y),
        });
        setDraggingPart(part.id);
    }, [zoom, pan]);

    return {
        pan, zoom, isPanning, draggingPart, mousePos, containerRef,
        handleWheel, handlePointerDown, handlePointerMove, handlePointerUp,
        handlePartPointerDown, setZoom, setPan, setDraggingPart,
    };
}
