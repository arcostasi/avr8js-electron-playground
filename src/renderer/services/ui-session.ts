import type { CompileHistoryEntry } from '../store/projectStore';
import { readPersistedJson, writePersistedJson } from './renderer-persist';

export interface UiLayoutState {
    sidebarVisible: boolean;
    editorVisible: boolean;
    terminalVisible: boolean;
    simulatorVisible: boolean;
    sidebarContentSizes: [number, number];
    editorSimulatorSizes: [number, number];
    codeTerminalSizes: [number, number];
}

export interface UiProjectSessionState {
    activeFile?: string;
    openFiles?: string[];
    sidebarSections?: UiSidebarSectionsState;
    diagnostics?: UiDiagnosticsSessionState;
    restoreContext?: UiRestoreContextSessionState;
    compileHistoryExpandedIds?: string[];
    dismissedRestoredWarningKey?: string;
    tabStripScrollLeft?: number;
    terminal?: UiTerminalSessionState;
    terminalOutputChunks?: string[];
    chipOutput?: string;
    compileHistory?: CompileHistoryEntry[];
    restoredLogWarning?: UiRestoredLogWarning;
}

export interface UiSidebarSectionsState {
    projectsOpen: boolean;
    editorsOpen: boolean;
    explorerOpen: boolean;
}

export type UiDiagnosticsSeverityFilter = 'all' | 'error' | 'warning' | 'info' | 'hint';

export interface UiDiagnosticsSessionState {
    severityFilter: UiDiagnosticsSeverityFilter;
    chipFilter: string;
    expandedIds: string[];
}

export interface UiRestoredLogWarning {
    terminalOutput?: {
        truncatedChunks: number;
        truncatedChars: number;
    };
    chipOutput?: {
        truncatedChars: number;
    };
    compileHistory?: {
        truncatedEntries: number;
        truncatedChars: number;
    };
}

export interface UiRestoreContextSessionState {
    preferredTerminalTab?: UiTerminalTab;
}

export type UiTerminalTab = 'monitor' | 'plotter' | 'history' | 'chips' | 'diagnostics';

export interface UiTerminalSessionState {
    selectedTab: UiTerminalTab;
    serialTarget: string;
    autoScroll: boolean;
    showTimestamps: boolean;
    lineEnding: string;
    scrollTop: number;
    historyScrollTop: number;
    diagnosticsScrollTop: number;
}

export interface UiSessionState {
    version: 1;
    layout: UiLayoutState;
    projects: Record<string, UiProjectSessionState>;
}

const UI_SESSION_SCOPE = 'ui-session';
const UI_SESSION_FILE = 'state-v1.json';

export const DEFAULT_UI_LAYOUT_STATE: UiLayoutState = {
    sidebarVisible: true,
    editorVisible: true,
    terminalVisible: true,
    simulatorVisible: true,
    sidebarContentSizes: [18, 82],
    editorSimulatorSizes: [45, 55],
    codeTerminalSizes: [75, 25],
};

export const DEFAULT_UI_TERMINAL_SESSION_STATE: UiTerminalSessionState = {
    selectedTab: 'monitor',
    serialTarget: 'usart0',
    autoScroll: true,
    showTimestamps: false,
    lineEnding: '\n',
    scrollTop: 0,
    historyScrollTop: 0,
    diagnosticsScrollTop: 0,
};

export const DEFAULT_UI_SIDEBAR_SECTIONS_STATE: UiSidebarSectionsState = {
    projectsOpen: true,
    editorsOpen: true,
    explorerOpen: true,
};

export const DEFAULT_UI_DIAGNOSTICS_SESSION_STATE: UiDiagnosticsSessionState = {
    severityFilter: 'all',
    chipFilter: 'all',
    expandedIds: [],
};

export const DEFAULT_UI_RESTORE_CONTEXT_SESSION_STATE: UiRestoreContextSessionState = {};

const DEFAULT_UI_SESSION_STATE: UiSessionState = {
    version: 1,
    layout: DEFAULT_UI_LAYOUT_STATE,
    projects: {},
};

