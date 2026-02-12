import { create } from 'zustand';
import type { DiscoveredProject, ProjectFile } from '../services/project-loader';

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
    terminalOutput: string;

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

    addCompileHistory: (entry: CompileHistoryEntry) => void;
    clearCompileHistory: () => void;
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
    terminalOutput: '',
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

    appendTerminalOutput: (text) => set((state) => ({
        terminalOutput: state.terminalOutput + text
    })),

    clearTerminalOutput: () => set({ terminalOutput: '' }),

    addCompileHistory: (entry) => set((state) => ({
        // Keep last 50 entries, newest first
        compileHistory: [entry, ...state.compileHistory].slice(0, 50),
    })),

    clearCompileHistory: () => set({ compileHistory: [] }),
}));
