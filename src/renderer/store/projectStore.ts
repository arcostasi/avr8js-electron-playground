import { create } from 'zustand';
import type { DiscoveredProject, ProjectFile } from '../services/project-loader';

interface ProjectState {
    // Projects Data
    projects: DiscoveredProject[];
    currentProjectObj: DiscoveredProject | null;
    currentProjectName: string;

    // Editor Data
    files: ProjectFile[];
    activeFile: string;

    // Build / Terminal Data
    hex: string | null;
    isCompiling: boolean;
    terminalOutput: string;

    // Actions
    setProjects: (projects: DiscoveredProject[]) => void;
    setCurrentProject: (projectName: string, projectObj: DiscoveredProject | null) => void;

    setFiles: (files: ProjectFile[] | ((prev: ProjectFile[]) => ProjectFile[])) => void;
    setActiveFile: (filename: string) => void;

    setHex: (hex: string | null) => void;
    setIsCompiling: (isCompiling: boolean) => void;

    appendTerminalOutput: (text: string) => void;
    clearTerminalOutput: () => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
    projects: [],
    currentProjectObj: null,
    currentProjectName: '',

    files: [],
    activeFile: '',

    hex: null,
    isCompiling: false,
    terminalOutput: '',

    setProjects: (projects) => set({ projects }),

    setCurrentProject: (projectName, projectObj) => set({
        currentProjectName: projectName,
        currentProjectObj: projectObj
    }),

    setFiles: (filesOrUpdater) => set((state) => ({
        files: typeof filesOrUpdater === 'function' ? filesOrUpdater(state.files) : filesOrUpdater
    })),

    setActiveFile: (activeFile) => set({ activeFile }),

    setHex: (hex) => set({ hex }),

    setIsCompiling: (isCompiling) => set({ isCompiling }),

    appendTerminalOutput: (text) => set((state) => ({
        terminalOutput: state.terminalOutput + text
    })),

    clearTerminalOutput: () => set({ terminalOutput: '' }),
}));
