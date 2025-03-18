/**
 * Project Export / Import Service
 * Saves and loads project archives as `.avr8js` JSON bundles.
 * Delegates dialogs and disk I/O to the Electron main process.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
import type { ProjectFile } from './project-loader';

const { ipcRenderer } = require('electron') as typeof import('electron');

/**
 * Export the current project to a user-chosen .avr8js file.
 * Returns the saved path, or null if cancelled.
 */
export async function exportProject(
    name: string,
    board: string,
    files: ProjectFile[],
): Promise<string | null> {
    const result = await ipcRenderer.invoke('project:export', {
        name,
        board,
        files,
    }) as {
        ok?: boolean;
        success: boolean;
        canceled?: boolean;
        filePath?: string | null;
        error?: string;
    };

    if (!(result.ok ?? result.success)) {
        if (result.error) console.error('Failed to export project:', result.error);
        return null;
    }

    if (result.canceled || !result.filePath) {
        return null;
    }

    return result.filePath;
}

/**
 * Import a project from a user-chosen .avr8js file.
 * Returns the archive data, or null if cancelled / invalid.
 */
export async function importProject(): Promise<{
    name: string;
    board: string;
    files: ProjectFile[];
} | null> {
    const result = await ipcRenderer.invoke('project:import') as {
        ok?: boolean;
        success: boolean;
        canceled?: boolean;
        project?: {
            name: string;
            board: string;
            files: ProjectFile[];
        } | null;
        error?: string;
    };

    if (!(result.ok ?? result.success)) {
        if (result.error) console.error('Failed to import project:', result.error);
        return null;
    }

    if (result.canceled || !result.project) {
        return null;
    }

    return result.project;
}