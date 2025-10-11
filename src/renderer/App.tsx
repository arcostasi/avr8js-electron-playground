import React, { useState, useEffect, useCallback, useRef, useMemo, Suspense, lazy } from 'react';
import ProjectSidebar from '@/components/ProjectSidebar';
import type { PaletteCommand } from '@/components/CommandPalette';
import type { NewProjectOptions } from '@/components/NewProjectDialog';
import type { WokwiDiagram, WokwiPart } from '@/types/wokwi.types';
import { parseDiagram } from '@/types/wokwi.types';
import { resolveBoardProfileFromParts } from '../shared/avr/profiles';
import { stringifyEmptyDiagramForBuildBoard } from '../shared/avr/board-diagrams';
import { buildHex } from '../shared/compile';
import {
    discoverProjects, discoverProjectsFromRoot, getAppRoot, isProjectOperationAborted, loadProject, pickProjectsDirectory, preloadProject,
} from '@/services/project-loader';
import type { DiscoveredProject, ProjectOperationProgress } from '@/services/project-loader';
import {
    exportProject, importProject,
} from '@/services/project-export';
import { readPersistedJson, writePersistedJson } from '@/services/renderer-persist';
import { buildProjectSessionSnapshot, getRestoredLogWarningKey, resolveProjectSessionRestore } from '@/services/app-session';
import {
    DEFAULT_UI_DIAGNOSTICS_SESSION_STATE,
    DEFAULT_UI_LAYOUT_STATE,
    DEFAULT_UI_SIDEBAR_SECTIONS_STATE,
    DEFAULT_UI_TERMINAL_SESSION_STATE,
    normalizeProjectSessionKey,
    readUiSession,
    updateUiSession,
} from '@/services/ui-session';
import type {
    UiDiagnosticsSessionState,
    UiRestoredLogWarning,
    UiSidebarSectionsState,
    UiTerminalSessionState,
} from '@/services/ui-session';
import {
    discoverCustomChipSources,
    discoverCustomChipManifests,
    mergeChipArtifacts,
} from '@/services/custom-chips';
import { buildCustomChipsEmbedded } from '@/services/chip-build-embedded';
import {
    computeChipBuildHash,
    readCachedChipArtifact,
    writeCachedChipArtifact,
} from '@/services/chip-build-cache';
import { parseChipBuildDiagnostics } from '@/services/chip-build-diagnostics';
import { useDiagramState } from '@/hooks/useDiagramState';
import { useAutoSave } from '@/hooks/useAutoSave';
import { useResizableLayout } from '@/hooks/useResizableLayout';
import { useProjectStore } from '@/store/projectStore';
import type { CompileHistoryEntry } from '@/store/projectStore';
import { useSettingsStore } from '@/store/settingsStore';
import type { EditorDiagnostic } from '@/types/editor-diagnostics';
import SerialMonitor from '@/components/SerialMonitor';
import PerformancePanel from '@/components/PerformancePanel';
import { parsePerfThresholdConfig, resolvePerfThresholdMs } from '@/services/perf-dashboard';
import {
    formatPerfEntry,
    getRecentPerfEntries,
    markPerf,
    measureAsync,
    setPerfLoggingEnabled,
    startPerfMeasure,
    subscribePerfEntries,
} from '@/utils/perf';
import {
    FileJson, FileCode2, Terminal as TerminalIcon,
    FolderOpen, PlayCircle, Settings, Save, RotateCcw,
    FilePlus2, Sun, Moon, ChevronLeft, ChevronRight, X,
} from 'lucide-react';
import './index.css';

const Editor = lazy(() => import('@/components/Editor'));
const WokwiSimulator = lazy(() => import('@/components/simulator'));
const SettingsDialog = lazy(() => import('@/components/SettingsDialog'));
const CommandPalette = lazy(() => import('@/components/CommandPalette'));
const NewProjectDialog = lazy(() => import('@/components/NewProjectDialog'));

markPerf('renderer-module-evaluated');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ipcRenderer = require('electron').ipcRenderer;

/** Window control buttons extracted to avoid long lines */
function TitlebarButtons() {
    const btnCls = [
        'w-12 h-8 flex items-center justify-center',
        'text-vscode-text opacity-80 hover:opacity-100 hover:bg-vscode-hover transition-colors',
    ].join(' ');
    const style = {
        WebkitAppRegion: 'no-drag',
    } as React.CSSProperties;
    return (
        <div className="flex" style={style}>
            <button
                onClick={() => ipcRenderer.send('window-minimize')}
                className={btnCls}
            >
                <svg width="10" height="1" viewBox="0 0 10 1">
                    <rect width="10" height="1" fill="currentColor" />
                </svg>
            </button>
            <button
                onClick={() => ipcRenderer.send('window-maximize')}
                className={btnCls}
            >
                <svg width="10" height="10" viewBox="0 0 10 10">
                    <rect
                        width="10" height="10" rx="0"
                        fill="none" stroke="currentColor"
                        strokeWidth="1"
                    />
                </svg>
            </button>
            <button
                onClick={() => ipcRenderer.send('window-close')}
                className={[
                    'w-12 h-8 flex items-center justify-center',
                    'text-vscode-text opacity-80 hover:bg-[#e81123]',
                    'hover:text-white hover:opacity-100 transition-colors',
                ].join(' ')}
            >
                <svg width="10" height="10" viewBox="0 0 10 10">
                    <line
                        x1="0" y1="0" x2="10" y2="10"
                        stroke="currentColor" strokeWidth="1.2"
                    />
                    <line
                        x1="10" y1="0" x2="0" y2="10"
                        stroke="currentColor" strokeWidth="1.2"
                    />
                </svg>
            </button>
        </div>
    );
}

interface ActivityRailProps {
    sidebarVisible: boolean;
    editorVisible: boolean;
    simulatorVisible: boolean;
    theme: 'light' | 'dark';
    onToggleSidebar: () => void;
    onToggleEditor: () => void;
    onToggleSimulator: () => void;
    onToggleTheme: () => void;
    onOpenSettings: () => void;
}

function ActivityRail({
    sidebarVisible,
    editorVisible,
    simulatorVisible,
    theme,
    onToggleSidebar,
    onToggleEditor,
    onToggleSimulator,
    onToggleTheme,
    onOpenSettings,
}: Readonly<ActivityRailProps>) {
    return (
        <div className={
            'flex flex-col items-center py-4 space-y-4 '
            + 'w-12 bg-vscode-activity border-r '
            + 'border-vscode-border z-50 shrink-0'
        }>
            <button
                onClick={onToggleSidebar}
                className={[
                    'text-vscode-text hover:text-vscode-textActive',
                    'transition-colors',
                    sidebarVisible
                        ? 'text-vscode-textActive border-l-2 border-blue-500'
                        : '',
                ].join(' ')}
                title="Toggle Explorer"
            >
                <FolderOpen size={24} strokeWidth={1.5} />
            </button>
            <button
                onClick={onToggleEditor}
                className={[
                    'text-vscode-text hover:text-vscode-textActive',
                    'transition-colors',
                    editorVisible ? 'text-vscode-textActive' : '',
                ].join(' ')}
                title="Toggle Code Editor"
            >
                <FileCode2 size={24} strokeWidth={1.5} />
            </button>
            <button
                onClick={onToggleSimulator}
                className={[
                    'text-vscode-text hover:text-vscode-textActive',
                    'transition-colors',
                    simulatorVisible ? 'text-vscode-textActive' : '',
                ].join(' ')}
                title="Toggle Simulator"
            >
                <PlayCircle size={24} strokeWidth={1.5} />
            </button>

            <div className="flex-1" />

            <button
                onClick={onToggleTheme}
                className="text-vscode-text hover:text-vscode-textActive transition-colors"
                title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
            >
                {theme === 'dark'
                    ? <Sun size={20} strokeWidth={1.5} />
                    : <Moon size={20} strokeWidth={1.5} />
                }
            </button>
            <button
                onClick={onOpenSettings}
                className="text-vscode-text hover:text-vscode-textActive transition-colors"
                title="Settings"
            >
                <Settings size={22} strokeWidth={1.5} />
            </button>
        </div>
    );
}

const DEFAULT_CODE = `// Write your Arduino code here
void setup() {
  pinMode(13, OUTPUT);
}

void loop() {
  digitalWrite(13, HIGH);
  delay(1000);
  digitalWrite(13, LOW);
  delay(1000);
}`;

const DEFAULT_JSON = JSON.stringify({
        version: 2,
        editor: 'avr8js-electron-playground',
        parts: [],
        connections: [],
});

const DEFAULT_DIAGRAM: WokwiDiagram = parseDiagram(JSON.parse(DEFAULT_JSON));

interface ChipBuildJumpTarget {
    fileName: string;
    lineNumber: number;
    column: number;
    token: number;
}

interface ChipDiagnosticListItem {
    fileName: string;
    chipName: string;
    diagnostic: EditorDiagnostic;
}

interface ChipBuildCacheContext {
    backend: string;
    commandSignature: string;
}

interface ChipBuildResultItem {
    name: string;
    sourceFile: string;
    wasmFile: string;
    success: boolean;
    stdout: string;
    stderr: string;
    wasmBase64?: string;
    error?: string;
}

interface ChipBuildBatchResult {
    success: boolean;
    results: ChipBuildResultItem[];
}

function resolveChipCacheContext(settings: { chipBuildBackend: string; chipBuildCommand: string }): ChipBuildCacheContext {
    return {
        backend: settings.chipBuildBackend,
        commandSignature: settings.chipBuildBackend === 'external'
            ? settings.chipBuildCommand
            : 'embedded-experimental-v2',
    };
}

function utf8ToBase64(input: string): string {
    const bytes = new TextEncoder().encode(input);
    let raw = '';
    for (const b of bytes) raw += String.fromCodePoint(b);
    return btoa(raw);
}

function collectExistingWasmByFile(files: Array<{ name: string; content: string }>): Record<string, string> {
    return Object.fromEntries(
        files
            .filter((f) => f.name.endsWith('.chip.wasm'))
            .map((f) => {
                const trimmed = f.content.trim();
                const compact = trimmed.split(/\r?\n/).join('');
                const looksLikeBase64 = /^[A-Za-z0-9+/=\r\n]+$/.test(trimmed)
                    && compact.length % 4 === 0;
                const base64 = looksLikeBase64
                    ? compact
                    : utf8ToBase64(f.content);
                return [f.name, base64] as const;
            }),
    );
}

