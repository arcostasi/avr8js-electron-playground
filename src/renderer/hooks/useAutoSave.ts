/**
 * useAutoSave
 * Debounced auto-save of diagram state to disk via IPC.
 * Fires after the diagram hasn't changed for `delay` ms.
 */
import { useEffect, useRef } from 'react';
import type { WokwiDiagram } from '../types/wokwi.types';

/* eslint-disable @typescript-eslint/no-require-imports */
const { ipcRenderer } = require('electron') as typeof import('electron');

interface AutoSaveOptions {
    diagram: WokwiDiagram;
    projectPath: string | null;
    delay?: number;
    enabled?: boolean;
}

function fnv1aHash(input: string): string {
    let hash = 0x811c9dc5;
    for (let index = 0; index < input.length; index++) {
        hash ^= input.codePointAt(index) ?? 0;
        hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

function serializeDiagram(diagram: WokwiDiagram): string {
    return JSON.stringify(diagram, null, 2);
}

function buildStructureFingerprint(diagram: WokwiDiagram): string {
    return JSON.stringify({
        version: diagram.version,
        author: diagram.author,
        editor: diagram.editor,
        parts: diagram.parts.map((part) => ({
            id: part.id,
            type: part.type,
            rotate: part.rotate,
            attrs: part.attrs ?? {},
            hide: part.hide ?? false,
        })),
        connections: diagram.connections.map((connection) => ({
            id: connection.id,
            from: connection.from,
            to: connection.to,
            color: connection.color,
            waypoints: connection.waypoints ?? [],
            routeHints: connection.routeHints ?? [],
        })),
    });
}

/**
 * Serialises the diagram to JSON and saves to disk after a debounce period.
 * Skips saving if no project path is set or auto-save is disabled.
 */
export function useAutoSave({
    diagram,
    projectPath,
    delay = 1000,
    enabled = true,
}: AutoSaveOptions): void {
    const isFirstRender = useRef(true);
    const lastSavedHashRef = useRef<string | null>(null);
    const lastScheduledHashRef = useRef<string | null>(null);
    const lastChangeAtRef = useRef<number>(0);
    const lastStructureHashRef = useRef<string | null>(null);

    useEffect(() => {
        // Don't auto-save on initial mount (would overwrite with defaults)
        if (isFirstRender.current) {
            isFirstRender.current = false;
            lastSavedHashRef.current = fnv1aHash(serializeDiagram(diagram));
            lastStructureHashRef.current = fnv1aHash(buildStructureFingerprint(diagram));
            return;
        }

        if (!enabled || !projectPath) return;

        const serializedDiagram = serializeDiagram(diagram);
        const contentHash = fnv1aHash(serializedDiagram);
        if (contentHash === lastSavedHashRef.current || contentHash === lastScheduledHashRef.current) {
            return;
        }

        const structureHash = fnv1aHash(buildStructureFingerprint(diagram));
        const now = performance.now();
        const elapsedSinceChange = now - lastChangeAtRef.current;
        const layoutOnlyBurst = lastStructureHashRef.current === structureHash && elapsedSinceChange < Math.max(240, delay * 0.75);
        const effectiveDelay = layoutOnlyBurst ? Math.max(delay, 1400) : delay;

        lastScheduledHashRef.current = contentHash;
        lastChangeAtRef.current = now;
        lastStructureHashRef.current = structureHash;

        const timer = setTimeout(() => {
            ipcRenderer
                .invoke('project:save-diagram', { path: projectPath, content: serializedDiagram })
                .then((result: { ok?: boolean; success?: boolean }) => {
                    if (result.ok ?? result.success) {
                        lastSavedHashRef.current = contentHash;
                    }
                })
                .catch((err: Error) => console.error('[useAutoSave] Save failed:', err))
                .finally(() => {
                    if (lastScheduledHashRef.current === contentHash) {
                        lastScheduledHashRef.current = null;
                    }
                });
        }, effectiveDelay);

        return () => clearTimeout(timer);
    }, [diagram, projectPath, delay, enabled]);
}
