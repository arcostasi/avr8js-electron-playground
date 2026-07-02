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

const MAX_HISTORY = 40;

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

/**
 * Builds a lightweight Undo/Redo snapshot containing only component state
 * (positions, rotations, attrs) and wire connections/colors — intentionally
 * omitting wire positioning metadata (`waypoints` and `routeHints`) so repeated
 * wire drags never bloat undo memory.
 */
export function createUndoHistorySnapshot(diagram: WokwiDiagram): WokwiDiagram {
    return {
        version: diagram.version,
        ...(diagram.author !== undefined ? { author: diagram.author } : {}),
        editor: diagram.editor,
        ...(diagram.customView !== undefined ? { customView: diagram.customView } : {}),
        parts: diagram.parts.map((part) => ({
            id: part.id,
            type: part.type,
            top: part.top,
            left: part.left,
            rotate: part.rotate,
            ...(part.attrs ? { attrs: { ...part.attrs } } : {}),
            ...(part.hide !== undefined ? { hide: part.hide } : {}),
        })),
        connections: diagram.connections.map((conn) => ({
            id: conn.id,
            from: conn.from,
            to: conn.to,
            color: conn.color,
        })),
    };
}

/**
 * Returns a canonical string key for an Undo/Redo snapshot so wire-position-only
 * edits do not push duplicate history entries.
 */
export function getUndoSnapshotKey(snapshot: WokwiDiagram): string {
    return JSON.stringify(snapshot);
}

/** Deep-clone a diagram snapshot for state restoration */
function cloneSnapshot(snapshot: WokwiDiagram): WokwiDiagram {
    return createUndoHistorySnapshot(snapshot);
}

export function useDiagramState(initialDiagram: WokwiDiagram): DiagramStateReturn {
    const [diagram, setDiagramRaw] = useState<WokwiDiagram>(initialDiagram);
    const diagramRef = useRef<WokwiDiagram>(diagram);

    // ── History stack ──
    const initialSnap = createUndoHistorySnapshot(initialDiagram);
    const historyRef = useRef<WokwiDiagram[]>([initialSnap]);
    const historyKeysRef = useRef<string[]>([getUndoSnapshotKey(initialSnap)]);
    const indexRef = useRef(0);
    // Flag to skip pushing history when undo/redo set the diagram
    const skipHistoryRef = useRef(false);

    // Keep ref in sync for async callbacks
    useEffect(() => {
        diagramRef.current = diagram;
    }, [diagram]);

    // Re-sync when external diagram changes (e.g., project switch)
    useEffect(() => {
        const nextSnap = createUndoHistorySnapshot(initialDiagram);
        setDiagramRaw(initialDiagram);
        historyRef.current = [nextSnap];
        historyKeysRef.current = [getUndoSnapshotKey(nextSnap)];
        indexRef.current = 0;
    }, [initialDiagram]);

    /**
     * Wraps setDiagramRaw to record undo history (components + wire colors/topology only).
     * Accepts value or updater function, same as React.Dispatch.
     */
    const setDiagram: React.Dispatch<React.SetStateAction<WokwiDiagram>> = useCallback(
        (action) => {
            setDiagramRaw(prev => {
                const next = typeof action === 'function' ? action(prev) : action;

                if (!skipHistoryRef.current) {
                    const historySnap = createUndoHistorySnapshot(next);
                    const nextKey = getUndoSnapshotKey(historySnap);
                    if (nextKey !== historyKeysRef.current[indexRef.current]) {
                        const history = historyRef.current;
                        const keys = historyKeysRef.current;
                        history.length = indexRef.current + 1;
                        keys.length = indexRef.current + 1;
                        history.push(historySnap);
                        keys.push(nextKey);
                        if (history.length > MAX_HISTORY) {
                            history.shift();
                            keys.shift();
                        }
                        indexRef.current = history.length - 1;
                    }
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
        setDiagramRaw(cloneSnapshot(historyRef.current[indexRef.current]));
    }, []);

    const redo = useCallback(() => {
        if (indexRef.current >= historyRef.current.length - 1) return;
        indexRef.current += 1;
        skipHistoryRef.current = true;
        setDiagramRaw(cloneSnapshot(historyRef.current[indexRef.current]));
    }, []);

    /**
     * Replaces the active diagram and RESETS the entire undo/redo history to a
     * single entry. Use this whenever loading or switching projects so that
     * Ctrl+Z cannot cross project boundaries.
     */
    const resetDiagram = useCallback((newDiagram: WokwiDiagram) => {
        const nextSnap = createUndoHistorySnapshot(newDiagram);
        historyRef.current = [nextSnap];
        historyKeysRef.current = [getUndoSnapshotKey(nextSnap)];
        indexRef.current = 0;
        skipHistoryRef.current = false;
        setDiagramRaw(newDiagram);
    }, []);

    // Keyboard shortcuts: Ctrl+Z / Ctrl+Y (skip when typing inside Monaco or form controls)
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            const active = document.activeElement as HTMLElement | null;
            const tag = active?.tagName?.toLowerCase();
            const isEditable = tag === 'input'
                || tag === 'textarea'
                || tag === 'select'
                || Boolean(active?.isContentEditable)
                || Boolean(active?.closest?.('.monaco-editor'));
            if (isEditable) return;

            const key = e.key.toLowerCase();
            if ((e.ctrlKey || e.metaKey) && key === 'z' && !e.shiftKey) {
                e.preventDefault();
                undo();
            } else if (
                (e.ctrlKey || e.metaKey) &&
                (key === 'y' || (key === 'z' && e.shiftKey))
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
        // Wire positioning is excluded from undo/redo history to keep drags lightweight
        setDiagramRaw(prev => ({
            ...prev,
            connections: prev.connections.map(c =>
                c.id === connId ? { ...c, waypoints } : c
            ),
        }));
    }, []);

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