async function partitionChipCacheHits(
    chips: ReturnType<typeof discoverCustomChipSources>,
    cacheContext: ChipBuildCacheContext,
): Promise<{
    cacheHits: ChipBuildResultItem[];
    misses: ReturnType<typeof discoverCustomChipSources>;
    missHashes: Map<string, string>;
}> {
    const cacheHits: ChipBuildResultItem[] = [];
    const misses: ReturnType<typeof discoverCustomChipSources> = [];
    const missHashes = new Map<string, string>();

    for (const chip of chips) {
        const hash = computeChipBuildHash(chip, cacheContext);
        const cached = await readCachedChipArtifact(chip, cacheContext, hash);
        if (cached) {
            cacheHits.push({
                name: chip.name,
                sourceFile: chip.sourceFile,
                wasmFile: chip.wasmFile,
                success: true,
                stdout: '[cache] hit\n',
                stderr: '',
                wasmBase64: cached.wasmBase64,
            });
            continue;
        }
        misses.push(chip);
        missHashes.set(chip.name, hash);
    }

    return { cacheHits, misses, missHashes };
}

async function runChipBuildBackend(
    backend: string,
    misses: ReturnType<typeof discoverCustomChipSources>,
    existingWasmByFile: Record<string, string>,
    options: {
        projectPath: string | null;
        chipBuildCommand: string;
        onLog: (text: string) => void;
    },
): Promise<ChipBuildBatchResult> {
    if (misses.length === 0) {
        return { success: true, results: [] };
    }

    if (backend === 'embedded-experimental') {
        options.onLog('[Chip Build] Backend: embedded-experimental\n');
        return buildCustomChipsEmbedded(misses, existingWasmByFile);
    }

    options.onLog('[Chip Build] Backend: external (IPC)\n');
    return ipcRenderer.invoke('custom-chips:build', {
        projectPath: options.projectPath,
        chips: misses,
        commandTemplate: options.chipBuildCommand,
    }) as Promise<ChipBuildBatchResult>;
}

async function persistChipBuildCache(
    buildResults: ChipBuildResultItem[],
    misses: ReturnType<typeof discoverCustomChipSources>,
    missHashes: Map<string, string>,
    cacheContext: ChipBuildCacheContext,
): Promise<void> {
    for (const item of buildResults) {
        if (!item.success || !item.wasmBase64) continue;
        const chip = misses.find((c) => c.name === item.name);
        const hash = missHashes.get(item.name);
        if (!chip || !hash) continue;
        await writeCachedChipArtifact(chip, cacheContext, hash, item.wasmBase64);
    }
}

function collectChipDiagnosticsByFile(allResults: ChipBuildResultItem[]): Record<string, EditorDiagnostic[]> {
    const diagnosticsByFile: Record<string, EditorDiagnostic[]> = {};
    for (const item of allResults) {
        const combined = [item.stderr, item.stdout, item.error ?? '']
            .filter(Boolean)
            .join('\n');
        if (!combined) continue;
        const parsed = parseChipBuildDiagnostics(combined, item.sourceFile);
        if (parsed.length > 0) {
            diagnosticsByFile[item.sourceFile] = parsed;
        }
    }
    return diagnosticsByFile;
}

function findFirstChipDiagnostic(
    diagnosticsByFile: Record<string, EditorDiagnostic[]>,
): { fileName: string; entry: EditorDiagnostic } | undefined {
    const severityWeight: Record<EditorDiagnostic['severity'], number> = {
        error: 0,
        warning: 1,
        info: 2,
        hint: 3,
    };

    return Object.entries(diagnosticsByFile)
        .flatMap(([fileName, entries]) => entries.map((entry) => ({ fileName, entry })))
        .sort((a, b) => {
            const sev = severityWeight[a.entry.severity] - severityWeight[b.entry.severity];
            if (sev !== 0) return sev;
            if (a.fileName !== b.fileName) return a.fileName.localeCompare(b.fileName);
            if (a.entry.startLineNumber !== b.entry.startLineNumber) {
                return a.entry.startLineNumber - b.entry.startLineNumber;
            }
            return a.entry.startColumn - b.entry.startColumn;
        })[0];
}

function logChipBuildResults(
    allResults: ChipBuildResultItem[],
    appendTerminalOutput: (text: string) => void,
): void {
    for (const item of allResults) {
        const status = item.success ? 'OK' : 'FAIL';
        appendTerminalOutput(`[Chip Build ${status}] ${item.name} (${item.sourceFile} -> ${item.wasmFile})\n`);
        if (item.stdout) appendTerminalOutput(item.stdout + '\n');
        if (item.stderr) appendTerminalOutput(item.stderr + '\n');
        if (item.error && !item.stderr.includes(item.error)) {
            appendTerminalOutput(item.error + '\n');
        }
    }
}

async function runChipBuildFlow(params: {
    files: Array<{ name: string; content: string }>;
    settings: {
        chipBuildBackend: string;
        chipBuildCommand: string;
    };
    projectDirPath: string | null;
    appendTerminalOutput: (text: string) => void;
    setCustomChipArtifacts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
    setChipBuildDiagnostics: (value: Record<string, EditorDiagnostic[]>) => void;
    setChipBuildJumpTarget: (value: ChipBuildJumpTarget | null) => void;
    setActiveFile: (name: string) => void;
}): Promise<boolean> {
    const {
        files,
        settings,
        projectDirPath,
        appendTerminalOutput,
        setCustomChipArtifacts,
        setChipBuildDiagnostics,
        setChipBuildJumpTarget,
        setActiveFile,
    } = params;

    const chips = discoverCustomChipSources(files);
    if (chips.length === 0) {
        setChipBuildDiagnostics({});
        setChipBuildJumpTarget(null);
        return true;
    }

    setChipBuildDiagnostics({});
    setChipBuildJumpTarget(null);

    appendTerminalOutput(`Building ${chips.length} custom chip(s)...\n`);
    const cacheContext = resolveChipCacheContext(settings);
    const existingWasmByFile = collectExistingWasmByFile(files);
    const { cacheHits, misses, missHashes } = await partitionChipCacheHits(chips, cacheContext);

    appendTerminalOutput(`[Chip Build] Cache hits: ${cacheHits.length}, rebuild: ${misses.length}\n`);

    const result = await runChipBuildBackend(
        settings.chipBuildBackend,
        misses,
        existingWasmByFile,
        {
            projectPath: projectDirPath,
            chipBuildCommand: settings.chipBuildCommand,
            onLog: appendTerminalOutput,
        },
    );

    await persistChipBuildCache(result.results, misses, missHashes, cacheContext);

    const allResults: ChipBuildResultItem[] = [...cacheHits, ...result.results];
    logChipBuildResults(allResults, appendTerminalOutput);

    setCustomChipArtifacts((prev) => mergeChipArtifacts(prev, allResults));

    const diagnosticsByFile = collectChipDiagnosticsByFile(allResults);
    setChipBuildDiagnostics(diagnosticsByFile);

    const firstDiagnostic = findFirstChipDiagnostic(diagnosticsByFile);

    if (firstDiagnostic) {
        setActiveFile(firstDiagnostic.fileName);
        setChipBuildJumpTarget({
            fileName: firstDiagnostic.fileName,
            lineNumber: firstDiagnostic.entry.startLineNumber,
            column: firstDiagnostic.entry.startColumn,
            token: Date.now(),
        });
        appendTerminalOutput(
            `[Chip Build] First diagnostic: ${firstDiagnostic.fileName}:${firstDiagnostic.entry.startLineNumber}:${firstDiagnostic.entry.startColumn}\n`,
        );
    }

    const success = allResults.every((r) => r.success);
    appendTerminalOutput(
        success
            ? 'Custom chip build completed successfully.\n'
            : 'Custom chip build finished with errors.\n',
    );

    return success;
}

async function runCompileFlow(params: {
    files: Array<{ name: string; content: string }>;
    currentProjectObj: { board?: string } | null;
    settings: {
        buildBackend: 'cloud' | 'local';
        arduinoCliPath: string;
        arduinoCliBin: string;
        fqbnMap: Record<string, string>;
        extraFlags: string;
        cloudUrl: string;
    };
    appendTerminalOutput: (text: string) => void;
    setIsCompiling: (value: boolean) => void;
    handleBuildChips: () => Promise<boolean>;
    setHex: (hex: string | null) => void;
    currentProjectName: string;
    addCompileHistory: (entry: CompileHistoryEntry) => void;
}): Promise<void> {
    const {
        files,
        currentProjectObj,
        settings,
        appendTerminalOutput,
        setIsCompiling,
        handleBuildChips,
        setHex,
        currentProjectName,
        addCompileHistory,
    } = params;

    const sketchFile = files.find(f => f.name.endsWith('.ino') || f.name.endsWith('.cpp'))?.content || '';
    const extraFiles = files
        .filter(f => /\.(c|h|cpp)$/i.test(f.name) && !/\.chip\.(c|h|cpp)$/i.test(f.name))
        .map(f => ({ name: f.name, content: f.content }));
    setIsCompiling(true);
    const startTime = Date.now();

    try {
        const chipsOk = await handleBuildChips();
        if (!chipsOk) {
            throw new Error('Custom chip build failed. Fix chip errors and try again.');
        }

        let result: { hex: string; stdout: string; stderr: string };

        if (settings.buildBackend === 'local') {
            appendTerminalOutput('Compiling with local arduino-cli...\n');
            const board = currentProjectObj?.board || 'uno';
            const fqbn = settings.fqbnMap[board] || `arduino:avr:${board}`;
            result = await ipcRenderer.invoke('arduino-cli:compile', {
                source: sketchFile,
                extraFiles,
                arduinoCliPath: settings.arduinoCliPath,
                arduinoCliBin: settings.arduinoCliBin,
                fqbn,
                extraFlags: settings.extraFlags,
            });
        } else {
            appendTerminalOutput('Compiling via Hexi cloud...\n');
            result = await buildHex(
                sketchFile,
                extraFiles,
                currentProjectObj?.board || 'uno',
                {},
                false,
                settings.cloudUrl,
            );
        }

        if (result.stderr) appendTerminalOutput('\n' + result.stderr + '\n');
        if (result.stdout) appendTerminalOutput('\n' + result.stdout + '\n');

        const success = Boolean(result.hex);
        if (success) {
            setHex(result.hex);
            appendTerminalOutput('\nCompilation Build Success. Ready to run.\n');
        }

        const entry: CompileHistoryEntry = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            timestamp: Date.now(),
            success,
            output: [result.stdout, result.stderr].filter(Boolean).join('\n').trim(),
            durationMs: Date.now() - startTime,
            projectName: currentProjectName || '(unnamed)',
        };
        addCompileHistory(entry);
    } catch (e: unknown) {
        const msg = toErrorMessage(e);
        appendTerminalOutput('\nError: ' + msg + '\n');
        const entry: CompileHistoryEntry = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            timestamp: Date.now(),
            success: false,
            output: msg,
            durationMs: Date.now() - startTime,
            projectName: currentProjectName || '(unnamed)',
        };
        addCompileHistory(entry);
    } finally {
        setIsCompiling(false);
    }
}

function toErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    try {
        return JSON.stringify(error);
    } catch {
        return 'Unknown error';
    }
}

type ProjectFileRecord = {
    name: string;
    content: string;
    language: string;
};

type LoadedProjectSnapshot = {
    name: string;
    files: ProjectFileRecord[];
    hex: string | null;
    diagram: WokwiDiagram | null;
};

type LastOpenedProjectReference = Pick<DiscoveredProject, 'name' | 'board' | 'dirPath'>;
type ProjectActivityState = {
    kind: 'discover' | 'load';
    phase: ProjectOperationProgress['phase'];
    message: string;
    completed: number | null;
    total: number | null;
};

const LAST_OPENED_PROJECT_STORAGE_KEY = 'avr8js-electron-last-opened-project';
const PROJECT_SESSION_SCOPE = 'project-session';
const LAST_OPENED_PROJECT_STORAGE_FILE = 'last-opened-project.json';

function normalizeProjectPath(projectPath: string): string {
    return projectPath.trim().split('\\').join('/').toLowerCase();
}

function isLastOpenedProjectReference(value: unknown): value is LastOpenedProjectReference {
    if (!value || typeof value !== 'object') return false;

    const parsed = value as Partial<LastOpenedProjectReference>;
    return typeof parsed.name === 'string'
        && typeof parsed.board === 'string'
        && typeof parsed.dirPath === 'string';
}

async function readLastOpenedProjectReference(): Promise<LastOpenedProjectReference | null> {
    const persisted = await readPersistedJson<LastOpenedProjectReference | null>(
        PROJECT_SESSION_SCOPE,
        LAST_OPENED_PROJECT_STORAGE_FILE,
        null,
    );
    if (isLastOpenedProjectReference(persisted)) {
        return persisted;
    }

    try {
        const raw = localStorage.getItem(LAST_OPENED_PROJECT_STORAGE_KEY);
        if (!raw) return null;

        const parsed = JSON.parse(raw) as unknown;
        if (!isLastOpenedProjectReference(parsed)) {
            return null;
        }

        void writePersistedJson(PROJECT_SESSION_SCOPE, LAST_OPENED_PROJECT_STORAGE_FILE, parsed);
        return parsed;
    } catch {
        return null;
    }
}

async function writeLastOpenedProjectReference(project: DiscoveredProject | null): Promise<void> {
    if (!project?.dirPath) return;

    const reference = {
            name: project.name,
            board: project.board,
            dirPath: project.dirPath,
        } satisfies LastOpenedProjectReference;

    await writePersistedJson(PROJECT_SESSION_SCOPE, LAST_OPENED_PROJECT_STORAGE_FILE, reference);

    try {
        localStorage.setItem(LAST_OPENED_PROJECT_STORAGE_KEY, JSON.stringify(reference));
    } catch {
        /* ignore local persistence failures */
    }
}

async function findLastOpenedProject(projectList: DiscoveredProject[]): Promise<DiscoveredProject | null> {
    const lastOpened = await readLastOpenedProjectReference();
    if (!lastOpened) return null;

    const normalizedDirPath = normalizeProjectPath(lastOpened.dirPath);
    return projectList.find((project) => normalizeProjectPath(project.dirPath) === normalizedDirPath)
        ?? projectList.find((project) => project.name === lastOpened.name && project.board === lastOpened.board)
        ?? null;
}

async function preloadLastOpenedProject(projectList: DiscoveredProject[], excludedDirPath?: string | null): Promise<void> {
    const lastOpenedProject = await findLastOpenedProject(projectList);
    if (!lastOpenedProject?.dirPath) return;

    if (excludedDirPath && normalizeProjectPath(lastOpenedProject.dirPath) === normalizeProjectPath(excludedDirPath)) {
        return;
    }

    preloadProject(lastOpenedProject);
}

interface ProjectLoadStateApplier {
    setFiles: (files: ProjectFileRecord[]) => void;
    setCurrentProject: (name: string, project: DiscoveredProject | null) => void;
    resetDiagram: (diagram: WokwiDiagram) => void;
    setHex: (hex: string | null) => void;
    setCustomChipArtifacts: (value: Record<string, string>) => void;
    setChipConsoleOutput: (value: string) => void;
    setChipBuildDiagnostics: (value: Record<string, EditorDiagnostic[]>) => void;
    setChipBuildJumpTarget: (value: ChipBuildJumpTarget | null) => void;
    setSavedContents: (value: Record<string, string>) => void;
    setActiveFile: (name: string) => void;
    clearTerminalOutput?: () => void;
    appendTerminalOutput?: (text: string) => void;
}

function applyLoadedProjectState(params: {
    loaded: LoadedProjectSnapshot;
    selectedProject: DiscoveredProject | null;
    applier: ProjectLoadStateApplier;
    clearTerminal?: boolean;
    terminalMessage?: string;
    hexOverride?: string | null;
}): boolean {
    const {
        loaded,
        selectedProject,
        applier,
        clearTerminal = false,
        terminalMessage,
        hexOverride,
    } = params;

    if (loaded.files.length === 0) {
        return false;
    }

    applier.setFiles(loaded.files);
    applier.setCurrentProject(loaded.name, selectedProject);
    if (loaded.diagram) applier.resetDiagram(loaded.diagram);
    applier.setHex(hexOverride ?? loaded.hex);
    applier.setCustomChipArtifacts({});
    applier.setChipConsoleOutput('');
    applier.setChipBuildDiagnostics({});
    applier.setChipBuildJumpTarget(null);
    applier.setSavedContents(Object.fromEntries(loaded.files.map((f) => [f.name, f.content])));

    const inoFile = loaded.files.find((f) => f.name.endsWith('.ino'));
    applier.setActiveFile(inoFile ? inoFile.name : loaded.files[0].name);

    if (clearTerminal) applier.clearTerminalOutput?.();
    if (terminalMessage) applier.appendTerminalOutput?.(terminalMessage);
    return true;
}

function buildProjectLoadStateApplier(params: {
    setFiles: (files: ProjectFileRecord[]) => void;
    setCurrentProject: (name: string, project: DiscoveredProject | null) => void;
    resetDiagram: (diagram: WokwiDiagram) => void;
    setHex: (hex: string | null) => void;
    setCustomChipArtifacts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
    setChipConsoleOutput: React.Dispatch<React.SetStateAction<string>>;
    setChipBuildDiagnostics: React.Dispatch<React.SetStateAction<Record<string, EditorDiagnostic[]>>>;
    setChipBuildJumpTarget: React.Dispatch<React.SetStateAction<ChipBuildJumpTarget | null>>;
    setSavedContents: (value: Record<string, string>) => void;
    setActiveFile: (name: string) => void;
    clearTerminalOutput: () => void;
    appendTerminalOutput: (text: string) => void;
}): ProjectLoadStateApplier {
    return {
        setFiles: params.setFiles,
        setCurrentProject: params.setCurrentProject,
        resetDiagram: params.resetDiagram,
        setHex: params.setHex,
        setCustomChipArtifacts: (value) => params.setCustomChipArtifacts(value),
        setChipConsoleOutput: (value) => params.setChipConsoleOutput(value),
        setChipBuildDiagnostics: (value) => params.setChipBuildDiagnostics(value),
        setChipBuildJumpTarget: (value) => params.setChipBuildJumpTarget(value),
        setSavedContents: params.setSavedContents,
        setActiveFile: params.setActiveFile,
        clearTerminalOutput: params.clearTerminalOutput,
        appendTerminalOutput: params.appendTerminalOutput,
    };
}

