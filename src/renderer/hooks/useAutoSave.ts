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

    useEffect(() => {
        // Don't auto-save on initial mount (would overwrite with defaults)
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }

        if (!enabled || !projectPath) return;

        const timer = setTimeout(() => {
            const json = JSON.stringify(diagram, null, 2);
            ipcRenderer
                .invoke('project:save-diagram', { path: projectPath, content: json })
                .catch((err: Error) => console.error('[useAutoSave] Save failed:', err));
        }, delay);

        return () => clearTimeout(timer);
    }, [diagram, projectPath, delay, enabled]);
}
