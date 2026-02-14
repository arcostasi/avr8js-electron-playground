/**
 * useDiagramState
 * Centralized state management for the diagram model.
 * Provides granular mutators (movePart, addConnection, removeConnection, etc.)
 * instead of replacing the entire diagram on every change.
 *
 * Includes full undo/redo history (Ctrl+Z / Ctrl+Y).
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import type {
    WokwiDiagram, WokwiPart, WokwiConnection, WireWaypoint,
} from '../types/wokwi.types';

const MAX_HISTORY = 100;

export interface DiagramStateReturn {
    diagram: WokwiDiagram;
    diagramRef: React.RefObject<WokwiDiagram>;
    setDiagram: React.Dispatch<React.SetStateAction<WokwiDiagram>>;
    /** Replace the diagram AND reset the undo/redo history (use on project load/switch). */
    resetDiagram: (diagram: WokwiDiagram) => void;
    movePart: (partId: string, top: number, left: number) => void;
    rotatePart: (partId: string, degrees: number) => void;
    addPart: (part: WokwiPart) => void;
    removePart: (partId: string) => void;
    addConnection: (conn: WokwiConnection) => void;
    removeConnection: (connId: string) => void;
    updateWaypoints: (connId: string, waypoints: WireWaypoint[]) => void;
    updateConnectionColor: (connId: string, color: string) => void;
    nextConnectionId: () => string;
    undo: () => void;
    redo: () => void;
    canUndo: boolean;
    canRedo: boolean;
}

/**
 * Generates a unique connection ID based on current diagram state.
 */
function generateConnectionId(connections: WokwiConnection[]): string {
    let maxNum = 0;
    for (const conn of connections) {
        const match = /^conn-(\d+)$/.exec(conn.id);
        if (match) {
            const num = Number.parseInt(match[1], 10);
            if (num >= maxNum) maxNum = num + 1;
        }
    }
    return `conn-${maxNum}`;
}

/** Deep-clone a diagram (shallow structuredClone) */
function snap(d: WokwiDiagram): WokwiDiagram {
    return JSON.parse(JSON.stringify(d));
}

export function useDiagramState(initialDiagram: WokwiDiagram): DiagramStateReturn {
    const [diagram, setDiagramRaw] = useState<WokwiDiagram>(initialDiagram);
    const diagramRef = useRef<WokwiDiagram>(diagram);

    // ── History stack ──
    const historyRef = useRef<WokwiDiagram[]>([snap(initialDiagram)]);
    const indexRef = useRef(0);
    // Flag to skip pushing history when undo/redo set the diagram
    const skipHistoryRef = useRef(false);

    // Keep ref in sync for async callbacks
    useEffect(() => {
        diagramRef.current = diagram;
    }, [diagram]);

    // Re-sync when external diagram changes (e.g., project switch)
    useEffect(() => {
        setDiagramRaw(initialDiagram);
        historyRef.current = [snap(initialDiagram)];
        indexRef.current = 0;
    }, [initialDiagram]);

    /**
     * Wraps setDiagramRaw to record undo history.
     * Accepts value or updater function, same as React.Dispatch.
     */
    const setDiagram: React.Dispatch<React.SetStateAction<WokwiDiagram>> = useCallback(
        (action) => {
            setDiagramRaw(prev => {
                const next = typeof action === 'function' ? action(prev) : action;

                if (!skipHistoryRef.current) {
                    // Truncate any redo entries beyond current index
                    const h = historyRef.current;
                    h.length = indexRef.current + 1;
                    h.push(snap(next));
                    if (h.length > MAX_HISTORY) h.shift();
                    indexRef.current = h.length - 1;
                } else {
                    skipHistoryRef.current = false;
                }

                return next;
            });
        }, [],
    );

    const undo = useCallback(() => {
        if (indexRef.current <= 0) return;
        indexRef.current -= 1;
        skipHistoryRef.current = true;
        setDiagramRaw(snap(historyRef.current[indexRef.current]));
    }, []);

    const redo = useCallback(() => {
        if (indexRef.current >= historyRef.current.length - 1) return;
        indexRef.current += 1;
        skipHistoryRef.current = true;
        setDiagramRaw(snap(historyRef.current[indexRef.current]));
    }, []);

    /**
     * Replaces the active diagram and RESETS the entire undo/redo history to a
     * single entry. Use this whenever loading or switching projects so that
     * Ctrl+Z cannot cross project boundaries.
     */
    const resetDiagram = useCallback((newDiagram: WokwiDiagram) => {
        const s = snap(newDiagram);
        historyRef.current = [s];
        indexRef.current = 0;
        skipHistoryRef.current = false;
        setDiagramRaw(s);
    }, []);

    // Keyboard shortcuts: Ctrl+Z / Ctrl+Y
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                undo();
            } else if (
                (e.ctrlKey || e.metaKey) &&
                (e.key === 'y' || (e.key === 'z' && e.shiftKey))
            ) {
                e.preventDefault();
                redo();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [undo, redo]);

    const canUndo = indexRef.current > 0;
    const canRedo = indexRef.current < historyRef.current.length - 1;

    const movePart = useCallback((partId: string, top: number, left: number) => {
        setDiagram(prev => ({
            ...prev,
            parts: prev.parts.map(p =>
                p.id === partId
                    ? { ...p, top: Math.round(top), left: Math.round(left) }
                    : p
            ),
        }));
    }, [setDiagram]);

    const rotatePart = useCallback((partId: string, degrees: number) => {
        setDiagram(prev => ({
            ...prev,
            parts: prev.parts.map(p =>
                p.id === partId ? { ...p, rotate: degrees } : p
            ),
        }));
    }, [setDiagram]);

    const addPart = useCallback((part: WokwiPart) => {
        setDiagram(prev => ({
            ...prev,
            parts: [...prev.parts, part],
        }));
    }, [setDiagram]);

    const removePart = useCallback((partId: string) => {
        setDiagram(prev => ({
            ...prev,
            parts: prev.parts.filter(p => p.id !== partId),
            connections: prev.connections.filter(c =>
                !c.from.startsWith(`${partId}:`)
                && !c.to.startsWith(`${partId}:`)
            ),
        }));
    }, [setDiagram]);

    const addConnection = useCallback((conn: WokwiConnection) => {
        setDiagram(prev => ({
            ...prev,
            connections: [...prev.connections, conn],
        }));
    }, [setDiagram]);

    const removeConnection = useCallback((connId: string) => {
        setDiagram(prev => ({
            ...prev,
            connections: prev.connections.filter(c => c.id !== connId),
        }));
    }, [setDiagram]);

    const updateWaypoints = useCallback((
        connId: string, waypoints: WireWaypoint[],
    ) => {
        setDiagram(prev => ({
            ...prev,
            connections: prev.connections.map(c =>
                c.id === connId ? { ...c, waypoints } : c
            ),
        }));
    }, [setDiagram]);

    const updateConnectionColor = useCallback((
        connId: string, color: string,
    ) => {
        setDiagram(prev => ({
            ...prev,
            connections: prev.connections.map(c =>
                c.id === connId ? { ...c, color } : c
            ),
        }));
    }, [setDiagram]);

    const nextConnectionId = useCallback(() => {
        return generateConnectionId(diagramRef.current.connections);
    }, []);

    return {
        diagram,
        diagramRef,
        setDiagram,
        resetDiagram,
        movePart,
        rotatePart,
        addPart,
        removePart,
        addConnection,
        removeConnection,
        updateWaypoints,
        updateConnectionColor,
        nextConnectionId,
        undo,
        redo,
        canUndo,
        canRedo,
    };
}
