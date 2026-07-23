/**
 * useCanvasInteraction
 * Manages all canvas interaction state: pan, zoom, drag, and pointer handlers.
 */
import { useRef, useState, useCallback, useEffect } from 'react';
import type { WokwiPart, WokwiDiagram } from '../types/wokwi.types';

export interface DragPartPreview {
    partId: string;
    left: number;
    top: number;
}

export interface CanvasInteractionState {
    pan: { x: number; y: number };
    zoom: number;
    isPanning: boolean;
    draggingPart: string | null;
    dragPreview: DragPartPreview | null;
    mousePos: { x: number; y: number };
    containerRef: React.RefObject<HTMLDivElement | null>;
}

export interface CanvasInteractionHandlers {
    handleWheel: (e: React.WheelEvent) => void;
    handlePointerDown: (e: React.PointerEvent) => void;
    handlePointerMove: (e: React.PointerEvent) => void;
    handlePointerUp: () => void;
    handlePartPointerDown: (e: React.PointerEvent, part: WokwiPart) => void;
    consumeRecentPartDrag: () => boolean;
    setZoom: React.Dispatch<React.SetStateAction<number>>;
    setPan: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
    setDraggingPart: React.Dispatch<React.SetStateAction<string | null>>;
    resetInteraction: () => void;
}