export default function App() { // NOSONAR: composition root
    const rendererStartupMeasureRef = useRef<null | (() => number)>(null);
    if (!rendererStartupMeasureRef.current) {
        rendererStartupMeasureRef.current = startPerfMeasure('renderer-app-startup');
    }

    // ── Global Store ──
    const {
        projects, setProjects,
        currentProjectName, currentProjectObj, setCurrentProject,
        files, setFiles,
        activeFile, setActiveFile,
        savedContents, setSavedContents, setSavedContent,
        hex, setHex,
        isCompiling, setIsCompiling,
        terminalChunks, appendTerminalOutput, clearTerminalOutput, setTerminalChunks,
        compileHistory, addCompileHistory, clearCompileHistory, setCompileHistory,
    } = useProjectStore();

    // ── Settings ──
    const settings = useSettingsStore();
    const [settingsOpen, setSettingsOpen] = useState(false);

    useEffect(() => {
        setPerfLoggingEnabled(settings.performanceMode);
    }, [settings.performanceMode]);

    useEffect(() => {
        if (!settings.performanceMode) return;

        const recent = getRecentPerfEntries();
        const recentTail = recent.slice(-20);
        for (const entry of recentTail) {
            appendTerminalOutput(formatPerfEntry(entry) + '\n');
        }

        const unsubscribe = subscribePerfEntries((entry) => {
            appendTerminalOutput(formatPerfEntry(entry) + '\n');
        });

        return unsubscribe;
    }, [settings.performanceMode, appendTerminalOutput]);

    useEffect(() => {
        const durationMs = rendererStartupMeasureRef.current?.() ?? null;
        rendererStartupMeasureRef.current = null;

        if (durationMs === null) return;

        const { thresholds } = parsePerfThresholdConfig(settings.performanceThresholdsJson);
        const thresholdMs = resolvePerfThresholdMs('renderer-app-startup', thresholds);
        if (durationMs <= thresholdMs) return;

        const detail = `startup=${durationMs.toFixed(1)}ms threshold=${thresholdMs}ms`;
        markPerf('warning:startup-threshold-exceeded', detail);
        appendTerminalOutput(`[warning] Renderer startup exceeded target: ${durationMs.toFixed(1)} ms > ${thresholdMs} ms\n`);
    }, [appendTerminalOutput, settings.performanceThresholdsJson]);

    useEffect(() => {
        if (!currentProjectObj?.dirPath) return;
        void writeLastOpenedProjectReference(currentProjectObj);
    }, [currentProjectObj]);

    // Keep global DOM classes + native dialogs in sync with app theme.
    useEffect(() => {
        const isLight = settings.theme === 'light';
        document.documentElement.classList.toggle('theme-light', isLight);
        document.body.classList.toggle('theme-light', isLight);
        document.documentElement.dataset.theme = settings.theme;
        ipcRenderer.send('native-theme:set', settings.theme);
    }, [settings.theme]);

    // ── Command Palette ──
    const [paletteOpen, setPaletteOpen] = useState(false);

    // ── New Project Dialog ──
    const [newProjectOpen, setNewProjectOpen] = useState(false);

    // ── Add File inline input ──
    const [addingFile, setAddingFile] = useState(false);
    const [newFileName, setNewFileName] = useState('');
    const [customChipArtifacts, setCustomChipArtifacts] = useState<Record<string, string>>({});
    const [chipConsoleOutput, setChipConsoleOutput] = useState('');
    const [chipBuildDiagnostics, setChipBuildDiagnostics] = useState<Record<string, EditorDiagnostic[]>>({});
    const [chipBuildJumpTarget, setChipBuildJumpTarget] = useState<ChipBuildJumpTarget | null>(null);

    // ── Local Layout State ──
    const [editorVisible, setEditorVisible] = useState(DEFAULT_UI_LAYOUT_STATE.editorVisible);
    const [sidebarVisible, setSidebarVisible] = useState(DEFAULT_UI_LAYOUT_STATE.sidebarVisible);
    const [terminalVisible, setTerminalVisible] = useState(DEFAULT_UI_LAYOUT_STATE.terminalVisible);
    const [simulatorVisible, setSimulatorVisible] = useState(DEFAULT_UI_LAYOUT_STATE.simulatorVisible);
    const [sidebarContentSizes, setSidebarContentSizes] = useState<[number, number]>(DEFAULT_UI_LAYOUT_STATE.sidebarContentSizes);
    const [editorSimulatorSizes, setEditorSimulatorSizes] = useState<[number, number]>(DEFAULT_UI_LAYOUT_STATE.editorSimulatorSizes);
    const [codeTerminalSizes, setCodeTerminalSizes] = useState<[number, number]>(DEFAULT_UI_LAYOUT_STATE.codeTerminalSizes);
    const [openEditorFiles, setOpenEditorFiles] = useState<string[]>([]);
    const [sidebarSectionState, setSidebarSectionState] = useState<UiSidebarSectionsState>(DEFAULT_UI_SIDEBAR_SECTIONS_STATE);
    const [diagnosticsFilterState, setDiagnosticsFilterState] = useState<UiDiagnosticsSessionState>(DEFAULT_UI_DIAGNOSTICS_SESSION_STATE);
    const [compileHistoryExpandedIds, setCompileHistoryExpandedIds] = useState<string[]>([]);
    const [persistedTerminalTab, setPersistedTerminalTab] = useState(DEFAULT_UI_TERMINAL_SESSION_STATE.selectedTab);
    const [tabStripScrollLeft, setTabStripScrollLeft] = useState(0);
    const [terminalViewState, setTerminalViewState] = useState<UiTerminalSessionState>(DEFAULT_UI_TERMINAL_SESSION_STATE);
    const [dismissedRestoredWarningKey, setDismissedRestoredWarningKey] = useState<string | null>(null);
    const [dismissedRestoredWarning, setDismissedRestoredWarning] = useState<UiRestoredLogWarning | null>(null);
    const [restoredLogWarningKey, setRestoredLogWarningKey] = useState<string | null>(null);
    const [restoredLogWarning, setRestoredLogWarning] = useState<UiRestoredLogWarning | null>(null);
    const [uiSessionLoaded, setUiSessionLoaded] = useState(false);
    const [editorBootReady, setEditorBootReady] = useState(false);
    const [projectActivity, setProjectActivity] = useState<ProjectActivityState | null>(null);

    // ── Diagram State ──
    const {
        diagram, setDiagram, resetDiagram, addPart,
        undo, redo, canUndo, canRedo,
    } = useDiagramState(DEFAULT_DIAGRAM);

    // ── Serial Input ──
    const serialWriteRef = useRef<((text: string, usartId?: string) => void) | null>(null);
    const tabStripRef = useRef<HTMLDivElement | null>(null);
    const tabButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
    const discoverAbortRef = useRef<AbortController | null>(null);
    const loadAbortRef = useRef<AbortController | null>(null);
    const hydratedProjectSessionRef = useRef<string | null>(null);

    const projectStateApplier = useMemo(() => buildProjectLoadStateApplier({
        setFiles,
        setCurrentProject,
        resetDiagram,
        setHex,
        setCustomChipArtifacts,
        setChipConsoleOutput,
        setChipBuildDiagnostics,
        setChipBuildJumpTarget,
        setSavedContents,
        setActiveFile,
        clearTerminalOutput,
        appendTerminalOutput,
    }), [
        setFiles,
        setCurrentProject,
        resetDiagram,
        setHex,
        setSavedContents,
        setActiveFile,
        clearTerminalOutput,
        appendTerminalOutput,
    ]);

    const serialTargetOptions = useMemo(() => {
        const boardProfile = resolveBoardProfileFromParts(diagram?.parts ?? []);
        return Object.keys(boardProfile.mcu.usarts).map((usartId) => ({
            value: usartId,
            label: usartId.toUpperCase(),
        }));
    }, [diagram]);
    const selectedSerialTarget = serialTargetOptions.some((option) => option.value === terminalViewState.serialTarget)
        ? terminalViewState.serialTarget
        : (serialTargetOptions[0]?.value ?? DEFAULT_UI_TERMINAL_SESSION_STATE.serialTarget);

    // ── Layout Hooks (Declarative Split.js) ──
    useEffect(() => {
        let cancelled = false;

        void readUiSession().then((session) => {
            if (cancelled) return;

            setSidebarVisible(session.layout.sidebarVisible);
            setEditorVisible(session.layout.editorVisible);
            setTerminalVisible(session.layout.terminalVisible);
            setSimulatorVisible(session.layout.simulatorVisible);
            setSidebarContentSizes(session.layout.sidebarContentSizes);
            setEditorSimulatorSizes(session.layout.editorSimulatorSizes);
            setCodeTerminalSizes(session.layout.codeTerminalSizes);
            setUiSessionLoaded(true);
        });

        return () => {
            cancelled = true;
        };
    }, []);

    useResizableLayout(['#sidebar-pane', '#content-pane'], {
        sizes: sidebarContentSizes,
        minSize: [180, 500],
        gutterSize: 4,
        enabled: sidebarVisible,
        onSizesChange: (sizes) => setSidebarContentSizes([sizes[0] ?? 18, sizes[1] ?? 82]),
    });

    useResizableLayout(['#editor-area-pane', '#simulator-pane'], {
        sizes: editorSimulatorSizes,
        minSize: [300, 400],
        gutterSize: 4,
        enabled: editorVisible && simulatorVisible,
        onSizesChange: (sizes) => setEditorSimulatorSizes([sizes[0] ?? 45, sizes[1] ?? 55]),
    });

    useResizableLayout(['#code-pane', '#terminal-pane'], {
        sizes: codeTerminalSizes,
        minSize: [150, 120],
        gutterSize: 4,
        direction: 'vertical',
        enabled: editorVisible && terminalVisible,
        onSizesChange: (sizes) => setCodeTerminalSizes([sizes[0] ?? 75, sizes[1] ?? 25]),
    });

    useEffect(() => {
        if (!uiSessionLoaded) return;

        const timeoutId = globalThis.setTimeout(() => {
            void updateUiSession((draft) => {
                draft.layout.sidebarVisible = sidebarVisible;
                draft.layout.editorVisible = editorVisible;
                draft.layout.terminalVisible = terminalVisible;
                draft.layout.simulatorVisible = simulatorVisible;
                draft.layout.sidebarContentSizes = sidebarContentSizes;
                draft.layout.editorSimulatorSizes = editorSimulatorSizes;
                draft.layout.codeTerminalSizes = codeTerminalSizes;
            });
        }, 120);

        return () => globalThis.clearTimeout(timeoutId);
    }, [
        codeTerminalSizes,
        editorSimulatorSizes,
        editorVisible,
        sidebarContentSizes,
        sidebarVisible,
        simulatorVisible,
        terminalVisible,
        uiSessionLoaded,
    ]);

    useEffect(() => {
        if (!uiSessionLoaded || !currentProjectObj?.dirPath || !activeFile) return;

        void updateUiSession((draft) => {
            const projectKey = normalizeProjectSessionKey(currentProjectObj.dirPath);
            draft.projects[projectKey] = buildProjectSessionSnapshot({
                activeFile,
                openFiles: openEditorFiles,
                sidebarSections: sidebarSectionState,
                diagnostics: diagnosticsFilterState,
                compileHistoryExpandedIds,
                dismissedRestoredWarningKey,
                tabStripScrollLeft,
                terminal: {
                    ...terminalViewState,
                    selectedTab: persistedTerminalTab,
                },
                terminalOutputChunks: terminalChunks,
                chipOutput: chipConsoleOutput,
                compileHistory,
            });
        });
    }, [
        activeFile,
        chipConsoleOutput,
        compileHistory,
        compileHistoryExpandedIds,
        currentProjectObj?.dirPath,
        diagnosticsFilterState,
        dismissedRestoredWarningKey,
        openEditorFiles,
        persistedTerminalTab,
        sidebarSectionState,
        tabStripScrollLeft,
        terminalChunks,
        terminalViewState,
        uiSessionLoaded,
    ]);

    useEffect(() => {
        if (!uiSessionLoaded || !currentProjectObj?.dirPath || files.length === 0) return;

        const projectKey = normalizeProjectSessionKey(currentProjectObj.dirPath);
        if (hydratedProjectSessionRef.current === projectKey) return;
        hydratedProjectSessionRef.current = projectKey;

        void readUiSession().then((session) => {
            const projectSession = session.projects[projectKey];
            const restored = resolveProjectSessionRestore(projectSession, files);
            setOpenEditorFiles(restored.openFiles);
            setSidebarSectionState(restored.sidebarSections);
            setDiagnosticsFilterState(restored.diagnostics);
            setCompileHistoryExpandedIds(restored.compileHistoryExpandedIds);
            setDismissedRestoredWarningKey(projectSession?.dismissedRestoredWarningKey ?? null);
            setDismissedRestoredWarning(restored.dismissedRestoredWarning);
            setPersistedTerminalTab(projectSession?.terminal?.selectedTab ?? DEFAULT_UI_TERMINAL_SESSION_STATE.selectedTab);
            setTabStripScrollLeft(restored.tabStripScrollLeft);
            setTerminalViewState(restored.terminal);
            setTerminalChunks(restored.terminalOutputChunks);
            setChipConsoleOutput(restored.chipOutput);
            setCompileHistory(restored.compileHistory);
            setRestoredLogWarningKey(restored.restoredLogWarningKey);
            setRestoredLogWarning(restored.restoredLogWarning);

            if (restored.activeFile) {
                setActiveFile(restored.activeFile);
            }
        });
    }, [currentProjectObj?.dirPath, files, setActiveFile, setCompileHistory, setTerminalChunks, uiSessionLoaded]);

    useEffect(() => {
        const validIds = new Set(compileHistory.map((entry) => entry.id));
        setCompileHistoryExpandedIds((current) => current.filter((id) => validIds.has(id)));
    }, [compileHistory]);

    const updateProjectActivity = useCallback((progress: ProjectOperationProgress) => {
        setProjectActivity({
            kind: progress.kind,
            phase: progress.phase,
            message: progress.message,
            completed: progress.completed ?? null,
            total: progress.total ?? null,
        });
    }, []);

    const cancelProjectOperations = useCallback(() => {
        if (projectActivity?.phase === 'cancelled') return;
        discoverAbortRef.current?.abort();
        loadAbortRef.current?.abort();
        setProjectActivity((current) => current
            ? {
                ...current,
                phase: 'cancelled',
                message: current.kind === 'discover'
                    ? 'Cancelling project scan...'
                    : 'Cancelling project load...',
            }
            : null);
    }, [projectActivity?.phase]);

    const runProjectDiscovery = useCallback(async (
        metricName: string,
        operation: (options: { signal: AbortSignal; onProgress: (progress: ProjectOperationProgress) => void }) => Promise<DiscoveredProject[]>,
        detail?: string,
    ): Promise<DiscoveredProject[] | null> => {
        discoverAbortRef.current?.abort();
        const controller = new AbortController();
        discoverAbortRef.current = controller;
        setProjectActivity({ kind: 'discover', phase: 'start', message: 'Scanning available projects...', completed: null, total: null });

        try {
            return await measureAsync(metricName, () => operation({ signal: controller.signal, onProgress: updateProjectActivity }), detail);
        } catch (error) {
            if (isProjectOperationAborted(error)) {
                appendTerminalOutput('[projects] Project scan cancelled.\n');
                return null;
            }
            throw error;
        } finally {
            if (discoverAbortRef.current === controller) {
                discoverAbortRef.current = null;
                setProjectActivity((current) => current?.kind === 'discover' ? null : current);
            }
        }
    }, [updateProjectActivity]);

    const runProjectLoad = useCallback(async (
        metricName: string,
        project: DiscoveredProject,
        options: { preferCache?: boolean } = {},
    ): Promise<LoadedProjectSnapshot | null> => {
        hydratedProjectSessionRef.current = null;
        discoverAbortRef.current?.abort();
        loadAbortRef.current?.abort();
        const controller = new AbortController();
        loadAbortRef.current = controller;
        setProjectActivity({ kind: 'load', phase: 'start', message: `Loading ${project.name} files...`, completed: null, total: null });

        try {
            return await measureAsync(metricName, () => loadProject(project, {
                preferCache: options.preferCache,
                signal: controller.signal,
                onProgress: updateProjectActivity,
            }), project.name);
        } catch (error) {
            if (isProjectOperationAborted(error)) {
                appendTerminalOutput(`[projects] Loading ${project.name} cancelled.\n`);
                return null;
            }
            throw error;
        } finally {
            if (loadAbortRef.current === controller) {
                loadAbortRef.current = null;
                setProjectActivity((current) => current?.kind === 'load' ? null : current);
            }
        }
    }, [updateProjectActivity]);

    // Defer Monaco boot so first paint is not blocked by heavy editor/workers loading.
    useEffect(() => {
        if (!editorVisible || editorBootReady) return;

        const finishEditorBootWait = startPerfMeasure('monaco-editor-idle-wait');

        const globalObj = globalThis as typeof globalThis & {
            requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
            cancelIdleCallback?: (id: number) => void;
        };

        if (globalObj.requestIdleCallback) {
            const idleId = globalObj.requestIdleCallback(() => {
                finishEditorBootWait();
                setEditorBootReady(true);
            }, { timeout: 1500 });
            return () => globalObj.cancelIdleCallback?.(idleId);
        }

        const timeoutId = globalThis.setTimeout(() => {
            finishEditorBootWait();
            setEditorBootReady(true);
        }, 250);
        return () => globalThis.clearTimeout(timeoutId);
    }, [editorVisible, editorBootReady]);

    // ── Load examples via auto-discovery on startup ──
    useEffect(() => {
        let cancelled = false;

        void (async () => {
            const discovered = await runProjectDiscovery('startup-discover-projects', (options) => discoverProjects(options));
            if (cancelled) return;
            if (discovered === null) return;

            if (discovered.length > 0) {
                setProjects(discovered);
                void preloadLastOpenedProject(discovered);
            } else {
                setFiles([
                    { name: 'sketch.ino', content: DEFAULT_CODE, language: 'cpp' },
                    { name: 'diagram.json', content: DEFAULT_JSON, language: 'json' }
                ]);
                setActiveFile('sketch.ino');
                setChipBuildDiagnostics({});
                setChipBuildJumpTarget(null);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [projectStateApplier, runProjectDiscovery, setProjects, setFiles, setActiveFile]);

    // ── Auto-Save Diagram to Disk ──
    useAutoSave({
        diagram,
        projectPath: currentProjectObj?.dirPath || null,
        delay: settings.autoSaveDelay,
        enabled: settings.autoSaveDelay > 0,
    });

    // ── Switch project handler ──
    const handleProjectSelect = useCallback(async (projectName: string) => {
        const project = projects.find(p => p.name === projectName);
        if (!project) return;
        const loaded = await runProjectLoad('project-select-load', project);
        if (!loaded) return;
        applyLoadedProjectState({
            loaded,
            selectedProject: project,
            applier: projectStateApplier,
            clearTerminal: true,
        });
    }, [projects, projectStateApplier, runProjectLoad]);

    const handleRefreshCurrentProject = useCallback(async () => {
        const target = currentProjectObj
            ?? projects.find((p) => p.name === currentProjectName)
            ?? null;
        if (!target?.dirPath) return;

        const loaded = await runProjectLoad('project-refresh-load', target, { preferCache: false });
        if (!loaded) return;
        const ok = applyLoadedProjectState({
            loaded,
            selectedProject: target,
            applier: projectStateApplier,
            terminalMessage: `Refreshed project from disk: ${loaded.name}\n`,
        });
        if (!ok) return;
    }, [
        currentProjectObj,
        projects,
        currentProjectName,
        projectStateApplier,
        runProjectLoad,
    ]);

    const handleOpenProjectsFolder = useCallback(async () => {
        const dir = await pickProjectsDirectory();
        if (!dir) return;

        const discovered = await runProjectDiscovery(
            'project-discovery:external-root',
            (options) => discoverProjectsFromRoot(dir, 'external', options),
            dir,
        );
        if (discovered === null) return;
        if (discovered.length === 0) {
            appendTerminalOutput(`No projects found in folder: ${dir}\n`);
            return;
        }

        setProjects(discovered);
        const first = discovered[0];
        const loaded = await runProjectLoad('project-open-folder-load-first', first);
        if (!loaded) return;
        const ok = applyLoadedProjectState({
            loaded,
            selectedProject: first,
            applier: projectStateApplier,
            terminalMessage: `Loaded ${discovered.length} project(s) from folder: ${dir}\n`,
        });
        if (!ok) {
            appendTerminalOutput(`Failed to load project files from: ${first.dirPath}\n`);
            return;
        }

        void preloadLastOpenedProject(discovered, first.dirPath);
    }, [
        appendTerminalOutput,
        runProjectDiscovery,
        runProjectLoad,
        setProjects,
        projectStateApplier,
    ]);

    const handleResetToExamples = useCallback(async () => {
        const discovered = await runProjectDiscovery('project-discovery:reset-examples', (options) => discoverProjects(options));
        if (discovered === null) return;
        if (discovered.length === 0) {
            appendTerminalOutput('No built-in examples found.\n');
            return;
        }

        setProjects(discovered);
        const first = discovered[0];
        const loaded = await runProjectLoad('project-reset-load-first', first);
        if (!loaded) return;
        const ok = applyLoadedProjectState({
            loaded,
            selectedProject: first,
            applier: projectStateApplier,
            terminalMessage: 'Restored built-in example projects list.\n',
        });
        if (!ok) {
            appendTerminalOutput(`Failed to load example project files from: ${first.dirPath}\n`);
            return;
        }

        void preloadLastOpenedProject(discovered, first.dirPath);
    }, [
        appendTerminalOutput,
        runProjectDiscovery,
        runProjectLoad,
        setProjects,
        projectStateApplier,
    ]);

    // parse diagram from manual diagram.json changes in Monaco editor
    useEffect(() => {
        const diagramFile = files.find(f => f.name === 'diagram.json');
        if (diagramFile && activeFile === 'diagram.json') {
            try {
                const parsed = parseDiagram(JSON.parse(diagramFile.content));
                if (parsed?.parts) setDiagram(parsed);
            } catch {
                // ignore syntax errors while typing
            }
        }
    }, [files, activeFile, setDiagram]);

    const handleBuildChips = useCallback(async (): Promise<boolean> => {
        return runChipBuildFlow({
            files,
            settings: {
                chipBuildBackend: settings.chipBuildBackend,
                chipBuildCommand: settings.chipBuildCommand,
            },
            projectDirPath: currentProjectObj?.dirPath || null,
            appendTerminalOutput,
            setCustomChipArtifacts,
            setChipBuildDiagnostics,
            setChipBuildJumpTarget,
            setActiveFile,
        });
    }, [files, currentProjectObj?.dirPath, settings.chipBuildBackend, settings.chipBuildCommand, appendTerminalOutput, setActiveFile]);

    const handleCompile = useCallback(async () => {
        await runCompileFlow({
            files,
            currentProjectObj,
            settings,
            appendTerminalOutput,
            setIsCompiling,
            handleBuildChips,
            setHex,
            currentProjectName,
            addCompileHistory,
        });
    }, [
        files,
        currentProjectObj,
        settings,
        appendTerminalOutput,
        setIsCompiling,
        handleBuildChips,
        setHex,
        currentProjectName,
        addCompileHistory,
    ]);

    const handleCodeChange = (newContent: string) => {
        setFiles(prev => prev.map(f => f.name === activeFile ? { ...f, content: newContent } : f));
    };

    const handleAddComponent = (part: WokwiPart) => {
        addPart(part);
        setFiles(prev => prev.map(f => {
            if (f.name !== 'diagram.json') return f;
            try {
                const parsed = JSON.parse(f.content);
                if (parsed.parts) parsed.parts.push(part);
                return { ...f, content: JSON.stringify(parsed, null, 2) };
            } catch {
                return f;
            }
        }));
    };

    const handleDiagramChange = (newDiagram: WokwiDiagram) => {
        setDiagram(newDiagram);
        setFiles(prev => prev.map(f =>
            f.name === 'diagram.json' ? { ...f, content: JSON.stringify(newDiagram, null, 2) } : f
        ));
    };

    const handleExport = useCallback(async () => {
        const board = currentProjectObj?.board || 'uno';
        const name = currentProjectName || 'project';
        const saved = await exportProject(name, board, files);
        if (saved) appendTerminalOutput(`Exported to ${saved}\n`);
    }, [currentProjectName, currentProjectObj, files, appendTerminalOutput]);

    const handleImport = useCallback(async () => {
        const data = await importProject();
        if (!data) return;
        setFiles(data.files);
        setCurrentProject(data.name, null);
        setSavedContents(
            Object.fromEntries(data.files.map(f => [f.name, f.content]))
        );
        const diagramFile = data.files.find(f => f.name === 'diagram.json');
        if (diagramFile) {
            try {
                const parsed = parseDiagram(JSON.parse(diagramFile.content));
                if (parsed?.parts) resetDiagram(parsed);
            } catch { /* ignore parse errors */ }
        }
        const inoFile = data.files.find(f => f.name.endsWith('.ino'));
        setActiveFile(inoFile ? inoFile.name : data.files[0].name);
        setHex(null);
        setCustomChipArtifacts({});
        setChipConsoleOutput('');
        setChipBuildDiagnostics({});
        setChipBuildJumpTarget(null);
        clearTerminalOutput();
        appendTerminalOutput(`Imported project: ${data.name}\n`);
    }, [setFiles, setCurrentProject, resetDiagram, setActiveFile, setHex,
        clearTerminalOutput, appendTerminalOutput, setSavedContents]);

    const activeFileData = files.find(f => f.name === activeFile);
    const customChipManifests = useMemo(
        () => discoverCustomChipManifests(files),
        [files],
    );
    const appendChipConsoleOutput = useCallback((text: string) => {
        setChipConsoleOutput((prev) => prev + text);
    }, []);
    const clearChipConsoleOutput = useCallback(() => {
        setChipConsoleOutput('');
    }, []);
    const chipDiagnostics = useMemo<ChipDiagnosticListItem[]>(() => {
        return Object.entries(chipBuildDiagnostics)
            .flatMap(([fileName, diagnostics]) => {
                const chipName = fileName.replace(/\.chip\.(c|cc|cpp|h)$/i, '');
                return diagnostics.map((diagnostic) => ({
                    fileName,
                    chipName,
                    diagnostic,
                }));
            });
    }, [chipBuildDiagnostics]);
    const openChipDiagnostic = useCallback((fileName: string, lineNumber: number, column: number) => {
        setActiveFile(fileName);
        setChipBuildJumpTarget({
            fileName,
            lineNumber,
            column,
            token: Date.now(),
        });
    }, [setActiveFile]);
    const clearChipDiagnostics = useCallback(() => {
        setChipBuildDiagnostics({});
        setChipBuildJumpTarget(null);
    }, []);

    // ── Dirty state helpers ──────────────────────────────────────
    const isFileDirty = useCallback((filename: string) => {
        const f = files.find(x => x.name === filename);
        if (!f) return false;
        // If no saved record yet (e.g. newly added file) treat as dirty
        if (!(filename in savedContents)) return true;
        return f.content !== savedContents[filename];
    }, [files, savedContents]);

    const activeFileDirty = isFileDirty(activeFile);
    const projectPath = currentProjectObj?.dirPath ?? null;

    /** Save one file to disk and mark it clean */
    const handleSaveFile = useCallback(async (filename: string) => {
        if (!projectPath) return;
        const f = files.find(x => x.name === filename);
        if (!f) return;
        // For diagram.json, reuse the existing diagram IPC
        const channel = filename === 'diagram.json'
            ? 'project:save-diagram'
            : 'project:save-file';
        const args = filename === 'diagram.json'
            ? { path: projectPath, content: f.content }
            : { projectPath, filename, content: f.content };
        const result = await ipcRenderer.invoke(channel, args) as { success: boolean; error?: string };
        if (result.success) {
            setSavedContent(filename, f.content);
        } else {
            appendTerminalOutput(`\nFailed to save ${filename}: ${result.error ?? 'unknown error'}\n`);
        }
    }, [projectPath, files, setSavedContent, appendTerminalOutput]);

    /** Restore one file to its last-saved content */
    const handleRestoreFile = useCallback((filename: string) => {
        const saved = savedContents[filename];
        if (saved === undefined) return;
        setFiles(prev => prev.map(f => f.name === filename ? { ...f, content: saved } : f));
        // If restoring diagram.json, also update the diagram state
        if (filename === 'diagram.json') {
            try {
                const parsed = parseDiagram(JSON.parse(saved));
                if (parsed?.parts) setDiagram(parsed);
            } catch { /* ignore */ }
        }
    }, [savedContents, setFiles, setDiagram]);

    /** Ctrl+S — save the active file */
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                if (activeFile) handleSaveFile(activeFile);
            }
            // Ctrl+P — command palette
            if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
                e.preventDefault();
                setPaletteOpen(true);
            }
        };
        globalThis.addEventListener('keydown', handler);
        return () => globalThis.removeEventListener('keydown', handler);
    }, [activeFile, handleSaveFile]);

    /** Determine human-readable language from file extension */
    const langFromExt = (filename: string): string => {
        if (filename.endsWith('.ino') || filename.endsWith('.cpp') || filename.endsWith('.c')) return 'cpp';
        if (filename.endsWith('.h')) return 'cpp';
        if (filename.endsWith('.json')) return 'json';
        return 'plaintext';
    };

    /** Commit a new file in the tab bar */
    const handleAddFileCommit = useCallback(() => {
        const name = newFileName.trim();
        if (!name) { setAddingFile(false); setNewFileName(''); return; }
        // Avoid duplicates
        if (files.some(f => f.name === name)) {
            setAddingFile(false); setNewFileName('');
            setActiveFile(name);
            return;
        }
        const lang = langFromExt(name);
        setFiles(prev => [...prev, { name, content: '', language: lang }]);
        setActiveFile(name);
        setAddingFile(false);
        setNewFileName('');
    }, [newFileName, files, setFiles, setActiveFile]);

    const getTabStripItems = useCallback(() => {
        const container = tabStripRef.current;
        if (!container) return [];

        return Array.from(container.children)
            .filter((child): child is HTMLDivElement => child instanceof HTMLDivElement);
    }, []);

    const scrollTabStrip = useCallback((direction: 'left' | 'right') => {
        const container = tabStripRef.current;
        if (!container) return;

        const items = getTabStripItems();
        if (items.length === 0) return;

        const viewportStart = container.scrollLeft;
        const pageWidth = Math.max(320, Math.floor(container.clientWidth * 0.9));
        const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth);
        const tolerance = 2;
        const desiredLeft = direction === 'right'
            ? Math.min(maxScrollLeft, viewportStart + pageWidth)
            : Math.max(0, viewportStart - pageWidth);

        const target = direction === 'right'
            ? items.find((item) => item.offsetLeft >= desiredLeft - tolerance)
            : [...items].reverse().find((item) => item.offsetLeft <= desiredLeft + tolerance);

        if (!target) {
            container.scrollTo({
                left: desiredLeft,
                behavior: 'smooth',
            });
            return;
        }

        container.scrollTo({
            left: target.offsetLeft,
            behavior: 'smooth',
        });
    }, [getTabStripItems]);

    const openFileInEditor = useCallback((fileName: string) => {
        setOpenEditorFiles((previous) => previous.includes(fileName) ? previous : [...previous, fileName]);
        setActiveFile(fileName);
    }, [setActiveFile]);

    const closeOpenEditor = useCallback((fileName: string) => {
        setOpenEditorFiles((previous) => {
            if (!previous.includes(fileName)) return previous;

            const next = previous.filter((name) => name !== fileName);
            if (activeFile === fileName) {
                const index = previous.indexOf(fileName);
                const fallback = next[Math.min(index, next.length - 1)] ?? files[0]?.name ?? '';
                if (fallback) {
                    setActiveFile(fallback);
                }
            }

            return next;
        });
    }, [activeFile, files, setActiveFile]);

    // Keep the active tab visible even when there are many open files.
    useEffect(() => {
        const activeTab = tabButtonRefs.current[activeFile];
        if (!activeTab) return;
        activeTab.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
            inline: 'nearest',
        });
    }, [activeFile, files.length]);

    useEffect(() => {
        if (!activeFile) return;
        setOpenEditorFiles((previous) => previous.includes(activeFile) ? previous : [...previous, activeFile]);
    }, [activeFile]);

    useEffect(() => {
        const validFiles = new Set(files.map((file) => file.name));
        setOpenEditorFiles((previous) => {
            const filtered = previous.filter((name) => validFiles.has(name));
            return filtered.length > 0 ? filtered : files.map((file) => file.name);
        });
    }, [files]);

    useEffect(() => {
        const element = tabStripRef.current;
        if (!element) return;
        element.scrollLeft = tabStripScrollLeft;
    }, [openEditorFiles, tabStripScrollLeft]);

    /** Handle new project creation */
    const handleCreateProject = useCallback(async (opts: NewProjectOptions) => {
        const slug = opts.name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).join('-');
        const appRoot = await getAppRoot();

        const blankCode = `// ${opts.name}\nvoid setup() {\n\n}\n\nvoid loop() {\n\n}\n`;
        const blinkCode = `// ${opts.name} — Blink LED\nvoid setup() {\n  pinMode(13, OUTPUT);\n}\n\nvoid loop() {\n  digitalWrite(13, HIGH);\n  delay(1000);\n  digitalWrite(13, LOW);\n  delay(1000);\n}\n`;
        const inoContent = opts.template === 'blink' ? blinkCode : blankCode;
        const diagramContent = stringifyEmptyDiagramForBuildBoard(opts.board);

        const result = await ipcRenderer.invoke('project:create', {
            appRoot,
            category: opts.category,
            slug,
            name: opts.name,
            board: opts.board,
            inoContent,
            diagramContent,
        }) as { success: boolean; dirPath?: string; error?: string };

        if (result.success) {
            appendTerminalOutput(`\nProject "${opts.name}" created at ${result.dirPath}\n`);
            // Rediscover and switch to the new project
            const discovered = await runProjectDiscovery('project-discovery:after-create', (options) => discoverProjects(options));
            if (discovered === null) return;
            setProjects(discovered);
            const newProj = discovered.find(p => p.name === opts.name);
            if (newProj) {
                const loaded = await runProjectLoad('project-load:after-create', newProj);
                if (!loaded) return;
                applyLoadedProjectState({
                    loaded,
                    selectedProject: newProj,
                    applier: projectStateApplier,
                    hexOverride: null,
                });
            }
        } else {
            appendTerminalOutput(`\nFailed to create project: ${result.error ?? 'unknown error'}\n`);
        }
        setNewProjectOpen(false);
    }, [appendTerminalOutput, setProjects, projectStateApplier, runProjectDiscovery, runProjectLoad]);

    // ── Command Palette registry ──
    const paletteCommands: PaletteCommand[] = [
        { id: 'compile', label: 'Build / Compile', shortcut: 'F5', action: () => { void handleCompile(); }, description: 'Compile sketch' },
        { id: 'build-chips', label: 'Build Custom Chips', shortcut: 'F6', action: () => { void handleBuildChips(); }, description: 'Compile custom chip sources to WASM' },
        { id: 'open-project-folder', label: 'Open Projects Folder', action: () => { void handleOpenProjectsFolder(); }, description: 'Load projects from a folder on disk' },
        { id: 'settings', label: 'Open Settings', shortcut: 'Ctrl+,', action: () => setSettingsOpen(true) },
        { id: 'new-project', label: 'New Project', action: () => setNewProjectOpen(true) },
        { id: 'toggle-editor', label: 'Toggle Code Editor', action: () => setEditorVisible(v => !v) },
        { id: 'toggle-simulator', label: 'Toggle Simulator', action: () => setSimulatorVisible(v => !v) },
        { id: 'toggle-sidebar', label: 'Toggle Explorer Sidebar', action: () => setSidebarVisible(v => !v) },
        { id: 'toggle-terminal', label: 'Toggle Terminal Panel', action: () => setTerminalVisible(v => !v) },
        {
            id: 'save-file',
            label: 'Save Active File',
            shortcut: 'Ctrl+S',
            action: () => {
                if (activeFile) void handleSaveFile(activeFile);
            }
        },
        { id: 'restore-file', label: 'Restore Active File', action: () => activeFile && handleRestoreFile(activeFile) },
        { id: 'export', label: 'Export Project', action: () => { void handleExport(); } },
        { id: 'import', label: 'Import Project', action: () => { void handleImport(); } },
        { id: 'add-file', label: 'Add File to Project', action: () => setAddingFile(true) },
        { id: 'clear-terminal', label: 'Clear Terminal Output', action: clearTerminalOutput },
        { id: 'toggle-theme', label: 'Toggle Light / Dark Theme', action: () => settings.updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' }) },
    ];

    return (
        <div className={[
            'flex flex-col h-screen bg-vscode-bg relative',
            'text-vscode-text w-full overflow-hidden font-sans',
            settings.theme === 'light' ? 'theme-light' : '',
        ].join(' ')}>
            {/* ── Titlebar ── */}
            <div
                className={
                    'flex items-center h-9 bg-vscode-bg '
                    + 'border-b border-vscode-border shrink-0 select-none'
                }
                style={
                    { WebkitAppRegion: 'drag' } as React.CSSProperties
                }
            >
                <div className={
                    'flex items-center gap-2 px-3 text-[13px] '
                    + 'text-vscode-text opacity-75 font-medium tracking-wide'
                }>
                    <span className="text-blue-400">⚡</span>
                    {' AVR8js Playground'}
                </div>
                <div className="flex-1" />
                <TitlebarButtons />
            </div>

            {/* ── Main Layout View ── */}
            <div className="flex flex-1 overflow-hidden">
                <ActivityRail
                    sidebarVisible={sidebarVisible}
                    editorVisible={editorVisible}
                    simulatorVisible={simulatorVisible}
                    theme={settings.theme}
                    onToggleSidebar={() => setSidebarVisible(v => !v)}
                    onToggleEditor={() => setEditorVisible(v => !v)}
                    onToggleSimulator={() => setSimulatorVisible(v => !v)}
                    onToggleTheme={() => settings.updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}
                    onOpenSettings={() => setSettingsOpen(true)}
                />

                <div className={
                    'flex flex-row flex-1 overflow-hidden w-full'
                }>
                    {/* Sidebar Pane */}
                    {sidebarVisible && (
                        <div
                            id="sidebar-pane"
                            className="flex flex-col h-full bg-vscode-sidebar"
                        >
                            <ProjectSidebar
                                files={files}
                                openEditorFiles={openEditorFiles
                                    .map((name) => files.find((file) => file.name === name))
                                    .filter((file): file is (typeof files)[number] => Boolean(file))}
                                activeFile={activeFile}
                                onFileSelect={openFileInEditor}
                                onCloseOpenEditor={closeOpenEditor}
                                sectionState={sidebarSectionState}
                                onSectionStateChange={setSidebarSectionState}
                                projects={projects}
                                currentProject={currentProjectName}
                                projectActivity={projectActivity}
                                projectActionsDisabled={Boolean(projectActivity)}
                                onProjectSelect={handleProjectSelect}
                                onCancelProjectOperation={cancelProjectOperations}
                                onNewProject={() => setNewProjectOpen(true)}
                                onOpenProjectsFolder={handleOpenProjectsFolder}
                                onResetToExamples={handleResetToExamples}
                                onRefreshProject={handleRefreshCurrentProject}
                                onExport={handleExport}
                                onImport={handleImport}
                            />
                        </div>
                    )}

                    {/* Content Pane */}
                    <div
                        id="content-pane"
                        className={[
                            'flex flex-row h-full',
                            'overflow-hidden bg-vscode-bg',
                            sidebarVisible ? '' : 'flex-1 w-full',
                        ].join(' ')}
                    >
                        {/* Editor Layout */}
                        {editorVisible && (
                            <div
                                id="editor-area-pane"
                                className={
                                    'flex flex-col h-full '
                                    + 'border-r border-vscode-border '
                                    + 'bg-vscode-bg'
                                }
                            >
                                <div
                                    id="code-pane"
                                    className={[
                                        'flex flex-col relative',
                                        'overflow-hidden bg-vscode-bg',
                                        terminalVisible ? '' : 'flex-1 h-full',
                                    ].join(' ')}
                                >
                                    <div className={
                                        'flex bg-vscode-sidebar '
                                        + 'border-b border-vscode-border '
                                        + 'shrink-0'
                                    }>
                                        {/* ── Scrollable tab list ── */}
                                        <div
                                            ref={tabStripRef}
                                            onScroll={(event) => setTabStripScrollLeft(event.currentTarget.scrollLeft)}
                                            className="flex overflow-x-auto no-scrollbar flex-1 scroll-smooth"
                                        >
                                            {openEditorFiles
                                                .map((name) => files.find((file) => file.name === name))
                                                .filter((file): file is (typeof files)[number] => Boolean(file))
                                                .map((file) => {
                                                const dirty = isFileDirty(file.name);
                                                return (
                                                    <div
                                                        key={file.name}
                                                        className={[
                                                            'flex items-center gap-1.5',
                                                            'pl-4 pr-2 py-2 text-[14px]',
                                                            'border-r border-vscode-border',
                                                            'transition-colors outline-none shrink-0',
                                                            activeFile === file.name
                                                                ? [
                                                                    'bg-vscode-bg',
                                                                    'text-vscode-textActive',
                                                                    'border-t border-t-blue-500',
                                                                ].join(' ')
                                                                : [
                                                                    'bg-vscode-tab',
                                                                    'text-vscode-text',
                                                                    'hover:bg-vscode-bg',
                                                                    'cursor-pointer',
                                                                ].join(' '),
                                                        ].join(' ')}
                                                    >
                                                        <button
                                                            type="button"
                                                            ref={(el) => {
                                                                tabButtonRefs.current[file.name] = el;
                                                            }}
                                                            onClick={() => openFileInEditor(file.name)}
                                                            className="flex items-center gap-1.5"
                                                        >
                                                            {file.name.endsWith('.json')
                                                                ? <FileJson size={14} className="text-yellow-400" />
                                                                : <FileCode2 size={14} className="text-blue-400" />}
                                                            <span>{file.name}</span>
                                                            {dirty && (
                                                                <span
                                                                    className="text-amber-400 leading-none"
                                                                    style={{ fontSize: 10 }}
                                                                    title="Unsaved changes"
                                                                >●</span>
                                                            )}
                                                        </button>
                                                        {openEditorFiles.length > 1 && (
                                                            <button
                                                                type="button"
                                                                onClick={() => closeOpenEditor(file.name)}
                                                                className="rounded p-0.5 text-vscode-text opacity-55 hover:opacity-100 hover:bg-vscode-hover"
                                                                title={`Close ${file.name}`}
                                                            >
                                                                <X size={12} />
                                                            </button>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {/* ── Per-file save / restore actions ── */}
                                        <div className="flex items-center gap-0.5 px-2 border-l border-vscode-border shrink-0">
                                            <button
                                                onClick={() => scrollTabStrip('left')}
                                                title="Scroll tabs left"
                                                className="flex items-center justify-center p-1.5 rounded text-vscode-text opacity-55 hover:opacity-100 hover:bg-vscode-hover transition-colors"
                                            >
                                                <ChevronLeft size={13} />
                                            </button>
                                            <button
                                                onClick={() => scrollTabStrip('right')}
                                                title="Scroll tabs right"
                                                className="flex items-center justify-center p-1.5 rounded text-vscode-text opacity-55 hover:opacity-100 hover:bg-vscode-hover transition-colors"
                                            >
                                                <ChevronRight size={13} />
                                            </button>
                                            {/* Add file button / inline input */}
                                            {addingFile ? (
                                                <input
                                                    autoFocus
                                                    value={newFileName}
                                                    onChange={e => setNewFileName(e.target.value)}
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter') handleAddFileCommit();
                                                        if (e.key === 'Escape') { setAddingFile(false); setNewFileName(''); }
                                                    }}
                                                    onBlur={handleAddFileCommit}
                                                    placeholder="filename.h"
                                                    className="bg-vscode-input border border-vscode-border text-[12px]
                                                        text-vscode-text px-2 py-0.5 rounded outline-none w-28"
                                                />
                                            ) : (
                                                <button
                                                    onClick={() => setAddingFile(true)}
                                                    title="Add new file to project"
                                                    className="flex items-center gap-1 px-2 py-1 rounded text-[12px]
                                                        text-vscode-text opacity-50 hover:opacity-100 hover:bg-vscode-hover transition-colors"
                                                >
                                                    <FilePlus2 size={13} />
                                                </button>
                                            )}
                                            <button
                                                onClick={() => activeFile && handleRestoreFile(activeFile)}
                                                disabled={!activeFileDirty}
                                                title="Restore — revert to last saved version (Discard changes)"
                                                className={[
                                                    'flex items-center justify-center p-1.5 rounded text-[12px]',
                                                    'transition-colors',
                                                    activeFileDirty
                                                        ? 'text-amber-400 hover:bg-vscode-hover hover:text-amber-300'
                                                        : 'text-vscode-text opacity-45 cursor-not-allowed',
                                                ].join(' ')}
                                            >
                                                <RotateCcw size={13} />
                                            </button>
                                            <button
                                                onClick={() => activeFile && handleSaveFile(activeFile)}
                                                disabled={!activeFileDirty || !projectPath}
                                                title={projectPath ? 'Save file to disk (Ctrl+S)' : 'No project path — cannot save'}
                                                className={[
                                                    'flex items-center justify-center p-1.5 rounded text-[12px]',
                                                    'transition-colors',
                                                    activeFileDirty && projectPath
                                                        ? 'text-blue-400 hover:bg-vscode-hover hover:text-blue-300'
                                                        : 'text-vscode-text opacity-45 cursor-not-allowed',
                                                ].join(' ')}
                                            >
                                                <Save size={13} />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex-1 relative overflow-hidden">
                                        {activeFileData && (
                                            editorBootReady
                                                ? (
                                                    <Suspense fallback={<div className="w-full h-full bg-vscode-bg" />}>
                                                        <Editor
                                                            fileKey={activeFileData.name}
                                                            code={activeFileData.content}
                                                            onChange={handleCodeChange}
                                                            language={
                                                                activeFileData.language
                                                            }
                                                            fontSize={settings.editorFontSize}
                                                            wordWrap={settings.wordWrap}
                                                            diagnostics={chipBuildDiagnostics[activeFileData.name] ?? []}
                                                            revealPosition={chipBuildJumpTarget?.fileName === activeFileData.name
                                                                ? {
                                                                    lineNumber: chipBuildJumpTarget.lineNumber,
                                                                    column: chipBuildJumpTarget.column,
                                                                    token: chipBuildJumpTarget.token,
                                                                }
                                                                : undefined}
                                                        />
                                                    </Suspense>
                                                )
                                                : <div className="w-full h-full bg-vscode-bg" />
                                        )}
                                    </div>
                                    {!terminalVisible && (
                                        <button
                                            onClick={() => setTerminalVisible(
                                                true,
                                            )}
                                            className={[
                                                'absolute bottom-4 right-6',
                                                'text-xs bg-vscode-sidebar',
                                                'border border-vscode-border',
                                                'text-vscode-text',
                                                'hover:text-vscode-textActive',
                                                'px-3 py-1.5 rounded-md',
                                                'shadow-lg flex items-center',
                                                'gap-2 font-semibold',
                                                'uppercase z-20',
                                            ].join(' ')}
                                        >
                                            <TerminalIcon size={14} />
                                            {' Show Terminal'}
                                        </button>
                                    )}
                                </div>

                                {terminalVisible && (
                                    <div id="terminal-pane">
                                        <SerialMonitor
                                            outputChunks={terminalChunks}
                                            chipOutput={chipConsoleOutput}
                                            selectedTab={terminalViewState.selectedTab}
                                            autoScroll={terminalViewState.autoScroll}
                                            showTimestamps={terminalViewState.showTimestamps}
                                            lineEnding={terminalViewState.lineEnding}
                                            scrollTop={terminalViewState.scrollTop}
                                            onTabChange={(selectedTab) => {
                                                setPersistedTerminalTab(selectedTab);
                                                setTerminalViewState((current) => ({ ...current, selectedTab }));
                                            }}
                                            onAutoScrollChange={(autoScroll) => setTerminalViewState((current) => ({ ...current, autoScroll }))}
                                            onShowTimestampsChange={(showTimestamps) => setTerminalViewState((current) => ({ ...current, showTimestamps }))}
                                            onLineEndingChange={(lineEnding) => setTerminalViewState((current) => ({ ...current, lineEnding }))}
                                            onScrollTopChange={(scrollTop) => setTerminalViewState((current) => ({ ...current, scrollTop }))}
                                            historyScrollTop={terminalViewState.historyScrollTop}
                                            onHistoryScrollTopChange={(historyScrollTop) => setTerminalViewState((current) => ({ ...current, historyScrollTop }))}
                                            diagnosticsScrollTop={terminalViewState.diagnosticsScrollTop}
                                            onDiagnosticsScrollTopChange={(diagnosticsScrollTop) => setTerminalViewState((current) => ({ ...current, diagnosticsScrollTop }))}
                                            diagnosticsSeverityFilter={diagnosticsFilterState.severityFilter}
                                            diagnosticsChipFilter={diagnosticsFilterState.chipFilter}
                                            onDiagnosticsSeverityFilterChange={(severityFilter) => setDiagnosticsFilterState((current) => ({ ...current, severityFilter }))}
                                            onDiagnosticsChipFilterChange={(chipFilter) => setDiagnosticsFilterState((current) => ({ ...current, chipFilter }))}
                                            diagnosticsExpandedIds={diagnosticsFilterState.expandedIds}
                                            onDiagnosticsExpandedIdsChange={(expandedIds) => setDiagnosticsFilterState((current) => ({ ...current, expandedIds }))}
                                            restoredLogWarning={restoredLogWarning}
                                            dismissedRestoredWarning={dismissedRestoredWarning}
                                            onDismissRestoredLogWarning={() => {
                                                const warningKey = restoredLogWarningKey ?? getRestoredLogWarningKey(restoredLogWarning);
                                                setDismissedRestoredWarningKey(warningKey);
                                                setDismissedRestoredWarning(restoredLogWarning);
                                                setRestoredLogWarning(null);
                                            }}
                                            onShowDismissedRestoredWarning={() => {
                                                setRestoredLogWarning(dismissedRestoredWarning);
                                            }}
                                            onOpenRestoredDiagnostics={() => {
                                                setPersistedTerminalTab('diagnostics');
                                                setTerminalViewState((current) => ({ ...current, selectedTab: 'diagnostics' }));
                                            }}
                                            onOpenRestoredHistory={() => {
                                                setPersistedTerminalTab('history');
                                                setTerminalViewState((current) => ({ ...current, selectedTab: 'history' }));
                                            }}
                                            serialTargetOptions={serialTargetOptions}
                                            selectedSerialTarget={selectedSerialTarget}
                                            onSelectedSerialTargetChange={(serialTarget) => setTerminalViewState((current) => ({ ...current, serialTarget }))}
                                            chipDiagnostics={chipDiagnostics}
                                            onOpenChipDiagnostic={openChipDiagnostic}
                                            onClearChipDiagnostics={() => {
                                                setDiagnosticsFilterState((current) => ({ ...current, expandedIds: [] }));
                                                clearChipDiagnostics();
                                            }}
                                            onSend={(text, serialTarget) => {
                                                if (serialWriteRef.current) {
                                                    const target = serialTarget ?? selectedSerialTarget;
                                                    serialWriteRef.current(text, target);
                                                    appendTerminalOutput(target === 'usart0' ? `> ${text}` : `> [${target}] ${text}`);
                                                }
                                            }}
                                            onClear={clearTerminalOutput}
                                            onClearChipOutput={clearChipConsoleOutput}
                                            onHide={() => setTerminalVisible(false)}
                                            compileHistory={compileHistory}
                                            compileHistoryExpandedIds={compileHistoryExpandedIds}
                                            onCompileHistoryExpandedIdsChange={setCompileHistoryExpandedIds}
                                            onClearHistory={() => {
                                                setCompileHistoryExpandedIds([]);
                                                clearCompileHistory();
                                            }}
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Simulator Layout */}
                        {simulatorVisible && (
                            <div
                                id="simulator-pane"
                                className={[
                                    'flex flex-col h-full',
                                    'bg-vscode-bg relative',
                                    editorVisible ? '' : 'flex-1 w-full',
                                ].join(' ')}
                            >
                                <Suspense fallback={<div className="w-full h-full bg-vscode-surface" />}>
                                    <WokwiSimulator
                                        diagram={diagram}
                                        hex={hex}
                                        customChipArtifacts={customChipArtifacts}
                                        customChipManifests={customChipManifests}
                                        isCompiling={isCompiling}
                                        onCompile={handleCompile}
                                        onSerialOutput={appendTerminalOutput}
                                        onChipOutput={appendChipConsoleOutput}
                                        onAddComponent={handleAddComponent}
                                        onDiagramChange={handleDiagramChange}
                                        serialWriteRef={serialWriteRef}
                                        onUndo={undo}
                                        onRedo={redo}
                                        canUndo={canUndo}
                                        canRedo={canRedo}
                                        defaultWireColor={settings.defaultWireColor}
                                        showPinTooltips={settings.showPinTooltips}
                                    />
                                </Suspense>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Settings Dialog ── */}
            {settingsOpen && (
                <Suspense fallback={null}>
                    <SettingsDialog onClose={() => setSettingsOpen(false)} />
                </Suspense>
            )}

            {/* ── Command Palette ── */}
            {paletteOpen && (
                <Suspense fallback={null}>
                    <CommandPalette
                        commands={paletteCommands}
                        onClose={() => setPaletteOpen(false)}
                    />
                </Suspense>
            )}

            {/* ── New Project Dialog ── */}
            {newProjectOpen && (
                <Suspense fallback={null}>
                    <NewProjectDialog
                        onConfirm={handleCreateProject}
                        onClose={() => setNewProjectOpen(false)}
                    />
                </Suspense>
            )}

            {settings.performanceMode && <PerformancePanel />}
        </div>
    );
}
