import {
    DEFAULT_UI_DIAGNOSTICS_SESSION_STATE,
    DEFAULT_UI_RESTORE_CONTEXT_SESSION_STATE,
    DEFAULT_UI_SIDEBAR_SECTIONS_STATE,
    DEFAULT_UI_TERMINAL_SESSION_STATE,
} from './ui-session';
import type { CompileHistoryEntry } from '../store/projectStore';
import type {
    UiProjectSessionState,
    UiDiagnosticsSessionState,
    UiRestoreContextSessionState,
    UiRestoredLogWarning,
    UiSidebarSectionsState,
    UiTerminalSessionState,
} from './ui-session';

const MAX_PERSISTED_TERMINAL_CHUNKS = 400;
const MAX_PERSISTED_TERMINAL_CHARS = 256 * 1024;
const MAX_PERSISTED_CHIP_OUTPUT_CHARS = 256 * 1024;
const MAX_PERSISTED_COMPILE_HISTORY_ENTRIES = 50;
const MAX_PERSISTED_COMPILE_OUTPUT_CHARS = 64 * 1024;

export interface AppSessionFileRecord {
    name: string;
}

export interface AppProjectSessionSnapshotInput {
    activeFile: string;
    openFiles: string[];
    sidebarSections: UiSidebarSectionsState;
    diagnostics: UiDiagnosticsSessionState;
    compileHistoryExpandedIds: string[];
    dismissedRestoredWarningKey: string | null;
    tabStripScrollLeft: number;
    terminal: UiTerminalSessionState;
    terminalOutputChunks: string[];
    chipOutput: string;
    compileHistory: CompileHistoryEntry[];
}

export interface RestoredAppProjectSession {
    openFiles: string[];
    activeFile: string | null;
    sidebarSections: UiSidebarSectionsState;
    diagnostics: UiDiagnosticsSessionState;
    restoreContext: UiRestoreContextSessionState;
    compileHistoryExpandedIds: string[];
    tabStripScrollLeft: number;
    terminal: UiTerminalSessionState;
    terminalOutputChunks: string[];
    chipOutput: string;
    compileHistory: CompileHistoryEntry[];
    dismissedRestoredWarning: UiRestoredLogWarning | null;
    restoredLogWarningKey: string | null;
    restoredLogWarning: UiRestoredLogWarning | null;
}

function trimTerminalChunksForSession(chunks: string[]): {
    chunks: string[];
    truncatedChunks: number;
    truncatedChars: number;
} {
    if (chunks.length === 0) {
        return { chunks: [], truncatedChunks: 0, truncatedChars: 0 };
    }

    const kept: string[] = [];
    let totalChars = 0;
    for (let index = chunks.length - 1; index >= 0; index--) {
        const chunk = chunks[index] ?? '';
        totalChars += chunk.length;
        kept.push(chunk);
        if (kept.length >= MAX_PERSISTED_TERMINAL_CHUNKS || totalChars >= MAX_PERSISTED_TERMINAL_CHARS) {
            break;
        }
    }

    kept.reverse();
    return {
        chunks: kept,
        truncatedChunks: chunks.length - kept.length,
        truncatedChars: Math.max(0, chunks.join('').length - kept.join('').length),
    };
}

function trimTextForSession(text: string, maxChars: number): { value: string; truncatedChars: number } {
    if (text.length <= maxChars) {
        return { value: text, truncatedChars: 0 };
    }
    return {
        value: text.slice(text.length - maxChars),
        truncatedChars: text.length - maxChars,
    };
}

function trimCompileHistoryForSession(history: CompileHistoryEntry[]): {
    history: CompileHistoryEntry[];
    truncatedEntries: number;
    truncatedChars: number;
} {
    let truncatedChars = 0;
    const truncatedEntries = Math.max(0, history.length - MAX_PERSISTED_COMPILE_HISTORY_ENTRIES);
    const trimmedHistory = history
        .slice(0, MAX_PERSISTED_COMPILE_HISTORY_ENTRIES)
        .map((entry) => {
            const trimmedOutput = trimTextForSession(entry.output, MAX_PERSISTED_COMPILE_OUTPUT_CHARS);
            truncatedChars += trimmedOutput.truncatedChars;
            return {
                ...entry,
                output: trimmedOutput.value,
            };
        });

    return { history: trimmedHistory, truncatedEntries, truncatedChars };
}

function toRestoredLogWarning(flags: UiRestoredLogWarning): UiRestoredLogWarning | null {
    return Object.keys(flags).length > 0 ? flags : null;
}

export function getRestoredLogWarningKey(warning: UiRestoredLogWarning | null): string | null {
    return warning ? JSON.stringify(warning) : null;
}

function resolveRestoreContext(input: {
    diagnostics: UiDiagnosticsSessionState;
    restoredLogWarning: UiRestoredLogWarning | null;
}): UiRestoreContextSessionState {
    const hasRelevantDiagnosticsFilter = input.diagnostics.severityFilter !== 'all' || input.diagnostics.chipFilter !== 'all';
    const hasRestoreAlert = input.restoredLogWarning !== null;

    if (hasRelevantDiagnosticsFilter || hasRestoreAlert) {
        return { preferredTerminalTab: 'diagnostics' };
    }

    return DEFAULT_UI_RESTORE_CONTEXT_SESSION_STATE;
}

