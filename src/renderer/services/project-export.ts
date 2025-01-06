/**
 * Project Export / Import Service
 * Saves and loads project archives as `.avr8js` JSON bundles.
 * Uses Electron dialog for file picker and Node.js fs for I/O.
 *
 * Archive format:
 * {
 *   "format": "avr8js-project",
 *   "version": 1,
 *   "name": "my-project",
 *   "board": "uno",
 *   "files": [{ name, content, language }],
 *   "exportedAt": "2026-03-01T..."
 * }
 */
/* eslint-disable @typescript-eslint/no-require-imports */
import type { ProjectFile } from './project-loader';

const fs = require('node:fs') as typeof import('node:fs');
const path = require('node:path') as typeof import('node:path');
const { ipcRenderer } = require('electron') as typeof import('electron');

interface ProjectArchive {
    format: 'avr8js-project';
    version: 1;
    name: string;
    board: string;
    files: ProjectFile[];
    exportedAt: string;
}

/**
 * Export the current project to a user-chosen .avr8js file.
 * Returns the saved path, or null if cancelled.
 */
export async function exportProject(
    name: string,
    board: string,
    files: ProjectFile[],
): Promise<string | null> {
    const result = await ipcRenderer.invoke('dialog-save', {
        title: 'Export Project',
        defaultPath: `${name}.avr8js`,
        filters: [
            { name: 'AVR8js Project', extensions: ['avr8js'] },
            { name: 'All Files', extensions: ['*'] },
        ],
    });

    if (!result || result.canceled || !result.filePath) return null;

    const archive: ProjectArchive = {
        format: 'avr8js-project',
        version: 1,
        name,
        board,
        files,
        exportedAt: new Date().toISOString(),
    };

    fs.writeFileSync(result.filePath, JSON.stringify(archive, null, 2), 'utf-8');
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
    const result = await ipcRenderer.invoke('dialog-open', {
        title: 'Import Project',
        filters: [
            { name: 'AVR8js Project', extensions: ['avr8js'] },
            { name: 'JSON Files', extensions: ['json'] },
            { name: 'All Files', extensions: ['*'] },
        ],
        properties: ['openFile'],
    });

    if (!result || result.canceled || !result.filePaths?.length) return null;

    try {
        const raw = fs.readFileSync(result.filePaths[0], 'utf-8');
        const data = JSON.parse(raw) as ProjectArchive;

        if (data.format !== 'avr8js-project' || !data.files?.length) {
            throw new Error('Invalid project archive format');
        }

        return {
            name: data.name || path.basename(result.filePaths[0], '.avr8js'),
            board: data.board || 'uno',
            files: data.files,
        };
    } catch (err) {
        console.error('Failed to import project:', err);
        return null;
    }
}
