/**
 * Project Loader Service
 * Reads example projects from disk using Node.js fs (available via nodeIntegration).
 * Uses require() instead of import so Vite doesn't externalize these for browser.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
import { parseDiagram } from '../types/wokwi.types';
import type { WokwiDiagram } from '../types/wokwi.types';

const fs = require('node:fs') as typeof import('node:fs');
const path = require('node:path') as typeof import('node:path');
const { ipcRenderer } = require('electron') as typeof import('electron');

export interface DiscoveredProject {
    name: string;
    slug: string;
    category: string;
    board: string;
    description: string;
    dirPath: string;
    tags: string[];
}

export interface ProjectFile {
    name: string;
    content: string;
    language: string;
}

export interface LoadedProject {
    name: string;
    board: string;
    files: ProjectFile[];
    hex: string | null;
    diagram: WokwiDiagram | null;
}

/**
 * Gets the project root from the main process via synchronous IPC.
 */
function getAppRoot(): string {
    try {
        return ipcRenderer.sendSync('get-app-root') as string;
    } catch {
        return process.cwd();
    }
}

/**
 * Resolves the absolute path to the examples directory.
 */
function getExamplesRoot(): string {
    const appRoot = getAppRoot();
    return path.join(appRoot, 'examples');
}

/**
 * Discovers projects by scanning the examples directory for subfolders containing metadata.json.
 * Supports categorization (e.g., beginner, advanced) or flat structure.
 */
export function discoverProjects(): DiscoveredProject[] {
    const examplesRoot = getExamplesRoot();
    if (!fs.existsSync(examplesRoot)) {
        console.warn(`Examples root not found at: ${examplesRoot}`);
        return [];
    }

    const projects: DiscoveredProject[] = [];

    // Local function to test a directory for metadata.json
    const checkDir = (dir: string, category: string) => {
        const metaPath = path.join(dir, 'metadata.json');
        if (fs.existsSync(metaPath)) {
            try {
                const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
                projects.push({
                    name: meta.name || path.basename(dir),
                    slug: meta.slug || path.basename(dir),
                    category: meta.category || category,
                    board: meta.board || 'uno',
                    description: meta.description || '',
                    dirPath: dir,
                    tags: meta.tags || [],
                });
            } catch (err) {
                console.error(`Failed to parse ${metaPath}`, err);
            }
        } else {
            // Backward compatibility: If no metadata.json but has diagram.json, assume flat project
            const diagPath = path.join(dir, 'diagram.json');
            if (fs.existsSync(diagPath)) {
                projects.push({
                    name: path.basename(dir),
                    slug: path.basename(dir),
                    category: category || 'uncategorized',
                    board: 'uno', // default
                    description: '',
                    dirPath: dir,
                    tags: [],
                });
            }
        }
    };

    // Scan up to 1 level deep for categories
    const entries = fs.readdirSync(examplesRoot, { withFileTypes: true });
    for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const entryPath = path.join(examplesRoot, entry.name);
        // First check if this directory itself is a project
        if (fs.existsSync(path.join(entryPath, 'diagram.json'))) {
            checkDir(entryPath, 'uncategorized');
        } else {
            // Assume it's a category folder and check its children
            const subEntries = fs.readdirSync(entryPath, { withFileTypes: true });
            for (const sub of subEntries) {
                if (sub.isDirectory()) {
                    checkDir(path.join(entryPath, sub.name), entry.name);
                }
            }
        }
    }

    return projects;
}

/**
 * Detects the language for a file based on its extension.
 */
function detectLanguage(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    switch (ext) {
        case '.ino':
        case '.cpp':
        case '.c':
        case '.h':
            return 'cpp';
        case '.json':
            return 'json';
        default:
            return 'plaintext';
    }
}

/**
 * Loads all files for a given directory path.
 * Returns parsed diagram.json (automatically migrating V1 to V2).
 */
export function loadProject(projectInfo: Pick<DiscoveredProject, 'name' | 'board' | 'dirPath'>): LoadedProject {
    const { name, board, dirPath } = projectInfo;
    const files: ProjectFile[] = [];
    let hex: string | null = null;
    let diagram: WokwiDiagram | null = null;

    if (!fs.existsSync(dirPath)) {
        console.error(`Project folder not found: ${dirPath}`);
        return { name, board, files, hex, diagram };
    }

    const dirEntries = fs.readdirSync(dirPath);

    for (const entry of dirEntries) {
        const fullPath = path.join(dirPath, entry);
        const stat = fs.statSync(fullPath);
        if (!stat.isFile()) continue;

        const ext = path.extname(entry).toLowerCase();

        // Load hex file separately (not editable)
        if (ext === '.hex') {
            hex = fs.readFileSync(fullPath, 'utf-8');
            continue;
        }

        if (entry === 'diagram.json') {
            const content = fs.readFileSync(fullPath, 'utf-8');
            try {
                diagram = parseDiagram(JSON.parse(content));
                // Update file content so editor sees V2 JSON if it was migrated
                files.push({
                    name: entry,
                    content: JSON.stringify(diagram, null, 2),
                    language: 'json',
                });
            } catch (err) {
                console.error('Failed to parse diagram.json', err);
            }
            continue;
        }

        // Include other source files
        if (['.ino', '.cpp', '.c', '.h', '.json'].includes(ext) && entry !== 'metadata.json') {
            const content = fs.readFileSync(fullPath, 'utf-8');
            files.push({
                name: entry,
                content,
                language: detectLanguage(entry),
            });
        }
    }

    // Sort: diagram.json first, then .ino, then others
    files.sort((a, b) => {
        const order = (nameStr: string) => {
            if (nameStr === 'diagram.json') return 0;
            if (nameStr.endsWith('.ino')) return 1;
            return 2;
        };
        return order(a.name) - order(b.name);
    });

    return { name, board, files, hex, diagram };
}