export function buildProjectSessionSnapshot(input: AppProjectSessionSnapshotInput): UiProjectSessionState {
    const trimmedTerminal = trimTerminalChunksForSession(input.terminalOutputChunks);
    const trimmedChipOutput = trimTextForSession(input.chipOutput, MAX_PERSISTED_CHIP_OUTPUT_CHARS);
    const trimmedCompileHistory = trimCompileHistoryForSession(input.compileHistory);
    const restoredLogWarning = toRestoredLogWarning({
        ...(trimmedTerminal.truncatedChunks > 0
            ? {
                terminalOutput: {
                    truncatedChunks: trimmedTerminal.truncatedChunks,
                    truncatedChars: trimmedTerminal.truncatedChars,
                },
            }
            : {}),
        ...(trimmedChipOutput.truncatedChars > 0
            ? { chipOutput: { truncatedChars: trimmedChipOutput.truncatedChars } }
            : {}),
        ...(trimmedCompileHistory.truncatedEntries > 0 || trimmedCompileHistory.truncatedChars > 0
            ? {
                compileHistory: {
                    truncatedEntries: trimmedCompileHistory.truncatedEntries,
                    truncatedChars: trimmedCompileHistory.truncatedChars,
                },
            }
            : {}),
    });
    const restoreContext = resolveRestoreContext({
        diagnostics: input.diagnostics,
        restoredLogWarning,
    });

    return {
        activeFile: input.activeFile,
        openFiles: input.openFiles,
        sidebarSections: input.sidebarSections,
        diagnostics: input.diagnostics,
        ...(Object.keys(restoreContext).length > 0 ? { restoreContext } : {}),
        compileHistoryExpandedIds: input.compileHistoryExpandedIds.filter((id, index, items) => items.indexOf(id) === index),
        ...(input.dismissedRestoredWarningKey ? { dismissedRestoredWarningKey: input.dismissedRestoredWarningKey } : {}),
        tabStripScrollLeft: input.tabStripScrollLeft,
        terminal: input.terminal,
        terminalOutputChunks: trimmedTerminal.chunks,
        chipOutput: trimmedChipOutput.value,
        compileHistory: trimmedCompileHistory.history,
        ...(restoredLogWarning ? { restoredLogWarning } : {}),
    };
}

export function resolveProjectSessionRestore(
    projectSession: UiProjectSessionState | undefined,
    files: AppSessionFileRecord[],
): RestoredAppProjectSession {
    const availableFiles = new Set(files.map((file) => file.name));
    const diagnostics = projectSession?.diagnostics ?? DEFAULT_UI_DIAGNOSTICS_SESSION_STATE;
    const openFiles = projectSession?.openFiles?.filter((name) => availableFiles.has(name));
    const activeFile = projectSession?.activeFile && availableFiles.has(projectSession.activeFile)
        ? projectSession.activeFile
        : null;
    const restoredCompileHistory = projectSession?.compileHistory ?? [];
    const restoredCompileHistoryIds = new Set(restoredCompileHistory.map((entry) => entry.id));
    const restoredLogWarning = projectSession?.restoredLogWarning ?? null;
    const restoredLogWarningKey = getRestoredLogWarningKey(restoredLogWarning);
    const isDismissedRestoredWarning = restoredLogWarningKey !== null
        && projectSession?.dismissedRestoredWarningKey === restoredLogWarningKey;
    const dismissedRestoredWarning = isDismissedRestoredWarning ? restoredLogWarning : null;
    const visibleRestoredLogWarning = isDismissedRestoredWarning ? null : restoredLogWarning;
    const hasRelevantDiagnosticsFilter = diagnostics.severityFilter !== 'all' || diagnostics.chipFilter !== 'all';
    const restoreContext = projectSession?.restoreContext?.preferredTerminalTab === 'diagnostics'
        && !hasRelevantDiagnosticsFilter
        && visibleRestoredLogWarning === null
        ? DEFAULT_UI_RESTORE_CONTEXT_SESSION_STATE
        : projectSession?.restoreContext ?? DEFAULT_UI_RESTORE_CONTEXT_SESSION_STATE;

    return {
        openFiles: openFiles && openFiles.length > 0 ? openFiles : files.map((file) => file.name),
        activeFile,
        sidebarSections: projectSession?.sidebarSections ?? DEFAULT_UI_SIDEBAR_SECTIONS_STATE,
        diagnostics,
        restoreContext,
        compileHistoryExpandedIds: (projectSession?.compileHistoryExpandedIds ?? []).filter((id) => restoredCompileHistoryIds.has(id)),
        tabStripScrollLeft: projectSession?.tabStripScrollLeft ?? 0,
        terminal: {
            ...(projectSession?.terminal ?? DEFAULT_UI_TERMINAL_SESSION_STATE),
            selectedTab: restoreContext.preferredTerminalTab
                ?? projectSession?.terminal?.selectedTab
                ?? DEFAULT_UI_TERMINAL_SESSION_STATE.selectedTab,
        },
        terminalOutputChunks: projectSession?.terminalOutputChunks ?? [],
        chipOutput: projectSession?.chipOutput ?? '',
        compileHistory: restoredCompileHistory,
        dismissedRestoredWarning,
        restoredLogWarningKey,
        restoredLogWarning: visibleRestoredLogWarning,
    };
}
