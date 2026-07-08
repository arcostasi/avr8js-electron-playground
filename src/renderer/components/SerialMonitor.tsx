/**
 * SerialMonitor
 * Multi-tab bottom console panel ordered by workflow:
 *  - Monitor     — raw serial output, search filter, word-wrap, stable timestamps, and command history
 *  - Plotter     — real-time multi-channel numeric chart
 *  - Chips       — custom chip runtime logs with severity/tag styling and search
 *  - Diagnostics — build diagnostics filterable by severity, chip, and text
 *  - History     — compilation run history with status filtering and copyable logs
 */
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
    Copy, Check, Trash2, EyeOff, Send,
    Terminal as TerminalIcon, Clock, ArrowDownToLine, LineChart,
    History, Cpu, AlertTriangle, ChevronDown, ChevronRight,
    Search, WrapText, ChevronsUpDown, ChevronsDownUp, ArrowDown, X,
} from 'lucide-react';
import SerialPlotter from './SerialPlotter';
import { useProjectStore } from '../store/projectStore';
import type { CompileHistoryEntry } from '../store/projectStore';
import type { EditorDiagnostic } from '../types/editor-diagnostics';
import type { UiDiagnosticsSeverityFilter, UiRestoredLogWarning } from '../services/ui-session';

interface ChipDiagnosticItem {
    fileName: string;
    chipName: string;
    diagnostic: EditorDiagnostic;
}

interface SerialMonitorProps {
    outputChunks?: string[];
    chipOutput?: string;
    selectedTab: ExtendedTab;
    autoScroll: boolean;
    showTimestamps: boolean;
    lineEnding: string;
    scrollTop: number;
    historyScrollTop: number;
    diagnosticsScrollTop: number;
    onTabChange: (tab: ExtendedTab) => void;
    onAutoScrollChange: (value: boolean) => void;
    onShowTimestampsChange: (value: boolean) => void;
    onLineEndingChange: (value: string) => void;
    onScrollTopChange: (value: number) => void;
    onHistoryScrollTopChange: (value: number) => void;
    onDiagnosticsScrollTopChange: (value: number) => void;
    diagnosticsSeverityFilter: UiDiagnosticsSeverityFilter;
    diagnosticsChipFilter: string;
    onDiagnosticsSeverityFilterChange: (value: UiDiagnosticsSeverityFilter) => void;
    onDiagnosticsChipFilterChange: (value: string) => void;
    diagnosticsExpandedIds?: string[];
    onDiagnosticsExpandedIdsChange?: (ids: string[]) => void;
    restoredLogWarning?: UiRestoredLogWarning | null;
    dismissedRestoredWarning?: UiRestoredLogWarning | null;
    onDismissRestoredLogWarning?: () => void;
    onShowDismissedRestoredWarning?: () => void;
    onOpenRestoredDiagnostics?: () => void;
    onOpenRestoredHistory?: () => void;
    serialTargetOptions?: Array<{ value: string; label: string }>;
    selectedSerialTarget?: string;
    onSelectedSerialTargetChange?: (value: string) => void;
    onSend: (text: string, serialTarget?: string) => void;
    onClear: () => void;
    onClearChipOutput?: () => void;
    onHide: () => void;
    compileHistory?: CompileHistoryEntry[];
    compileHistoryExpandedIds?: string[];
    onCompileHistoryExpandedIdsChange?: (ids: string[]) => void;
    onClearHistory?: () => void;
    chipDiagnostics?: ChipDiagnosticItem[];
    onOpenChipDiagnostic?: (fileName: string, lineNumber: number, column: number) => void;
    onClearChipDiagnostics?: () => void;
}

const LINE_ENDINGS: { label: string; value: string }[] = [
    { label: 'NL',     value: '\n'   },
    { label: 'CR',     value: '\r'   },
    { label: 'NL+CR',  value: '\n\r' },
    { label: 'None',   value: ''     },
];

const MAX_COMMAND_HISTORY = 50;

type Tab = 'monitor' | 'plotter' | 'history';
type ExtendedTab = Tab | 'chips' | 'diagnostics';
type HistoryStatusFilter = 'all' | 'success' | 'failed';
type SeverityFilter = UiDiagnosticsSeverityFilter;

const severityRank: Record<EditorDiagnostic['severity'], number> = {
    error: 0,
    warning: 1,
    info: 2,
    hint: 3,
};

const severityClass: Record<EditorDiagnostic['severity'], string> = {
    error: 'text-red-400',
    warning: 'text-amber-300',
    info: 'text-blue-300',
    hint: 'text-vscode-text opacity-90',
};

function formatNowTime(): string {
    return new Date().toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
}

function diagnosticsEmptyState(
    chipDiagnostics: ChipDiagnosticItem[],
    filteredDiagnostics: ChipDiagnosticItem[],
): string {
    if (chipDiagnostics.length === 0) {
        return 'No chip build diagnostics.';
    }
    if (filteredDiagnostics.length === 0) {
        return 'No diagnostics for current filters.';
    }
    return '';
}

function severityFilterLabel(severity: EditorDiagnostic['severity']): string {
    if (severity === 'error') return 'Only errors';
    if (severity === 'warning') return 'Only warnings';
    if (severity === 'info') return 'Only info';
    return 'Only hints';
}

function getDiagnosticItemId(item: ChipDiagnosticItem): string {
    const d = item.diagnostic;
    return [
        item.chipName,
        item.fileName,
        d.severity,
        d.startLineNumber,
        d.startColumn,
        d.endLineNumber,
        d.endColumn,
        d.source ?? '',
        d.message,
    ].join('::');
}

function formatDiagnosticSummary(item: ChipDiagnosticItem): string {
    const d = item.diagnostic;
    return `[${d.severity.toUpperCase()}] ${item.chipName} ${item.fileName}:${d.startLineNumber}:${d.startColumn} - ${d.message}`;
}

function formatCount(value: number, singular: string, plural: string): string {
    return `${value} ${value === 1 ? singular : plural}`;
}

function buildRestoredWarningSummary(warning: UiRestoredLogWarning): string {
    const categories = [
        warning.terminalOutput ? 'terminal output' : null,
        warning.chipOutput ? 'chip console' : null,
        warning.compileHistory ? 'build history' : null,
    ].filter((value): value is string => Boolean(value));

    return `Restored session data was trimmed for ${categories.join(', ')}.`;
}

function buildRestoredWarningDetails(warning: UiRestoredLogWarning): string[] {
    const details: string[] = [];

    if (warning.terminalOutput) {
        const chunks = formatCount(warning.terminalOutput.truncatedChunks, 'chunk', 'chunks');
        const chars = formatCount(warning.terminalOutput.truncatedChars, 'character', 'characters');
        details.push(`Terminal output: ${chunks} and ${chars} were discarded.`);
    }
    if (warning.chipOutput) {
        details.push(`Chip console: ${formatCount(warning.chipOutput.truncatedChars, 'character', 'characters')} were discarded.`);
    }
    if (warning.compileHistory) {
        const segments = [`${formatCount(warning.compileHistory.truncatedChars, 'character', 'characters')} discarded from saved outputs`];
        if (warning.compileHistory.truncatedEntries > 0) {
            segments.unshift(`${formatCount(warning.compileHistory.truncatedEntries, 'entry', 'entries')} dropped`);
        }
        details.push(`Build history: ${segments.join(', ')}.`);
    }

    return details;
}