let sessionCache: UiSessionState | null = null;
let sessionLoadPromise: Promise<UiSessionState> | null = null;
let sessionWriteChain: Promise<void> = Promise.resolve();
const MAX_PERSISTED_TERMINAL_CHUNKS = 400;
const MAX_PERSISTED_TERMINAL_CHARS = 256 * 1024;
const MAX_PERSISTED_CHIP_OUTPUT_CHARS = 256 * 1024;
const MAX_PERSISTED_COMPILE_HISTORY_ENTRIES = 50;
const MAX_PERSISTED_COMPILE_OUTPUT_CHARS = 64 * 1024;

function toPair(value: unknown, fallback: [number, number]): [number, number] {
    if (!Array.isArray(value) || value.length !== 2) return fallback;
    const left = Number(value[0]);
    const right = Number(value[1]);
    if (!Number.isFinite(left) || !Number.isFinite(right)) return fallback;
    return [left, right];
}

function sanitizeStringArray(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) return undefined;

    const seen = new Set<string>();
    const items: string[] = [];
    for (const entry of value) {
        if (typeof entry !== 'string' || entry.length === 0 || seen.has(entry)) continue;
        seen.add(entry);
        items.push(entry);
    }

    return items.length > 0 ? items : undefined;
}

function sanitizeTerminalOutputChunks(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) return undefined;

    const rawChunks = value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
    if (rawChunks.length === 0) return undefined;

    const kept: string[] = [];
    let totalChars = 0;
    for (let index = rawChunks.length - 1; index >= 0; index--) {
        const chunk = rawChunks[index];
        totalChars += chunk.length;
        kept.push(chunk);
        if (kept.length >= MAX_PERSISTED_TERMINAL_CHUNKS || totalChars >= MAX_PERSISTED_TERMINAL_CHARS) {
            break;
        }
    }

    kept.reverse();
    return kept;
}

function sanitizePersistedText(value: unknown, maxChars: number): string | undefined {
    if (typeof value !== 'string' || value.length === 0) return undefined;
    if (value.length <= maxChars) return value;
    return value.slice(value.length - maxChars);
}

function sanitizeCompileHistory(value: unknown): CompileHistoryEntry[] | undefined {
    if (!Array.isArray(value)) return undefined;

    const entries = value
        .filter((entry): entry is Partial<CompileHistoryEntry> => Boolean(entry) && typeof entry === 'object')
        .map((entry) => {
            if (typeof entry.id !== 'string') return null;
            if (typeof entry.timestamp !== 'number' || !Number.isFinite(entry.timestamp)) return null;
            if (typeof entry.success !== 'boolean') return null;
            if (typeof entry.durationMs !== 'number' || !Number.isFinite(entry.durationMs)) return null;

            return {
                id: entry.id,
                timestamp: entry.timestamp,
                success: entry.success,
                durationMs: entry.durationMs,
                output: sanitizePersistedText(entry.output, MAX_PERSISTED_COMPILE_OUTPUT_CHARS) ?? '',
                projectName: typeof entry.projectName === 'string' ? entry.projectName : '(unnamed)',
            } satisfies CompileHistoryEntry;
        })
        .filter((entry): entry is CompileHistoryEntry => entry !== null)
        .slice(0, MAX_PERSISTED_COMPILE_HISTORY_ENTRIES);

    return entries.length > 0 ? entries : undefined;
}