export function useCanvasInteraction(
    diagramRef: React.RefObject<WokwiDiagram | undefined>,
    onDiagramChange?: (newDiagram: WokwiDiagram) => void,
    isWiring = false,
): CanvasInteractionState & CanvasInteractionHandlers {
    const containerRef = useRef<HTMLDivElement | null>(null);

    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [isPanning, setIsPanning] = useState(false);
    const [draggingPart, setDraggingPart] = useState<string | null>(null);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [dragPreview, setDragPreview] = useState<DragPartPreview | null>(null);
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

    const panRef = useRef(pan);
    const zoomRef = useRef(zoom);
    const isPanningRef = useRef(isPanning);
    const draggingPartRef = useRef(draggingPart);
    const dragOffsetRef = useRef(dragOffset);
    const dragPreviewRef = useRef<DragPartPreview | null>(dragPreview);
    const onDiagramChangeRef = useRef(onDiagramChange);
    const frameRafRef = useRef<number | null>(null);
    const pendingPanDeltaRef = useRef({ dx: 0, dy: 0 });
    const pendingPointerClientRef = useRef<{ x: number; y: number } | null>(null);
    const dragOriginRef = useRef<{ x: number; y: number } | null>(null);
    const dragMovedRef = useRef(false);
    const recentPartDragRef = useRef(false);
    panRef.current = pan;
    zoomRef.current = zoom;
    isPanningRef.current = isPanning;
    draggingPartRef.current = draggingPart;
    dragOffsetRef.current = dragOffset;
    dragPreviewRef.current = dragPreview;
    onDiagramChangeRef.current = onDiagramChange;

    const cancelScheduledFrame = useCallback(() => {
        if (frameRafRef.current !== null) {
            globalThis.cancelAnimationFrame(frameRafRef.current);
            frameRafRef.current = null;
        }
        pendingPanDeltaRef.current = { dx: 0, dy: 0 };
        pendingPointerClientRef.current = null;
    }, []);

    const updatePartPreviewFromPointer = useCallback((clientX: number, clientY: number) => {
        const activePartId = draggingPartRef.current;
        const container = containerRef.current;
        if (!activePartId || !container) return;

        if (dragOriginRef.current && !dragMovedRef.current) {
            const movedDist = Math.hypot(clientX - dragOriginRef.current.x, clientY - dragOriginRef.current.y);
            if (movedDist > 2) {
                dragMovedRef.current = true;
            }
        }

        const containerRect = container.getBoundingClientRect();
        const clickX = clientX - containerRect.left;
        const clickY = clientY - containerRect.top;

        const newLeft = Math.round((clickX - dragOffsetRef.current.x - panRef.current.x) / zoomRef.current);
        const newTop = Math.round((clickY - dragOffsetRef.current.y - panRef.current.y) / zoomRef.current);
        const currentPreview = dragPreviewRef.current;
        if (
            currentPreview
            && currentPreview.partId === activePartId
            && currentPreview.left === newLeft
            && currentPreview.top === newTop
        ) {
            return;
        }

        const nextPreview: DragPartPreview = { partId: activePartId, left: newLeft, top: newTop };
        dragPreviewRef.current = nextPreview;
        setDragPreview(nextPreview);
    }, []);

    const flushPendingPointerMove = useCallback(() => {
        frameRafRef.current = null;
        if (isPanningRef.current) {
            const { dx, dy } = pendingPanDeltaRef.current;
            pendingPanDeltaRef.current = { dx: 0, dy: 0 };
            if (dx !== 0 || dy !== 0) {
                setPan(p => ({ x: Math.round(p.x + dx), y: Math.round(p.y + dy) }));
            }
        }
        if (draggingPartRef.current && pendingPointerClientRef.current) {
            const { x, y } = pendingPointerClientRef.current;
            pendingPointerClientRef.current = null;
            updatePartPreviewFromPointer(x, y);
        }
    }, [updatePartPreviewFromPointer]);

    const commitPartDrag = useCallback(() => {
        if (frameRafRef.current !== null) {
            globalThis.cancelAnimationFrame(frameRafRef.current);
            frameRafRef.current = null;
        }
        pendingPanDeltaRef.current = { dx: 0, dy: 0 };
        if (draggingPartRef.current && pendingPointerClientRef.current) {
            const { x, y } = pendingPointerClientRef.current;
            pendingPointerClientRef.current = null;
            updatePartPreviewFromPointer(x, y);
        }

        const preview = dragPreviewRef.current;
        const currentDiagram = diagramRef.current;
        const wasDraggingPart = draggingPartRef.current !== null || preview !== null;
        draggingPartRef.current = null;
        dragPreviewRef.current = null;
        setDraggingPart(null);
        setDragPreview(null);
        if (wasDraggingPart) {
            recentPartDragRef.current = dragMovedRef.current;
        }
        dragOriginRef.current = null;
        dragMovedRef.current = false;

        if (!preview || !currentDiagram || !onDiagramChangeRef.current) return;
        const orig = currentDiagram.parts.find((p) => p.id === preview.partId);
        if (!orig || (orig.left === preview.left && orig.top === preview.top)) return;

        const updatedParts = currentDiagram.parts.map((p) =>
            p.id === preview.partId ? { ...p, left: preview.left, top: preview.top } : p,
        );
        onDiagramChangeRef.current({ ...currentDiagram, parts: updatedParts });
    }, [diagramRef, updatePartPreviewFromPointer]);

    const handleWheel = useCallback((e: React.WheelEvent) => {
        if (e.ctrlKey || e.metaKey) {
            const zoomDelta = e.deltaY > 0 ? 0.9 : 1.1;
            setZoom((z) => {
                const raw = Math.max(0.1, Math.min(z * zoomDelta, 5));
                const rounded = Math.round(raw * 100) / 100;
                return Math.abs(rounded - 1) <= 0.025 ? 1 : rounded;
            });
        } else {
            setPan(p => ({ x: Math.round(p.x - e.deltaX), y: Math.round(p.y - e.deltaY) }));
        }
    }, []);

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        if (e.button === 1 || e.button === 2 || (e.button === 0 && e.target === containerRef.current)) {
            isPanningRef.current = true;
            setIsPanning(true);
        }
    }, []);

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (!isWiring || !containerRef.current) return;
        const containerRect = containerRef.current.getBoundingClientRect();
        setMousePos({
            x: e.clientX - containerRect.left,
            y: e.clientY - containerRect.top,
        });
    }, [isWiring]);

    const handlePointerUp = useCallback(() => {
        isPanningRef.current = false;
        setIsPanning(false);
        commitPartDrag();
    }, [commitPartDrag]);

    // Global drag/pan listener coalesced to 1 RAF per frame to prevent 1000Hz pointer storms
    useEffect(() => {
        if (!draggingPart && !isPanning) return undefined;

        const handleWindowPointerMove = (e: PointerEvent) => {
            if (isPanningRef.current) {
                pendingPanDeltaRef.current.dx += e.movementX;
                pendingPanDeltaRef.current.dy += e.movementY;
            } else if (draggingPartRef.current) {
                pendingPointerClientRef.current = { x: e.clientX, y: e.clientY };
            } else {
                return;
            }

            if (frameRafRef.current === null) {
                frameRafRef.current = globalThis.requestAnimationFrame(flushPendingPointerMove);
            }
        };

        const handleWindowPointerUp = () => {
            isPanningRef.current = false;
            setIsPanning(false);
            commitPartDrag();
        };

        globalThis.addEventListener('pointermove', handleWindowPointerMove);
        globalThis.addEventListener('pointerup', handleWindowPointerUp);
        globalThis.addEventListener('pointercancel', handleWindowPointerUp);
        return () => {
            cancelScheduledFrame();
            globalThis.removeEventListener('pointermove', handleWindowPointerMove);
            globalThis.removeEventListener('pointerup', handleWindowPointerUp);
            globalThis.removeEventListener('pointercancel', handleWindowPointerUp);
        };
    }, [cancelScheduledFrame, commitPartDrag, draggingPart, flushPendingPointerMove, isPanning]);

    const handlePartPointerDown = useCallback((e: React.PointerEvent, part: WokwiPart) => {
        e.stopPropagation();
        if (e.button !== 0) return;

        const container = containerRef.current;
        if (!container) return;
        const containerRect = container.getBoundingClientRect();
        const clickX = e.clientX - containerRect.left;
        const clickY = e.clientY - containerRect.top;

        const nextOffset = {
            x: clickX - (part.left * zoomRef.current + panRef.current.x),
            y: clickY - (part.top * zoomRef.current + panRef.current.y),
        };
        const initialPreview: DragPartPreview = { partId: part.id, left: part.left, top: part.top };
        dragOriginRef.current = { x: e.clientX, y: e.clientY };
        dragMovedRef.current = false;
        recentPartDragRef.current = false;
        dragOffsetRef.current = nextOffset;
        draggingPartRef.current = part.id;
        dragPreviewRef.current = initialPreview;
        setDragOffset(nextOffset);
        setDraggingPart(part.id);
        setDragPreview(initialPreview);
    }, []);

    const consumeRecentPartDrag = useCallback(() => {
        const wasDragged = recentPartDragRef.current;
        recentPartDragRef.current = false;
        return wasDragged;
    }, []);

    const resetInteraction = useCallback(() => {
        cancelScheduledFrame();
        panRef.current = { x: 0, y: 0 };
        zoomRef.current = 1;
        isPanningRef.current = false;
        draggingPartRef.current = null;
        dragPreviewRef.current = null;
        dragOriginRef.current = null;
        dragMovedRef.current = false;
        recentPartDragRef.current = false;
        setPan({ x: 0, y: 0 });
        setZoom(1);
        setIsPanning(false);
        setDraggingPart(null);
        setDragPreview(null);
    }, [cancelScheduledFrame]);

    return {
        pan, zoom, isPanning, draggingPart, dragPreview, mousePos, containerRef,
        handleWheel, handlePointerDown, handlePointerMove, handlePointerUp,
        handlePartPointerDown, consumeRecentPartDrag, setZoom, setPan, setDraggingPart, resetInteraction,
    };
}