function syncLineTimestamps(prev: string[], lines: string[]): string[] {
    if (lines.length === 0) {
        return prev.length === 0 ? prev : [];
    }
    const base = lines.length < prev.length ? [] : prev;
    let changed = base !== prev || base.length !== lines.length;
    const nowStamp = formatNowTime();
    const next = base.slice(0, lines.length);

    for (let i = 0; i < lines.length; i++) {
        const hasContent = lines[i].trim() !== '';
        if (i >= next.length) {
            next.push(hasContent ? nowStamp : '');
            changed = true;
        } else if (hasContent && !next[i]) {
            next[i] = nowStamp;
            changed = true;
        } else if (!hasContent && next[i]) {
            next[i] = '';
            changed = true;
        }
    }

    return changed ? next : prev;
}

function classifyChipLine(line: string): { toneClass: string; chipTag: string | null; body: string } {
    const isError = /\b(error|err|fatal|fail(?:ed)?)\b/i.test(line);
    const isWarn = !isError && /\bwarn(?:ing)?\b/i.test(line);
    let toneClass = 'text-vscode-text';
    if (isError) toneClass = 'text-red-400';
    else if (isWarn) toneClass = 'text-amber-300';

    const tagMatch = /^(\[[^\]]+\])\s*(.*)$/.exec(line);
    if (tagMatch) {
        return { toneClass, chipTag: tagMatch[1], body: tagMatch[2] };
    }
    return { toneClass, chipTag: null, body: line };
}

