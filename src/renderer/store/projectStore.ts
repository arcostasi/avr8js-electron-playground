import { create } from 'zustand';
import type { DiscoveredProject, ProjectFile } from '../services/project-loader';
import { markPerf } from '../utils/perf';

export interface CompileHistoryEntry {
    id: string;
    timestamp: number;   // Date.now()
    success: boolean;
    output: string;
    /** Build duration in ms */
    durationMs: number;
    projectName: string;
}

interface ProjectState {
    // Projects Data
    projects: DiscoveredProject[];
    currentProjectObj: DiscoveredProject | null;
    currentProjectName: string;

    // Editor Data
    files: ProjectFile[];
    activeFile: string;

    /**
     * Content as last written to / read from disk for each filename.
     * A file is "dirty" when files[i].content !== savedContents[files[i].name].
     */
    savedContents: Record<string, string>;

    // Build / Terminal Data
    hex: string | null;
    isCompiling: boolean;
    terminalChunks: string[];

    /** Last N compilation results (newest first) */
    compileHistory: CompileHistoryEntry[];

    // Actions
    setProjects: (projects: DiscoveredProject[]) => void;
    setCurrentProject: (projectName: string, projectObj: DiscoveredProject | null) => void;

    setFiles: (files: ProjectFile[] | ((prev: ProjectFile[]) => ProjectFile[])) => void;
    setActiveFile: (filename: string) => void;

    /** Bulk-reset savedContents (call on project load/switch to initialise dirty tracking) */
    setSavedContents: (contents: Record<string, string>) => void;
    /** Mark a single file as saved at its current content hash */
    setSavedContent: (filename: string, content: string) => void;

    setHex: (hex: string | null) => void;
    setIsCompiling: (isCompiling: boolean) => void;

    appendTerminalOutput: (text: string) => void;
    clearTerminalOutput: () => void;
    setTerminalChunks: (chunks: string[]) => void;

    addCompileHistory: (entry: CompileHistoryEntry) => void;
    clearCompileHistory: () => void;
    setCompileHistory: (entries: CompileHistoryEntry[]) => void;
}

const MAX_TERMINAL_CHUNKS = 400;
const MAX_TERMINAL_CHARS = 256 * 1024;
let terminalTrimWarningIssued = false;

function trimTerminalChunks(chunks: string[]): { chunks: string[]; droppedCount: number } {
    if (chunks.length === 0) return { chunks, droppedCount: 0 };

    let totalChars = 0;
    const kept: string[] = [];
    for (let index = chunks.length - 1; index >= 0; index--) {
        const chunk = chunks[index];
        totalChars += chunk.length;
        kept.push(chunk);
        if (kept.length >= MAX_TERMINAL_CHUNKS || totalChars >= MAX_TERMINAL_CHARS) {
            break;
        }
    }

    kept.reverse();
    return {
        chunks: kept,
        droppedCount: Math.max(0, chunks.length - kept.length),
    };
}

export const useProjectStore = create<ProjectState>((set) => ({
    projects: [],
    currentProjectObj: null,
    currentProjectName: '',

    files: [],
    activeFile: '',
    savedContents: {},

    hex: null,
    isCompiling: false,
    terminalChunks: [],
    compileHistory: [],

    setProjects: (projects) => set({ projects }),

    setCurrentProject: (projectName, projectObj) => set({
        currentProjectName: projectName,
        currentProjectObj: projectObj
    }),

    setFiles: (filesOrUpdater) => set((state) => ({
        files: typeof filesOrUpdater === 'function' ? filesOrUpdater(state.files) : filesOrUpdater
    })),

    setActiveFile: (activeFile) => set({ activeFile }),

    setSavedContents: (contents) => set({ savedContents: contents }),

    setSavedContent: (filename, content) =>
        set((state) => ({
            savedContents: { ...state.savedContents, [filename]: content },
        })),

    setHex: (hex) => set({ hex }),

    setIsCompiling: (isCompiling) => set({ isCompiling }),

    appendTerminalOutput: (text) => set((state) => {
        const trimmed = trimTerminalChunks([...state.terminalChunks, text]);
        if (trimmed.droppedCount > 0 && !terminalTrimWarningIssued) {
            terminalTrimWarningIssued = true;
            const detail = `dropped=${trimmed.droppedCount},limitChunks=${MAX_TERMINAL_CHUNKS},limitChars=${MAX_TERMINAL_CHARS}`;
            console.warn(`[terminal] output buffer trimmed (${detail})`);
            markPerf('warning:terminal-buffer-limit', detail);
        }

        return {
            terminalChunks: trimmed.chunks,
        };
    }),

    clearTerminalOutput: () => {
        terminalTrimWarningIssued = false;
        set({ terminalChunks: [] });
    },

    setTerminalChunks: (chunks) => {
        terminalTrimWarningIssued = false;
        set({ terminalChunks: trimTerminalChunks(chunks).chunks });
    },

    addCompileHistory: (entry) => set((state) => ({
        // Keep last 50 entries, newest first
        compileHistory: [entry, ...state.compileHistory].slice(0, 50),
    })),

    clearCompileHistory: () => set({ compileHistory: [] }),

    setCompileHistory: (entries) => set({ compileHistory: entries.slice(0, 50) }),
}));