function parsePositiveNumber(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseNonNegativeNumber(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function asProjectSessionState(value: unknown): Partial<UiProjectSessionState> | null {
    return value && typeof value === 'object'
        ? value as Partial<UiProjectSessionState>
        : null;
}

function sanitizeOptionalString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
}

function sanitizeOptionalNonNegativeNumber(value: unknown): number | undefined {
    const parsed = parseNonNegativeNumber(value);
    return parsed ?? undefined;
}

function sanitizeTerminalWarning(value: unknown): UiRestoredLogWarning['terminalOutput'] | undefined {
    if (!value || typeof value !== 'object') return undefined;

    const parsed = value as { truncatedChunks?: unknown; truncatedChars?: unknown };
    const truncatedChunks = parsePositiveNumber(parsed.truncatedChunks);
    const truncatedChars = parsePositiveNumber(parsed.truncatedChars);
    if (truncatedChunks === null || truncatedChars === null) return undefined;

    return { truncatedChunks, truncatedChars };
}

function sanitizeChipOutputWarning(value: unknown): UiRestoredLogWarning['chipOutput'] | undefined {
    if (!value || typeof value !== 'object') return undefined;

    const parsed = value as { truncatedChars?: unknown };
    const truncatedChars = parsePositiveNumber(parsed.truncatedChars);
    return truncatedChars === null ? undefined : { truncatedChars };
}

function sanitizeCompileHistoryWarning(value: unknown): UiRestoredLogWarning['compileHistory'] | undefined {
    if (!value || typeof value !== 'object') return undefined;

    const parsed = value as { truncatedEntries?: unknown; truncatedChars?: unknown };
    const truncatedEntries = parseNonNegativeNumber(parsed.truncatedEntries);
    const truncatedChars = parsePositiveNumber(parsed.truncatedChars);

    if (truncatedEntries !== null && truncatedChars !== null) {
        return { truncatedEntries, truncatedChars };
    }

    if (truncatedEntries !== null && truncatedEntries > 0) {
        return { truncatedEntries, truncatedChars: 0 };
    }

    return undefined;
}

function sanitizeRestoredLogWarning(value: unknown): UiRestoredLogWarning | undefined {
    if (!value || typeof value !== 'object') return undefined;

    const parsed = value as Partial<UiRestoredLogWarning>;
    const warning: UiRestoredLogWarning = {};

    const terminalOutput = sanitizeTerminalWarning(parsed.terminalOutput);
    const chipOutput = sanitizeChipOutputWarning(parsed.chipOutput);
    const compileHistory = sanitizeCompileHistoryWarning(parsed.compileHistory);

    if (terminalOutput) warning.terminalOutput = terminalOutput;
    if (chipOutput) warning.chipOutput = chipOutput;
    if (compileHistory) warning.compileHistory = compileHistory;

    return Object.keys(warning).length > 0 ? warning : undefined;
}

function sanitizeSidebarSections(value: unknown): UiSidebarSectionsState | undefined {
    if (!value || typeof value !== 'object') return undefined;

    const parsed = value as Partial<UiSidebarSectionsState>;
    return {
        projectsOpen: typeof parsed.projectsOpen === 'boolean'
            ? parsed.projectsOpen
            : DEFAULT_UI_SIDEBAR_SECTIONS_STATE.projectsOpen,
        editorsOpen: typeof parsed.editorsOpen === 'boolean'
            ? parsed.editorsOpen
            : DEFAULT_UI_SIDEBAR_SECTIONS_STATE.editorsOpen,
        explorerOpen: typeof parsed.explorerOpen === 'boolean'
            ? parsed.explorerOpen
            : DEFAULT_UI_SIDEBAR_SECTIONS_STATE.explorerOpen,
    };
}

function sanitizeDiagnosticsSession(value: unknown): UiDiagnosticsSessionState | undefined {
    if (!value || typeof value !== 'object') return undefined;

    const parsed = value as Partial<UiDiagnosticsSessionState>;
    const severityFilter = parsed.severityFilter;
    const validSeverity = severityFilter === 'all'
        || severityFilter === 'error'
        || severityFilter === 'warning'
        || severityFilter === 'info'
        || severityFilter === 'hint';

    return {
        severityFilter: validSeverity
            ? severityFilter
            : DEFAULT_UI_DIAGNOSTICS_SESSION_STATE.severityFilter,
        chipFilter: typeof parsed.chipFilter === 'string' && parsed.chipFilter.trim().length > 0
            ? parsed.chipFilter
            : DEFAULT_UI_DIAGNOSTICS_SESSION_STATE.chipFilter,
        expandedIds: sanitizeStringArray(parsed.expandedIds) ?? DEFAULT_UI_DIAGNOSTICS_SESSION_STATE.expandedIds,
    };
}

function sanitizeRestoreContextSession(value: unknown): UiRestoreContextSessionState | undefined {
    if (!value || typeof value !== 'object') return undefined;

    const parsed = value as Partial<UiRestoreContextSessionState>;
    const preferredTerminalTab = parsed.preferredTerminalTab;
    const validPreferredTab = preferredTerminalTab === 'monitor'
        || preferredTerminalTab === 'plotter'
        || preferredTerminalTab === 'history'
        || preferredTerminalTab === 'chips'
        || preferredTerminalTab === 'diagnostics';

    return validPreferredTab ? { preferredTerminalTab } : undefined;
}

function sanitizeTerminalState(value: unknown): UiTerminalSessionState {
    if (!value || typeof value !== 'object') {
        return { ...DEFAULT_UI_TERMINAL_SESSION_STATE };
    }

    const parsed = value as Partial<UiTerminalSessionState>;
    const selectedTab = parsed.selectedTab;
    const validTab = selectedTab === 'monitor'
        || selectedTab === 'plotter'
        || selectedTab === 'history'
        || selectedTab === 'chips'
        || selectedTab === 'diagnostics';

    return {
        selectedTab: validTab ? selectedTab : DEFAULT_UI_TERMINAL_SESSION_STATE.selectedTab,
        serialTarget: typeof parsed.serialTarget === 'string' && parsed.serialTarget.length > 0
            ? parsed.serialTarget
            : DEFAULT_UI_TERMINAL_SESSION_STATE.serialTarget,
        autoScroll: typeof parsed.autoScroll === 'boolean' ? parsed.autoScroll : DEFAULT_UI_TERMINAL_SESSION_STATE.autoScroll,
        showTimestamps: typeof parsed.showTimestamps === 'boolean' ? parsed.showTimestamps : DEFAULT_UI_TERMINAL_SESSION_STATE.showTimestamps,
        lineEnding: typeof parsed.lineEnding === 'string' ? parsed.lineEnding : DEFAULT_UI_TERMINAL_SESSION_STATE.lineEnding,
        scrollTop: typeof parsed.scrollTop === 'number' && Number.isFinite(parsed.scrollTop) && parsed.scrollTop >= 0
            ? parsed.scrollTop
            : DEFAULT_UI_TERMINAL_SESSION_STATE.scrollTop,
        historyScrollTop: typeof parsed.historyScrollTop === 'number' && Number.isFinite(parsed.historyScrollTop) && parsed.historyScrollTop >= 0
            ? parsed.historyScrollTop
            : DEFAULT_UI_TERMINAL_SESSION_STATE.historyScrollTop,
        diagnosticsScrollTop: typeof parsed.diagnosticsScrollTop === 'number' && Number.isFinite(parsed.diagnosticsScrollTop) && parsed.diagnosticsScrollTop >= 0
            ? parsed.diagnosticsScrollTop
            : DEFAULT_UI_TERMINAL_SESSION_STATE.diagnosticsScrollTop,
    };
}

function sanitizeProjectSessionState(project: unknown): UiProjectSessionState {
    const projectState = asProjectSessionState(project);
    const activeFile = sanitizeOptionalString(projectState?.activeFile);
    const openFiles = sanitizeStringArray(projectState?.openFiles);
    const sidebarSections = sanitizeSidebarSections(projectState?.sidebarSections);
    const diagnostics = sanitizeDiagnosticsSession(projectState?.diagnostics);
    const restoreContext = sanitizeRestoreContextSession(projectState?.restoreContext);
    const compileHistoryExpandedIds = sanitizeStringArray(projectState?.compileHistoryExpandedIds);
    const dismissedRestoredWarningKey = sanitizeOptionalString(projectState?.dismissedRestoredWarningKey);
    const tabStripScrollLeft = sanitizeOptionalNonNegativeNumber(projectState?.tabStripScrollLeft);
    const terminal = sanitizeTerminalState(projectState?.terminal);
    const terminalOutputChunks = sanitizeTerminalOutputChunks(projectState?.terminalOutputChunks);
    const chipOutput = sanitizePersistedText(projectState?.chipOutput, MAX_PERSISTED_CHIP_OUTPUT_CHARS);
    const compileHistory = sanitizeCompileHistory(projectState?.compileHistory);
    const restoredLogWarning = sanitizeRestoredLogWarning(projectState?.restoredLogWarning);

    return {
        ...(activeFile ? { activeFile } : {}),
        ...(openFiles ? { openFiles } : {}),
        ...(sidebarSections ? { sidebarSections } : {}),
        ...(diagnostics ? { diagnostics } : {}),
        ...(restoreContext ? { restoreContext } : {}),
        ...(compileHistoryExpandedIds ? { compileHistoryExpandedIds } : {}),
        ...(dismissedRestoredWarningKey ? { dismissedRestoredWarningKey } : {}),
        ...(typeof tabStripScrollLeft === 'number' ? { tabStripScrollLeft } : {}),
        terminal,
        ...(terminalOutputChunks ? { terminalOutputChunks } : {}),
        ...(chipOutput ? { chipOutput } : {}),
        ...(compileHistory ? { compileHistory } : {}),
        ...(restoredLogWarning ? { restoredLogWarning } : {}),
    } satisfies UiProjectSessionState;
}

function sanitizeUiSessionState(value: unknown): UiSessionState {
    if (!value || typeof value !== 'object') {
        return structuredClone(DEFAULT_UI_SESSION_STATE);
    }

    const parsed = value as Partial<UiSessionState> & { layout?: Partial<UiLayoutState> };
    const layout: Partial<UiLayoutState> = parsed.layout && typeof parsed.layout === 'object'
        ? parsed.layout
        : {};
    const projects = parsed.projects && typeof parsed.projects === 'object' ? parsed.projects : {};

    return {
        version: 1,
        layout: {
            sidebarVisible: typeof layout.sidebarVisible === 'boolean' ? layout.sidebarVisible : DEFAULT_UI_LAYOUT_STATE.sidebarVisible,
            editorVisible: typeof layout.editorVisible === 'boolean' ? layout.editorVisible : DEFAULT_UI_LAYOUT_STATE.editorVisible,
            terminalVisible: typeof layout.terminalVisible === 'boolean' ? layout.terminalVisible : DEFAULT_UI_LAYOUT_STATE.terminalVisible,
            simulatorVisible: typeof layout.simulatorVisible === 'boolean' ? layout.simulatorVisible : DEFAULT_UI_LAYOUT_STATE.simulatorVisible,
            sidebarContentSizes: toPair(layout.sidebarContentSizes, DEFAULT_UI_LAYOUT_STATE.sidebarContentSizes),
            editorSimulatorSizes: toPair(layout.editorSimulatorSizes, DEFAULT_UI_LAYOUT_STATE.editorSimulatorSizes),
            codeTerminalSizes: toPair(layout.codeTerminalSizes, DEFAULT_UI_LAYOUT_STATE.codeTerminalSizes),
        },
        projects: Object.fromEntries(
            Object.entries(projects).map(([key, project]) => [key, sanitizeProjectSessionState(project)]),
        ),
    };
}

export function normalizeProjectSessionKey(projectPath: string): string {
    return projectPath.trim().split('\\').join('/').toLowerCase();
}

export async function readUiSession(): Promise<UiSessionState> {
    sessionLoadPromise ??= (async () => {
        const persisted = await readPersistedJson<UiSessionState>(UI_SESSION_SCOPE, UI_SESSION_FILE, DEFAULT_UI_SESSION_STATE);
        const sanitized = sanitizeUiSessionState(persisted);
        sessionCache = sanitized;
        return sanitized;
    })();

    return sessionLoadPromise;
}

export async function updateUiSession(mutator: (draft: UiSessionState) => void): Promise<UiSessionState> {
    const nextState = structuredClone(await readUiSession());
    mutator(nextState);
    const sanitized = sanitizeUiSessionState(nextState);
    sessionCache = sanitized;
    sessionLoadPromise = Promise.resolve(sanitized);
    sessionWriteChain = sessionWriteChain.then(async () => {
        await writePersistedJson(UI_SESSION_SCOPE, UI_SESSION_FILE, sanitized);
    });
    await sessionWriteChain;
    return sanitized;
}

export function getCachedUiSession(): UiSessionState | null {
    return sessionCache;
}

export function resetUiSessionForTests(): void {
    sessionCache = null;
    sessionLoadPromise = null;
    sessionWriteChain = Promise.resolve();
}