const SerialMonitor = React.memo(function SerialMonitor({
    outputChunks, chipOutput = '',
    selectedTab, autoScroll, showTimestamps, lineEnding, scrollTop, historyScrollTop, diagnosticsScrollTop,
    onTabChange, onAutoScrollChange, onShowTimestampsChange, onLineEndingChange,
    onScrollTopChange, onHistoryScrollTopChange, onDiagnosticsScrollTopChange,
    diagnosticsSeverityFilter, diagnosticsChipFilter,
    onDiagnosticsSeverityFilterChange, onDiagnosticsChipFilterChange,
    diagnosticsExpandedIds = [], onDiagnosticsExpandedIdsChange,
    restoredLogWarning, dismissedRestoredWarning, onDismissRestoredLogWarning, onShowDismissedRestoredWarning,
    onOpenRestoredDiagnostics, onOpenRestoredHistory,
    serialTargetOptions = [], selectedSerialTarget = 'usart0', onSelectedSerialTargetChange,
    onSend, onClear, onClearChipOutput, onHide,
    compileHistory = [], compileHistoryExpandedIds = [], onCompileHistoryExpandedIdsChange, onClearHistory,
    chipDiagnostics = [], onOpenChipDiagnostic, onClearChipDiagnostics,
}: Readonly<SerialMonitorProps>) {
    const [input, setInput] = useState('');
    const [wordWrap, setWordWrap] = useState(true);
    const [monitorSearchOpen, setMonitorSearchOpen] = useState(false);
    const [monitorSearch, setMonitorSearch] = useState('');
    const [chipSearchOpen, setChipSearchOpen] = useState(false);
    const [chipSearch, setChipSearch] = useState('');
    const [diagnosticsSearch, setDiagnosticsSearch] = useState('');
    const [historyStatusFilter, setHistoryStatusFilter] = useState<HistoryStatusFilter>('all');
    const [copiedKey, setCopiedKey] = useState<string | null>(null);
    const [isAtBottom, setIsAtBottom] = useState(true);
    const [showRestoredLogDetails, setShowRestoredLogDetails] = useState(false);
    const [monitorLineStamps, setMonitorLineStamps] = useState<string[]>([]);
    const [chipLineStamps, setChipLineStamps] = useState<string[]>([]);

    const scrollRef = useRef<HTMLDivElement>(null);
    const copyTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
    const commandHistoryRef = useRef<string[]>([]);
    const historyCursorRef = useRef(-1);
    const draftInputRef = useRef('');

    const storeTerminalChunks = useProjectStore((state) => state.terminalChunks);
    const resolvedOutputChunks = outputChunks ?? storeTerminalChunks;
    const tab = selectedTab;
    const output = useMemo(
        () => (tab === 'monitor' || tab === 'plotter' ? resolvedOutputChunks.join('') : ''),
        [resolvedOutputChunks, tab],
    );

    const rawMonitorLines = useMemo(() => (output ? output.split('\n') : []), [output]);
    const rawChipLines = useMemo(() => (chipOutput ? chipOutput.split('\n') : []), [chipOutput]);

    useEffect(() => () => {
        if (copyTimerRef.current !== null) {
            globalThis.clearTimeout(copyTimerRef.current);
        }
    }, []);

    useEffect(() => {
        setMonitorLineStamps((prev) => syncLineTimestamps(prev, rawMonitorLines));
    }, [rawMonitorLines]);

    useEffect(() => {
        setChipLineStamps((prev) => syncLineTimestamps(prev, rawChipLines));
    }, [rawChipLines]);

    const triggerCopy = useCallback((key: string, text: string) => {
        if (!text) return;
        void navigator.clipboard.writeText(text);
        setCopiedKey(key);
        if (copyTimerRef.current !== null) {
            globalThis.clearTimeout(copyTimerRef.current);
        }
        copyTimerRef.current = globalThis.setTimeout(() => {
            setCopiedKey(null);
            copyTimerRef.current = null;
        }, 1500);
    }, []);

    const monitorEntries = useMemo(() => {
        return rawMonitorLines.map((line, index) => {
            const stamp = monitorLineStamps[index];
            const text = showTimestamps && stamp && line.trim() !== '' ? `[${stamp}] ${line}` : line;
            return { index, raw: line, text };
        });
    }, [monitorLineStamps, rawMonitorLines, showTimestamps]);

    const normalizedMonitorSearch = monitorSearch.trim().toLowerCase();
    const filteredMonitorEntries = useMemo(() => {
        if (!normalizedMonitorSearch) return monitorEntries;
        return monitorEntries.filter((entry) => entry.raw.toLowerCase().includes(normalizedMonitorSearch));
    }, [monitorEntries, normalizedMonitorSearch]);

    const monitorNonEmptyCount = useMemo(
        () => rawMonitorLines.filter((line) => line.trim() !== '').length,
        [rawMonitorLines],
    );

    const chipEntries = useMemo(() => {
        return rawChipLines.map((line, index) => {
            const stamp = chipLineStamps[index];
            return { index, raw: line, stamp: showTimestamps && stamp && line.trim() !== '' ? stamp : '' };
        });
    }, [chipLineStamps, rawChipLines, showTimestamps]);

    const normalizedChipSearch = chipSearch.trim().toLowerCase();
    const filteredChipEntries = useMemo(() => {
        if (!normalizedChipSearch) return chipEntries;
        return chipEntries.filter((entry) => entry.raw.toLowerCase().includes(normalizedChipSearch));
    }, [chipEntries, normalizedChipSearch]);

    const chipNonEmptyCount = useMemo(
        () => rawChipLines.filter((line) => line.trim() !== '').length,
        [rawChipLines],
    );

    const chipFilterOptions = useMemo(
        () => ['all', ...Array.from(new Set(chipDiagnostics.map((d) => d.chipName))).sort((left, right) => left.localeCompare(right))],
        [chipDiagnostics],
    );
    const chipFilter = chipFilterOptions.includes(diagnosticsChipFilter) ? diagnosticsChipFilter : 'all';
    const severityFilter: SeverityFilter = diagnosticsSeverityFilter;
    const normalizedDiagnosticsSearch = diagnosticsSearch.trim().toLowerCase();

    const diagnosticCounts = useMemo(() => {
        let errors = 0;
        let warnings = 0;
        for (const item of chipDiagnostics) {
            if (item.diagnostic.severity === 'error') errors += 1;
            else if (item.diagnostic.severity === 'warning') warnings += 1;
        }
        return { errors, warnings };
    }, [chipDiagnostics]);

    const filteredDiagnostics = useMemo(
        () => chipDiagnostics.filter((item) => {
            const severityOk = severityFilter === 'all' || item.diagnostic.severity === severityFilter;
            const chipOk = chipFilter === 'all' || item.chipName === chipFilter;
            if (!severityOk || !chipOk) return false;
            if (!normalizedDiagnosticsSearch) return true;
            const d = item.diagnostic;
            return (
                d.message.toLowerCase().includes(normalizedDiagnosticsSearch)
                || item.fileName.toLowerCase().includes(normalizedDiagnosticsSearch)
                || item.chipName.toLowerCase().includes(normalizedDiagnosticsSearch)
                || (d.source ?? '').toLowerCase().includes(normalizedDiagnosticsSearch)
            );
        }),
        [chipDiagnostics, chipFilter, normalizedDiagnosticsSearch, severityFilter],
    );

    const sortedDiagnostics = useMemo(
        () => [...filteredDiagnostics].sort((a, b) => {
            const sev = severityRank[a.diagnostic.severity] - severityRank[b.diagnostic.severity];
            if (sev !== 0) return sev;
            if (a.fileName !== b.fileName) return a.fileName.localeCompare(b.fileName);
            if (a.diagnostic.startLineNumber !== b.diagnostic.startLineNumber) {
                return a.diagnostic.startLineNumber - b.diagnostic.startLineNumber;
            }
            return a.diagnostic.startColumn - b.diagnostic.startColumn;
        }),
        [filteredDiagnostics],
    );

    const historyCounts = useMemo(() => {
        let success = 0;
        let failed = 0;
        for (const entry of compileHistory) {
            if (entry.success) success += 1;
            else failed += 1;
        }
        return { success, failed };
    }, [compileHistory]);

    const filteredHistory = useMemo(() => {
        if (historyStatusFilter === 'all') return compileHistory;
        return compileHistory.filter((entry) => (
            historyStatusFilter === 'success' ? entry.success : !entry.success
        ));
    }, [compileHistory, historyStatusFilter]);

    const serialTarget = serialTargetOptions.some((option) => option.value === selectedSerialTarget)
        ? selectedSerialTarget
        : serialTargetOptions[0]?.value ?? 'usart0';

    useEffect(() => {
        if (!restoredLogWarning) {
            setShowRestoredLogDetails(false);
        }
    }, [restoredLogWarning]);

    // Auto-scroll to bottom when output changes
    useEffect(() => {
        if ((tab === 'monitor' || tab === 'chips') && autoScroll && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            setIsAtBottom(true);
        }
    }, [resolvedOutputChunks, chipOutput, autoScroll, tab]);

    useEffect(() => {
        if (!scrollRef.current) return;
        if ((tab === 'monitor' || tab === 'chips') && autoScroll) return;
        let nextScrollTop = scrollTop;
        if (tab === 'history') {
            nextScrollTop = historyScrollTop;
        } else if (tab === 'diagnostics') {
            nextScrollTop = diagnosticsScrollTop;
        }
        scrollRef.current.scrollTop = nextScrollTop;
    }, [
        autoScroll,
        compileHistory.length,
        diagnosticsScrollTop,
        historyScrollTop,
        scrollTop,
        sortedDiagnostics.length,
        tab,
    ]);

    const handleScroll = useCallback(() => {
        const el = scrollRef.current;
        if (!el) return;
        if (tab === 'monitor' || tab === 'chips') {
            const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 24;
            setIsAtBottom(nearBottom);
        }
        if (tab === 'history') {
            onHistoryScrollTopChange(el.scrollTop);
            return;
        }
        if (tab === 'diagnostics') {
            onDiagnosticsScrollTopChange(el.scrollTop);
            return;
        }
        onScrollTopChange(el.scrollTop);
    }, [onDiagnosticsScrollTopChange, onHistoryScrollTopChange, onScrollTopChange, tab]);

    const jumpToBottom = useCallback(() => {
        const el = scrollRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
        setIsAtBottom(true);
    }, []);

    const handleSubmit = useCallback((e: React.SyntheticEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!input) return;
        const history = commandHistoryRef.current;
        if (history[history.length - 1] !== input) {
            const nextHistory = [...history, input];
            commandHistoryRef.current = nextHistory.length > MAX_COMMAND_HISTORY
                ? nextHistory.slice(nextHistory.length - MAX_COMMAND_HISTORY)
                : nextHistory;
        }
        historyCursorRef.current = -1;
        draftInputRef.current = '';
        onSend(input + lineEnding, serialTarget);
        setInput('');
    }, [input, lineEnding, onSend, serialTarget]);

    const handleInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
        const history = commandHistoryRef.current;
        if (history.length === 0) return;

        if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (historyCursorRef.current === -1) {
                draftInputRef.current = input;
                historyCursorRef.current = history.length - 1;
            } else {
                historyCursorRef.current = Math.max(0, historyCursorRef.current - 1);
            }
            setInput(history[historyCursorRef.current] ?? '');
            return;
        }

        if (e.key === 'ArrowDown' && historyCursorRef.current >= 0) {
            e.preventDefault();
            const nextCursor = historyCursorRef.current + 1;
            if (nextCursor >= history.length) {
                historyCursorRef.current = -1;
                setInput(draftInputRef.current);
            } else {
                historyCursorRef.current = nextCursor;
                setInput(history[nextCursor] ?? '');
            }
        }
    }, [input]);

    const diagnosticsMessage = diagnosticsEmptyState(chipDiagnostics, filteredDiagnostics);
    const expandedHistoryIds = new Set(compileHistoryExpandedIds);
    const expandedDiagnosticIds = new Set(diagnosticsExpandedIds);
    const hasDiagnosticsFilters = (
        severityFilter !== 'all'
        || chipFilter !== 'all'
        || normalizedDiagnosticsSearch !== ''
    );

    const updateExpandedHistoryIds = useCallback((entryId: string, nextExpanded: boolean) => {
        if (!onCompileHistoryExpandedIdsChange) return;

        const nextIds = nextExpanded
            ? [...compileHistoryExpandedIds, entryId].filter((id, index, items) => items.indexOf(id) === index)
            : compileHistoryExpandedIds.filter((id) => id !== entryId);
        onCompileHistoryExpandedIdsChange(nextIds);
    }, [compileHistoryExpandedIds, onCompileHistoryExpandedIdsChange]);

    const updateExpandedDiagnosticIds = useCallback((entryId: string, nextExpanded: boolean) => {
        if (!onDiagnosticsExpandedIdsChange) return;

        const nextIds = nextExpanded
            ? [...diagnosticsExpandedIds, entryId].filter((id, index, items) => items.indexOf(id) === index)
            : diagnosticsExpandedIds.filter((id) => id !== entryId);
        onDiagnosticsExpandedIdsChange(nextIds);
    }, [diagnosticsExpandedIds, onDiagnosticsExpandedIdsChange]);

    let diagnosticsBadgeTone = 'bg-vscode-input text-vscode-text opacity-75';
    if (diagnosticCounts.errors > 0) {
        diagnosticsBadgeTone = 'bg-red-500/20 text-red-300';
    } else if (diagnosticCounts.warnings > 0) {
        diagnosticsBadgeTone = 'bg-amber-500/20 text-amber-300';
    }

    const tabBtn = (
        id: ExtendedTab,
        icon: React.ReactNode,
        label: string,
        badge?: number,
        badgeToneClass = 'bg-vscode-input text-vscode-text opacity-75',
    ) => (
        <button
            type="button"
            onClick={() => onTabChange(id)}
            className={[
                'flex items-center gap-1 px-3 py-1.5 text-[12px]',
                'border-b-2 transition-colors shrink-0',
                tab === id
                    ? 'border-blue-500 text-blue-300'
                    : 'border-transparent text-vscode-text opacity-65 hover:opacity-100',
            ].join(' ')}
        >
            {icon}
            <span>{label}</span>
            {badge !== undefined && badge > 0 && (
                <span className={`ml-1 px-1.5 rounded-full text-[10px] ${badgeToneClass}`}>
                    {badge}
                </span>
            )}
        </button>
    );

    const monitorCopyText = filteredMonitorEntries.map((entry) => entry.text).join('\n');
    const chipCopyText = filteredChipEntries
        .map((entry) => (entry.stamp ? `[${entry.stamp}] ${entry.raw}` : entry.raw))
        .join('\n');
    const diagnosticsCopyText = sortedDiagnostics.map(formatDiagnosticSummary).join('\n');

    return (
        <div className="flex flex-col h-full bg-vscode-sidebar border-t border-vscode-border">
            {!restoredLogWarning && dismissedRestoredWarning && onShowDismissedRestoredWarning && (
                <div className="border-b border-vscode-border bg-vscode-hover/30 px-3 py-2 text-[11px] text-vscode-text opacity-80">
                    <div className="flex items-center gap-2">
                        <AlertTriangle size={12} className="shrink-0 opacity-70" />
                        <span className="flex-1">A restored-session warning is hidden for this project.</span>
                        <button
                            type="button"
                            onClick={onShowDismissedRestoredWarning}
                            className={[
                                'rounded border border-vscode-border px-2 py-1 text-[10px]',
                                'uppercase tracking-[0.14em] text-vscode-text hover:bg-vscode-hover',
                            ].join(' ')}
                        >
                            Show dismissed restore warning
                        </button>
                    </div>
                </div>
            )}
            {restoredLogWarning && (
                <div className="border-b border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                    <div className="flex items-center gap-2">
                        <AlertTriangle size={12} className="shrink-0" />
                        <button
                            type="button"
                            onClick={() => setShowRestoredLogDetails((current) => !current)}
                            className="flex flex-1 items-center gap-2 text-left hover:text-amber-100"
                            title="Show restored session details"
                        >
                            {showRestoredLogDetails
                                ? <ChevronDown size={12} className="shrink-0" />
                                : <ChevronRight size={12} className="shrink-0" />}
                            <span>{buildRestoredWarningSummary(restoredLogWarning)}</span>
                        </button>
                        {onDismissRestoredLogWarning && (
                            <button
                                type="button"
                                onClick={onDismissRestoredLogWarning}
                                className="rounded p-0.5 text-amber-100/80 hover:bg-amber-500/10 hover:text-amber-100"
                                title="Dismiss restored log warning"
                            >
                                <Trash2 size={12} />
                            </button>
                        )}
                    </div>
                    {showRestoredLogDetails && (
                        <div className="mt-2 rounded border border-amber-500/20 bg-black/10 px-3 py-2 text-[11px] leading-relaxed text-amber-100/90">
                            {buildRestoredWarningDetails(restoredLogWarning).map((detail) => (
                                <div key={detail}>{detail}</div>
                            ))}
                            <div className="mt-2 flex flex-wrap gap-2">
                                {(restoredLogWarning.terminalOutput || restoredLogWarning.chipOutput) && onOpenRestoredDiagnostics && (
                                    <button
                                        type="button"
                                        onClick={onOpenRestoredDiagnostics}
                                        className={[
                                            'rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1',
                                            'text-[10px] uppercase tracking-[0.14em] text-amber-100 hover:bg-amber-500/20',
                                        ].join(' ')}
                                    >
                                        Open Diagnostics
                                    </button>
                                )}
                                {restoredLogWarning.compileHistory && onOpenRestoredHistory && (
                                    <button
                                        type="button"
                                        onClick={onOpenRestoredHistory}
                                        className={[
                                            'rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1',
                                            'text-[10px] uppercase tracking-[0.14em] text-amber-100 hover:bg-amber-500/20',
                                        ].join(' ')}
                                    >
                                        Open History
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── Tab Bar: Telemetry (Monitor, Plotter, Chips) | Build (Diagnostics, History) ── */}
            <div className="flex items-center bg-vscode-sidebar border-b border-vscode-border shrink-0">
                <div className="flex items-end gap-0 overflow-x-auto no-scrollbar">
                    {tabBtn('monitor', <TerminalIcon size={13} />, 'Monitor')}
                    {tabBtn('plotter', <LineChart size={13} />, 'Plotter')}
                    {tabBtn('chips', <Cpu size={13} />, 'Chips', chipNonEmptyCount)}
                    <div className="w-px h-4 bg-vscode-border self-center mx-1 shrink-0" />
                    {tabBtn('diagnostics', <AlertTriangle size={13} />, 'Diagnostics', chipDiagnostics.length, diagnosticsBadgeTone)}
                    {tabBtn('history', <History size={13} />, 'History', compileHistory.length)}
                </div>
                <div className="flex-1" />

                {/* Monitor & Chips actions */}
                {(tab === 'monitor' || tab === 'chips') && (
                    <div className="flex items-center gap-0.5 px-2 shrink-0">
                        <button
                            type="button"
                            onClick={() => onShowTimestampsChange(!showTimestamps)}
                            title="Toggle timestamps"
                            className={[
                                'p-1 rounded text-[12px] flex items-center gap-1',
                                showTimestamps
                                    ? 'text-blue-400 bg-blue-500/10'
                                    : 'text-vscode-text opacity-65 hover:opacity-100',
                            ].join(' ')}
                        >
                            <Clock size={12} />
                        </button>

                        <button
                            type="button"
                            onClick={() => {
                                const next = !autoScroll;
                                onAutoScrollChange(next);
                                if (next) jumpToBottom();
                            }}
                            title="Toggle auto-scroll"
                            className={[
                                'p-1 rounded text-[12px] flex items-center gap-1',
                                autoScroll
                                    ? 'text-blue-400 bg-blue-500/10'
                                    : 'text-vscode-text opacity-65 hover:opacity-100',
                            ].join(' ')}
                        >
                            <ArrowDownToLine size={12} />
                        </button>

                        <button
                            type="button"
                            onClick={() => setWordWrap((prev) => !prev)}
                            title={wordWrap ? 'Disable word wrap' : 'Enable word wrap'}
                            className={[
                                'p-1 rounded text-[12px] flex items-center gap-1',
                                wordWrap
                                    ? 'text-blue-400 bg-blue-500/10'
                                    : 'text-vscode-text opacity-65 hover:opacity-100',
                            ].join(' ')}
                        >
                            <WrapText size={12} />
                        </button>

                        <button
                            type="button"
                            onClick={() => (
                                tab === 'monitor'
                                    ? setMonitorSearchOpen((prev) => !prev)
                                    : setChipSearchOpen((prev) => !prev)
                            )}
                            title="Filter output"
                            className={[
                                'p-1 rounded text-[12px] flex items-center gap-1',
                                (tab === 'monitor' ? monitorSearchOpen || Boolean(monitorSearch) : chipSearchOpen || Boolean(chipSearch))
                                    ? 'text-blue-400 bg-blue-500/10'
                                    : 'text-vscode-text opacity-65 hover:opacity-100',
                            ].join(' ')}
                        >
                            <Search size={12} />
                        </button>

                        {tab === 'monitor' && (
                            <select
                                value={lineEnding}
                                onChange={(e) => onLineEndingChange(e.target.value)}
                                title="Line ending"
                                className={[
                                    'bg-vscode-input text-[11px] text-vscode-text border',
                                    'border-vscode-border rounded px-1 py-0.5 outline-none cursor-pointer',
                                ].join(' ')}
                            >
                                {LINE_ENDINGS.map((le) => (
                                    <option key={le.label} value={le.value}>
                                        {le.label}
                                    </option>
                                ))}
                            </select>
                        )}

                        <button
                            type="button"
                            onClick={() => triggerCopy(
                                `tab-${tab}`,
                                tab === 'monitor' ? monitorCopyText : chipCopyText,
                            )}
                            title={copiedKey === `tab-${tab}` ? 'Copied!' : 'Copy output'}
                            className={[
                                'p-1 rounded flex items-center gap-1 text-[12px]',
                                copiedKey === `tab-${tab}`
                                    ? 'text-green-400 bg-green-500/10'
                                    : 'text-vscode-text opacity-65 hover:opacity-100',
                            ].join(' ')}
                        >
                            {copiedKey === `tab-${tab}` ? <Check size={12} /> : <Copy size={12} />}
                        </button>

                        <button
                            type="button"
                            onClick={tab === 'monitor' ? onClear : onClearChipOutput}
                            title="Clear"
                            className="text-vscode-text opacity-65 hover:opacity-100 p-1 flex items-center gap-1 text-[12px]"
                        >
                            <Trash2 size={12} />
                        </button>
                    </div>
                )}

                {tab === 'diagnostics' && (
                    <div className="flex items-center gap-0.5 px-2 shrink-0">
                        <button
                            type="button"
                            onClick={() => triggerCopy('diagnostics-all', diagnosticsCopyText)}
                            disabled={sortedDiagnostics.length === 0}
                            title={copiedKey === 'diagnostics-all' ? 'Copied diagnostics!' : 'Copy filtered diagnostics'}
                            className={[
                                'p-1 rounded text-[12px]',
                                sortedDiagnostics.length === 0
                                    ? 'text-vscode-text opacity-25 cursor-not-allowed'
                                    : copiedKey === 'diagnostics-all'
                                        ? 'text-green-400 bg-green-500/10'
                                        : 'text-vscode-text opacity-65 hover:opacity-100',
                            ].join(' ')}
                        >
                            {copiedKey === 'diagnostics-all' ? <Check size={12} /> : <Copy size={12} />}
                        </button>
                        {onClearChipDiagnostics && (
                            <button
                                type="button"
                                onClick={onClearChipDiagnostics}
                                title="Clear diagnostics"
                                className="text-vscode-text opacity-65 hover:opacity-100 p-1 text-[12px]"
                            >
                                <Trash2 size={12} />
                            </button>
                        )}
                    </div>
                )}

                {tab === 'history' && (
                    <div className="flex items-center gap-0.5 px-2 shrink-0">
                        {onCompileHistoryExpandedIdsChange && compileHistory.length > 0 && (
                            <>
                                <button
                                    type="button"
                                    onClick={() => onCompileHistoryExpandedIdsChange(compileHistory.map((e) => e.id))}
                                    title="Expand all entries"
                                    className="text-vscode-text opacity-65 hover:opacity-100 p-1 text-[12px]"
                                >
                                    <ChevronsUpDown size={12} />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onCompileHistoryExpandedIdsChange([])}
                                    title="Collapse all entries"
                                    className="text-vscode-text opacity-65 hover:opacity-100 p-1 text-[12px]"
                                >
                                    <ChevronsDownUp size={12} />
                                </button>
                            </>
                        )}
                        {onClearHistory && (
                            <button
                                type="button"
                                onClick={onClearHistory}
                                title="Clear history"
                                className="text-vscode-text opacity-65 hover:opacity-100 p-1 text-[12px]"
                            >
                                <Trash2 size={12} />
                            </button>
                        )}
                    </div>
                )}

                {/* Hide */}
                <div className="flex items-center px-2 border-l border-vscode-border shrink-0">
                    <button
                        type="button"
                        onClick={onHide}
                        title="Hide terminal"
                        className="text-vscode-text opacity-65 hover:opacity-100 p-1 flex items-center gap-1 text-[12px]"
                    >
                        <EyeOff size={12} />
                    </button>
                </div>
            </div>

            {/* ── Monitor Tab ── */}
            {tab === 'monitor' && (
                <>
                    {monitorSearchOpen && (
                        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-vscode-border bg-vscode-bg/40 shrink-0">
                            <Search size={12} className="text-vscode-text opacity-60 shrink-0" />
                            <input
                                autoFocus
                                value={monitorSearch}
                                onChange={(e) => setMonitorSearch(e.target.value)}
                                placeholder="Filter serial monitor..."
                                className={[
                                    'flex-1 bg-vscode-input border border-vscode-border rounded px-2 py-0.5',
                                    'text-[12px] font-mono text-vscode-textActive outline-none',
                                ].join(' ')}
                            />
                            <span className="text-[11px] text-vscode-text opacity-65 shrink-0">
                                {filteredMonitorEntries.filter((e) => e.raw.trim() !== '').length}/{monitorNonEmptyCount} lines
                            </span>
                            {monitorSearch && (
                                <button
                                    type="button"
                                    onClick={() => setMonitorSearch('')}
                                    title="Clear filter"
                                    className="p-0.5 rounded text-vscode-text opacity-65 hover:opacity-100 hover:bg-vscode-hover"
                                >
                                    <X size={12} />
                                </button>
                            )}
                        </div>
                    )}
                    <div className="relative flex-1 min-h-0 flex flex-col">
                        <div
                            ref={scrollRef}
                            onScroll={handleScroll}
                            className={[
                                'flex-1 overflow-y-auto p-3 text-[13px] font-mono text-vscode-text leading-relaxed',
                                wordWrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre overflow-x-auto',
                            ].join(' ')}
                        >
                            {filteredMonitorEntries.length > 0 && (output !== '' || normalizedMonitorSearch !== '') ? (
                                filteredMonitorEntries.map((entry) => (
                                    <div key={entry.index} className="min-h-[1.25em]">
                                        {entry.text}
                                    </div>
                                ))
                            ) : (
                                <span className="text-vscode-text opacity-40 italic">
                                    {normalizedMonitorSearch ? 'No matching lines…' : 'No output…'}
                                </span>
                            )}
                        </div>
                        {autoScroll && !isAtBottom && rawMonitorLines.length > 0 && (
                            <button
                                type="button"
                                onClick={jumpToBottom}
                                className={[
                                    'absolute bottom-2 right-4 z-10 flex items-center gap-1',
                                    'rounded-full border border-vscode-border bg-vscode-panel/95',
                                    'px-2.5 py-1 text-[11px] text-vscode-textActive shadow-lg hover:bg-vscode-hover',
                                ].join(' ')}
                            >
                                <ArrowDown size={11} />
                                <span>Jump to bottom</span>
                            </button>
                        )}
                    </div>

                    {/* Input Bar */}
                    <form
                        onSubmit={handleSubmit}
                        className="flex items-center border-t border-vscode-border px-2 py-1 gap-1.5 shrink-0"
                    >
                        {serialTargetOptions.length > 1 && (
                            <select
                                value={serialTarget}
                                onChange={(e) => onSelectedSerialTargetChange?.(e.target.value)}
                                title="Serial target"
                                className={[
                                    'bg-vscode-input text-[11px] text-vscode-text border',
                                    'border-vscode-border rounded px-1.5 py-1 outline-none cursor-pointer',
                                ].join(' ')}
                            >
                                {serialTargetOptions.map((option) => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        )}
                        <span className="text-[12px] text-vscode-text opacity-75 font-mono">&gt;</span>
                        <input
                            value={input}
                            onChange={(e) => {
                                historyCursorRef.current = -1;
                                setInput(e.target.value);
                            }}
                            onKeyDown={handleInputKeyDown}
                            placeholder={`Send to ${serialTarget.toUpperCase()}... (↑/↓ history)`}
                            className={[
                                'flex-1 bg-transparent text-[13px] font-mono text-vscode-textActive',
                                'outline-none placeholder:text-vscode-text placeholder:opacity-55',
                            ].join(' ')}
                        />
                        <span className="text-[10px] font-mono text-vscode-text opacity-45 shrink-0">
                            {monitorNonEmptyCount} lines
                        </span>
                        <button
                            type="submit"
                            className="text-vscode-text opacity-80 hover:text-vscode-textActive hover:opacity-100 p-1"
                            title="Send"
                        >
                            <Send size={13} />
                        </button>
                    </form>
                </>
            )}

            {/* ── Plotter Tab ── */}
            {tab === 'plotter' && <SerialPlotter output={output} />}

            {/* ── Chips Console Tab ── */}
            {tab === 'chips' && (
                <>
                    {chipSearchOpen && (
                        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-vscode-border bg-vscode-bg/40 shrink-0">
                            <Search size={12} className="text-vscode-text opacity-60 shrink-0" />
                            <input
                                autoFocus
                                value={chipSearch}
                                onChange={(e) => setChipSearch(e.target.value)}
                                placeholder="Filter chip logs..."
                                className={[
                                    'flex-1 bg-vscode-input border border-vscode-border rounded px-2 py-0.5',
                                    'text-[12px] font-mono text-vscode-textActive outline-none',
                                ].join(' ')}
                            />
                            <span className="text-[11px] text-vscode-text opacity-65 shrink-0">
                                {filteredChipEntries.filter((e) => e.raw.trim() !== '').length}/{chipNonEmptyCount} lines
                            </span>
                            {chipSearch && (
                                <button
                                    type="button"
                                    onClick={() => setChipSearch('')}
                                    title="Clear filter"
                                    className="p-0.5 rounded text-vscode-text opacity-65 hover:opacity-100 hover:bg-vscode-hover"
                                >
                                    <X size={12} />
                                </button>
                            )}
                        </div>
                    )}
                    <div className="relative flex-1 min-h-0 flex flex-col">
                        <div
                            ref={scrollRef}
                            onScroll={handleScroll}
                            className={[
                                'flex-1 overflow-y-auto p-3 text-[13px] font-mono leading-relaxed',
                                wordWrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre overflow-x-auto',
                            ].join(' ')}
                        >
                            {filteredChipEntries.length > 0 && (chipOutput !== '' || normalizedChipSearch !== '') ? (
                                filteredChipEntries.map((entry) => {
                                    const classified = classifyChipLine(entry.raw);
                                    return (
                                        <div key={entry.index} className={`min-h-[1.25em] ${classified.toneClass}`}>
                                            {entry.stamp && (
                                                <span className="mr-2 text-vscode-text opacity-50">
                                                    [{entry.stamp}]
                                                </span>
                                            )}
                                            {classified.chipTag && (
                                                <span className="mr-1.5 rounded bg-vscode-input px-1 py-0.5 text-[11px] text-sky-300">
                                                    {classified.chipTag}
                                                </span>
                                            )}
                                            <span>{classified.body}</span>
                                        </div>
                                    );
                                })
                            ) : (
                                <span className="text-vscode-text opacity-40 italic">
                                    {normalizedChipSearch ? 'No matching chip logs…' : 'No chip logs…'}
                                </span>
                            )}
                        </div>
                        {autoScroll && !isAtBottom && rawChipLines.length > 0 && (
                            <button
                                type="button"
                                onClick={jumpToBottom}
                                className={[
                                    'absolute bottom-2 right-4 z-10 flex items-center gap-1',
                                    'rounded-full border border-vscode-border bg-vscode-panel/95',
                                    'px-2.5 py-1 text-[11px] text-vscode-textActive shadow-lg hover:bg-vscode-hover',
                                ].join(' ')}
                            >
                                <ArrowDown size={11} />
                                <span>Jump to bottom</span>
                            </button>
                        )}
                    </div>
                </>
            )}

            {/* ── Diagnostics Tab ── */}
            {tab === 'diagnostics' && (
                <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
                    <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-vscode-border">
                        <label htmlFor="serial-monitor-diagnostics-severity" className="text-[11px] text-vscode-text opacity-80">
                            Severity
                        </label>
                        <select
                            id="serial-monitor-diagnostics-severity"
                            value={severityFilter}
                            onChange={(e) => onDiagnosticsSeverityFilterChange(e.target.value as SeverityFilter)}
                            className={[
                                'bg-vscode-input text-[11px] text-vscode-text border',
                                'border-vscode-border rounded px-1.5 py-0.5 outline-none cursor-pointer',
                            ].join(' ')}
                        >
                            <option value="all">All</option>
                            <option value="error">Error</option>
                            <option value="warning">Warning</option>
                            <option value="info">Info</option>
                            <option value="hint">Hint</option>
                        </select>

                        <label htmlFor="serial-monitor-diagnostics-chip" className="text-[11px] text-vscode-text opacity-80 ml-1">
                            Chip
                        </label>
                        <select
                            id="serial-monitor-diagnostics-chip"
                            value={chipFilter}
                            onChange={(e) => onDiagnosticsChipFilterChange(e.target.value)}
                            className={[
                                'bg-vscode-input text-[11px] text-vscode-text border',
                                'border-vscode-border rounded px-1.5 py-0.5 outline-none cursor-pointer',
                            ].join(' ')}
                        >
                            {chipFilterOptions.map((option) => (
                                <option key={option} value={option}>
                                    {option === 'all' ? 'All' : option}
                                </option>
                            ))}
                        </select>

                        <div className="flex items-center gap-1 flex-1 min-w-[140px]">
                            <Search size={11} className="text-vscode-text opacity-55 shrink-0" />
                            <input
                                value={diagnosticsSearch}
                                onChange={(e) => setDiagnosticsSearch(e.target.value)}
                                placeholder="Search diagnostics..."
                                className={[
                                    'w-full bg-vscode-input border border-vscode-border rounded px-2 py-0.5',
                                    'text-[11px] text-vscode-text outline-none',
                                ].join(' ')}
                            />
                        </div>

                        {diagnosticCounts.errors > 0 && (
                            <button
                                type="button"
                                onClick={() => onDiagnosticsSeverityFilterChange(severityFilter === 'error' ? 'all' : 'error')}
                                className={[
                                    'text-[10px] px-1.5 py-0.5 rounded border transition-colors',
                                    severityFilter === 'error'
                                        ? 'border-red-400 bg-red-500/20 text-red-200'
                                        : 'border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20',
                                ].join(' ')}
                            >
                                {formatCount(diagnosticCounts.errors, 'error', 'errors')}
                            </button>
                        )}
                        {diagnosticCounts.warnings > 0 && (
                            <button
                                type="button"
                                onClick={() => onDiagnosticsSeverityFilterChange(severityFilter === 'warning' ? 'all' : 'warning')}
                                className={[
                                    'text-[10px] px-1.5 py-0.5 rounded border transition-colors',
                                    severityFilter === 'warning'
                                        ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                                        : 'border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20',
                                ].join(' ')}
                            >
                                {formatCount(diagnosticCounts.warnings, 'warning', 'warnings')}
                            </button>
                        )}

                        {hasDiagnosticsFilters && (
                            <button
                                type="button"
                                onClick={() => {
                                    onDiagnosticsSeverityFilterChange('all');
                                    onDiagnosticsChipFilterChange('all');
                                    setDiagnosticsSearch('');
                                }}
                                className="text-[10px] px-1.5 py-0.5 rounded border border-vscode-border text-vscode-text opacity-75 hover:opacity-100 hover:bg-vscode-hover"
                            >
                                Reset
                            </button>
                        )}

                        <span className="ml-auto text-[11px] text-vscode-text opacity-60 shrink-0">
                            {filteredDiagnostics.length}/{chipDiagnostics.length}
                        </span>
                    </div>

                    {diagnosticsMessage ? (
                        <p className="p-6 text-center text-vscode-text opacity-60 text-[13px] italic">
                            {diagnosticsMessage}
                        </p>
                    ) : (
                        sortedDiagnostics.map((item) => {
                            const d = item.diagnostic;
                            const sev = d.severity.toUpperCase();
                            const itemId = getDiagnosticItemId(item);
                            const isExpanded = expandedDiagnosticIds.has(itemId);
                            const diagCopyKey = `diag-${itemId}`;
                            return (
                                <div key={itemId} className="border-b border-vscode-border px-3 py-2">
                                    <div className="flex items-start gap-2 text-[11px] mb-0.5">
                                        <button
                                            type="button"
                                            onClick={() => updateExpandedDiagnosticIds(itemId, !isExpanded)}
                                            className="mt-0.5 rounded p-0.5 text-vscode-text opacity-65 hover:bg-vscode-hover hover:opacity-100"
                                            title={isExpanded ? 'Collapse diagnostic details' : 'Expand diagnostic details'}
                                        >
                                            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => onOpenChipDiagnostic?.(
                                                item.fileName,
                                                d.startLineNumber,
                                                d.startColumn,
                                            )}
                                            className="flex-1 min-w-0 flex items-center gap-2 text-left hover:opacity-90"
                                            title="Open diagnostic location"
                                        >
                                            <span className={severityClass[d.severity]}>{sev}</span>
                                            <span className="text-vscode-text opacity-80">{item.chipName}</span>
                                            <span className="text-vscode-text opacity-40">•</span>
                                            <span className="text-vscode-text opacity-70 truncate">
                                                {item.fileName}:{d.startLineNumber}:{d.startColumn}
                                            </span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => onDiagnosticsChipFilterChange(item.chipName)}
                                            className={[
                                                'text-[10px] px-1.5 py-0.5 rounded border border-vscode-border',
                                                'text-vscode-text opacity-70 hover:opacity-100 hover:bg-vscode-hover',
                                            ].join(' ')}
                                            title="Only this chip"
                                        >
                                            Only this chip
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => onDiagnosticsSeverityFilterChange(d.severity)}
                                            className={[
                                                'text-[10px] px-1.5 py-0.5 rounded border border-vscode-border',
                                                'text-vscode-text opacity-70 hover:opacity-100 hover:bg-vscode-hover',
                                            ].join(' ')}
                                            title={`Only ${d.severity} diagnostics`}
                                        >
                                            {severityFilterLabel(d.severity)}
                                        </button>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => onOpenChipDiagnostic?.(
                                            item.fileName,
                                            d.startLineNumber,
                                            d.startColumn,
                                        )}
                                        className="w-full pl-6 text-left text-[12px] text-vscode-text opacity-90 font-mono whitespace-pre-wrap hover:opacity-100"
                                        title="Open diagnostic location"
                                    >
                                        {d.message}
                                    </button>
                                    {isExpanded && (
                                        <div className="mt-2 ml-6 rounded border border-vscode-border bg-vscode-codeBg px-3 py-2 text-[11px] text-vscode-text opacity-85">
                                            <div className="font-mono whitespace-pre-wrap text-[12px] opacity-95">{d.message}</div>
                                            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 opacity-70">
                                                <span>{item.fileName}:{d.startLineNumber}:{d.startColumn}</span>
                                                <span>End {d.endLineNumber}:{d.endColumn}</span>
                                                <span>Chip {item.chipName}</span>
                                                {d.source && <span>Source {d.source}</span>}
                                            </div>
                                            <div className="mt-2 flex flex-wrap gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => onOpenChipDiagnostic?.(
                                                        item.fileName,
                                                        d.startLineNumber,
                                                        d.startColumn,
                                                    )}
                                                    className={[
                                                        'rounded border border-vscode-border px-2 py-1 text-[10px]',
                                                        'uppercase tracking-[0.14em] text-vscode-text hover:bg-vscode-hover',
                                                    ].join(' ')}
                                                >
                                                    Open location
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => onDiagnosticsChipFilterChange(item.chipName)}
                                                    className={[
                                                        'rounded border border-vscode-border px-2 py-1 text-[10px]',
                                                        'uppercase tracking-[0.14em] text-vscode-text hover:bg-vscode-hover',
                                                    ].join(' ')}
                                                >
                                                    Filter chip
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => triggerCopy(diagCopyKey, formatDiagnosticSummary(item))}
                                                    className={[
                                                        'rounded border border-vscode-border px-2 py-1 text-[10px]',
                                                        'uppercase tracking-[0.14em] hover:bg-vscode-hover flex items-center gap-1',
                                                        copiedKey === diagCopyKey ? 'text-green-400' : 'text-vscode-text',
                                                    ].join(' ')}
                                                >
                                                    {copiedKey === diagCopyKey ? <Check size={10} /> : <Copy size={10} />}
                                                    <span>{copiedKey === diagCopyKey ? 'Copied' : 'Copy'}</span>
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            )}

            {/* ── History Tab ── */}
            {tab === 'history' && (
                <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
                    {compileHistory.length > 0 && (
                        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-vscode-border text-[11px]">
                            {(
                                [
                                    { id: 'all', label: `All (${compileHistory.length})` },
                                    { id: 'success', label: `Success (${historyCounts.success})` },
                                    { id: 'failed', label: `Failed (${historyCounts.failed})` },
                                ] as Array<{ id: HistoryStatusFilter; label: string }>
                            ).map((pill) => (
                                <button
                                    key={pill.id}
                                    type="button"
                                    onClick={() => setHistoryStatusFilter(pill.id)}
                                    className={[
                                        'px-2 py-0.5 rounded border transition-colors',
                                        historyStatusFilter === pill.id
                                            ? 'border-blue-500/60 bg-blue-500/15 text-blue-300'
                                            : 'border-vscode-border text-vscode-text opacity-70 hover:opacity-100 hover:bg-vscode-hover',
                                    ].join(' ')}
                                >
                                    {pill.label}
                                </button>
                            ))}
                        </div>
                    )}
                    {filteredHistory.length === 0 ? (
                        <p className="p-6 text-center text-vscode-text opacity-60 text-[13px] italic">
                            {compileHistory.length === 0
                                ? 'No compilation history yet. Hit Build to get started.'
                                : 'No builds matching selected status.'}
                        </p>
                    ) : (
                        filteredHistory.map((entry) => {
                            const historyCopyKey = `hist-${entry.id}`;
                            return (
                                <details
                                    key={entry.id}
                                    open={expandedHistoryIds.has(entry.id)}
                                    onToggle={(event) => updateExpandedHistoryIds(entry.id, event.currentTarget.open)}
                                    className="border-b border-vscode-border group"
                                >
                                    <summary className={[
                                        'flex items-center gap-2 px-3 py-2 cursor-pointer',
                                        'text-[12px] list-none select-none',
                                        'hover:bg-vscode-hover',
                                    ].join(' ')}>
                                        <span className={[
                                            'w-2 h-2 rounded-full shrink-0',
                                            entry.success ? 'bg-green-500' : 'bg-red-500',
                                        ].join(' ')} />
                                        <span className={entry.success ? 'text-green-400' : 'text-red-400'}>
                                            {entry.success ? 'Success' : 'Failed'}
                                        </span>
                                        <span className="text-vscode-text opacity-55">-</span>
                                        <span className="text-vscode-text opacity-85 font-medium truncate flex-1">
                                            {entry.projectName}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={(event) => {
                                                event.preventDefault();
                                                event.stopPropagation();
                                                triggerCopy(historyCopyKey, entry.output || '(no output)');
                                            }}
                                            title={copiedKey === historyCopyKey ? 'Log copied!' : 'Copy build output'}
                                            className={[
                                                'p-1 rounded shrink-0 transition-colors',
                                                copiedKey === historyCopyKey
                                                    ? 'text-green-400 bg-green-500/10'
                                                    : 'text-vscode-text opacity-55 hover:opacity-100 hover:bg-vscode-input',
                                            ].join(' ')}
                                        >
                                            {copiedKey === historyCopyKey ? <Check size={11} /> : <Copy size={11} />}
                                        </button>
                                        <span className="text-vscode-text opacity-65 shrink-0">
                                            {new Date(entry.timestamp).toLocaleTimeString()}
                                        </span>
                                        <span className="text-vscode-text opacity-65 shrink-0">
                                            {(entry.durationMs / 1000).toFixed(1)}s
                                        </span>
                                    </summary>
                                    <pre className={[
                                        'bg-vscode-codeBg px-4 py-2 text-[11px] font-mono',
                                        'text-vscode-text opacity-70 whitespace-pre-wrap',
                                        'overflow-x-auto max-h-48 overflow-y-auto',
                                    ].join(' ')}>
                                        {entry.output || '(no output)'}
                                    </pre>
                                </details>
                            );
                        })
                    )}
                </div>
            )}
        </div>
    );
});

export default SerialMonitor;
