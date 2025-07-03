/**
 * SerialMonitor
 * Enhanced terminal panel with 3 tabs:
 *  - Monitor  — raw serial output with send capability
 *  - Plotter  — real-time numeric chart
 *  - History  — compilation run history
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    Copy, Trash2, EyeOff, Send,
    Terminal as TerminalIcon,
    Clock, ArrowDownToLine, LineChart, History, Cpu, AlertTriangle, ChevronDown, ChevronRight,
} from 'lucide-react';
import SerialPlotter from './SerialPlotter';
import type { CompileHistoryEntry } from '../store/projectStore';
import type { EditorDiagnostic } from '../types/editor-diagnostics';
import type { UiDiagnosticsSeverityFilter, UiRestoredLogWarning } from '../services/ui-session';

interface ChipDiagnosticItem {
    fileName: string;
    chipName: string;
    diagnostic: EditorDiagnostic;
}

interface SerialMonitorProps {
    outputChunks: string[];
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
    onSend: (text: string) => void;
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

type Tab = 'monitor' | 'plotter' | 'history';
type ExtendedTab = Tab | 'chips' | 'diagnostics';

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

type SeverityFilter = UiDiagnosticsSeverityFilter;

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
        details.push(`Terminal output: ${formatCount(warning.terminalOutput.truncatedChunks, 'chunk', 'chunks')} and ${formatCount(warning.terminalOutput.truncatedChars, 'character', 'characters')} were discarded.`);
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

export default function SerialMonitor({
    outputChunks, chipOutput = '',
    selectedTab, autoScroll, showTimestamps, lineEnding, scrollTop, historyScrollTop, diagnosticsScrollTop,
    onTabChange, onAutoScrollChange, onShowTimestampsChange, onLineEndingChange, onScrollTopChange, onHistoryScrollTopChange, onDiagnosticsScrollTopChange,
    diagnosticsSeverityFilter, diagnosticsChipFilter,
    onDiagnosticsSeverityFilterChange, onDiagnosticsChipFilterChange,
    diagnosticsExpandedIds = [], onDiagnosticsExpandedIdsChange,
    restoredLogWarning, dismissedRestoredWarning, onDismissRestoredLogWarning, onShowDismissedRestoredWarning,
    onOpenRestoredDiagnostics, onOpenRestoredHistory,
    onSend, onClear, onClearChipOutput, onHide,
    compileHistory = [], compileHistoryExpandedIds = [], onCompileHistoryExpandedIdsChange, onClearHistory,
    chipDiagnostics = [], onOpenChipDiagnostic, onClearChipDiagnostics,
}: Readonly<SerialMonitorProps>) {
    const [input, setInput] = useState('');
    const [showRestoredLogDetails, setShowRestoredLogDetails] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const output = outputChunks.join('');

    const chipFilterOptions = ['all', ...Array.from(new Set(chipDiagnostics.map((d) => d.chipName))).sort((left, right) => left.localeCompare(right))];
    const chipFilter = chipFilterOptions.includes(diagnosticsChipFilter) ? diagnosticsChipFilter : 'all';
    const severityFilter: SeverityFilter = diagnosticsSeverityFilter;
    const filteredDiagnostics = chipDiagnostics.filter((item) => {
        const severityOk = severityFilter === 'all' || item.diagnostic.severity === severityFilter;
        const chipOk = chipFilter === 'all' || item.chipName === chipFilter;
        return severityOk && chipOk;
    });
    const sortedDiagnostics = [...filteredDiagnostics].sort((a, b) => {
        const sev = severityRank[a.diagnostic.severity] - severityRank[b.diagnostic.severity];
        if (sev !== 0) return sev;
        if (a.fileName !== b.fileName) return a.fileName.localeCompare(b.fileName);
        if (a.diagnostic.startLineNumber !== b.diagnostic.startLineNumber) {
            return a.diagnostic.startLineNumber - b.diagnostic.startLineNumber;
        }
        return a.diagnostic.startColumn - b.diagnostic.startColumn;
    });
    const tab = selectedTab;

    useEffect(() => {
        if (!restoredLogWarning) {
            setShowRestoredLogDetails(false);
        }
    }, [restoredLogWarning]);

    // Auto-scroll to bottom when output changes
    useEffect(() => {
        if ((tab === 'monitor' || tab === 'chips') && autoScroll && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [outputChunks, chipOutput, autoScroll, tab]);

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
    }, [autoScroll, compileHistory.length, diagnosticsScrollTop, historyScrollTop, scrollTop, sortedDiagnostics.length, tab]);

    const handleScroll = useCallback(() => {
        if (!scrollRef.current) return;
        if (tab === 'history') {
            onHistoryScrollTopChange(scrollRef.current.scrollTop);
            return;
        }
        if (tab === 'diagnostics') {
            onDiagnosticsScrollTopChange(scrollRef.current.scrollTop);
            return;
        }
        onScrollTopChange(scrollRef.current.scrollTop);
    }, [onDiagnosticsScrollTopChange, onHistoryScrollTopChange, onScrollTopChange, tab]);

    const handleSubmit = useCallback((e: React.SyntheticEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!input) return;
        onSend(input + lineEnding);
        setInput('');
    }, [input, lineEnding, onSend]);

    // Format output with optional timestamps
    const formattedOutput = showTimestamps
        ? output.split('\n').map((line) => {
            if (line.trim() === '') return line;
            const ts = new Date().toLocaleTimeString('en-US', {
                hour12: false,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
            });
            return `[${ts}] ${line}`;
        }).join('\n')
        : output;
    const diagnosticsMessage = diagnosticsEmptyState(chipDiagnostics, filteredDiagnostics);
    const expandedHistoryIds = new Set(compileHistoryExpandedIds);
    const expandedDiagnosticIds = new Set(diagnosticsExpandedIds);

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

    const tabBtn = (id: ExtendedTab, icon: React.ReactNode, label: string, badge?: number) => (
        <button
            onClick={() => onTabChange(id)}
            className={[
                'flex items-center gap-1 px-3 py-1.5 text-[12px]',
                'border-b-2 transition-colors',
                tab === id
                    ? 'border-blue-500 text-blue-300'
                    : 'border-transparent text-vscode-text opacity-65 hover:opacity-100',
            ].join(' ')}
        >
            {icon}
            {label}
            {badge !== undefined && badge > 0 && (
                <span className="ml-1 px-1.5 rounded-full bg-vscode-input text-vscode-text opacity-70 text-[10px]">
                    {badge}
                </span>
            )}
        </button>
    );

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
                            className="rounded border border-vscode-border px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-vscode-text hover:bg-vscode-hover"
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
                            {showRestoredLogDetails ? <ChevronDown size={12} className="shrink-0" /> : <ChevronRight size={12} className="shrink-0" />}
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
                                        className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-amber-100 hover:bg-amber-500/20"
                                    >
                                        Open Diagnostics
                                    </button>
                                )}
                                {restoredLogWarning.compileHistory && onOpenRestoredHistory && (
                                    <button
                                        type="button"
                                        onClick={onOpenRestoredHistory}
                                        className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-amber-100 hover:bg-amber-500/20"
                                    >
                                        Open History
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
            {/* ── Tab Bar ── */}
            <div className="flex bg-vscode-sidebar border-b border-vscode-border shrink-0">
                <div className="flex items-end gap-0">
                    {tabBtn('monitor', <TerminalIcon size={13} />, 'Monitor')}
                    {tabBtn('chips', <Cpu size={13} />, 'Chips', chipOutput ? chipOutput.split('\n').filter(Boolean).length : 0)}
                    {tabBtn('diagnostics', <AlertTriangle size={13} />, 'Diagnostics', chipDiagnostics.length)}
                    {tabBtn('plotter', <LineChart size={13} />, 'Plotter')}
                    {tabBtn('history', <History size={13} />, 'History', compileHistory.length)}
                </div>
                <div className="flex-1" />

                {/* Shared actions */}
                {(tab === 'monitor' || tab === 'chips') && (
                    <div className="flex items-center gap-0.5 px-2">
                        {/* Timestamp toggle */}
                        <button
                            onClick={() => onShowTimestampsChange(!showTimestamps)}
                            title="Toggle timestamps"
                            className={`p-1 rounded text-[12px] flex items-center gap-1
                                ${showTimestamps
                                    ? 'text-blue-400 bg-blue-500/10'
                                    : 'text-vscode-text opacity-65 hover:opacity-100'
                                }`}
                        >
                            <Clock size={12} />
                        </button>

                        {/* Auto-scroll toggle */}
                        <button
                            onClick={() => onAutoScrollChange(!autoScroll)}
                            title="Toggle auto-scroll"
                            className={`p-1 rounded text-[12px] flex items-center gap-1
                                ${autoScroll
                                    ? 'text-blue-400 bg-blue-500/10'
                                    : 'text-vscode-text opacity-65 hover:opacity-100'
                                }`}
                        >
                            <ArrowDownToLine size={12} />
                        </button>

                        {/* Line ending selector */}
                        <select
                            value={lineEnding}
                            onChange={(e) => onLineEndingChange(e.target.value)}
                            title="Line ending"
                            className="bg-vscode-input text-[11px] text-vscode-text border
                                border-vscode-border rounded px-1 py-0.5 outline-none
                                cursor-pointer"
                        >
                            {LINE_ENDINGS.map(le => (
                                <option key={le.label} value={le.value}>
                                    {le.label}
                                </option>
                            ))}
                        </select>

                        {/* Copy */}
                        <button
                            onClick={() => navigator.clipboard.writeText(tab === 'monitor' ? output : chipOutput)}
                            title="Copy output"
                            className="text-vscode-text opacity-65 hover:opacity-100 p-1
                                flex items-center gap-1 text-[12px]"
                        >
                            <Copy size={12} />
                        </button>

                        {/* Clear */}
                        <button
                            onClick={tab === 'monitor' ? onClear : onClearChipOutput}
                            title="Clear"
                            className="text-vscode-text opacity-65 hover:opacity-100 p-1
                                flex items-center gap-1 text-[12px]"
                        >
                            <Trash2 size={12} />
                        </button>
                    </div>
                )}

                {tab === 'history' && onClearHistory && (
                    <div className="flex items-center px-2">
                        <button
                            onClick={onClearHistory}
                            title="Clear history"
                            className="text-vscode-text opacity-65 hover:opacity-100 p-1 text-[12px]"
                        >
                            <Trash2 size={12} />
                        </button>
                    </div>
                )}

                {tab === 'diagnostics' && onClearChipDiagnostics && (
                    <div className="flex items-center px-2">
                        <button
                            onClick={onClearChipDiagnostics}
                            title="Clear diagnostics"
                            className="text-vscode-text opacity-65 hover:opacity-100 p-1 text-[12px]"
                        >
                            <Trash2 size={12} />
                        </button>
                    </div>
                )}

                {/* Hide */}
                <div className="flex items-center px-2 border-l border-vscode-border">
                    <button
                        onClick={onHide}
                        title="Hide terminal"
                        className="text-vscode-text opacity-65 hover:opacity-100 p-1
                            flex items-center gap-1 text-[12px]"
                    >
                        <EyeOff size={12} />
                    </button>
                </div>
            </div>

            {/* ── Monitor Tab ── */}
            {tab === 'monitor' && (
                <>
                    <div
                        ref={scrollRef}
                        onScroll={handleScroll}
                        className="flex-1 overflow-y-auto p-3 text-[13px]
                            font-mono text-vscode-text whitespace-pre-wrap leading-relaxed"
                    >
                        {formattedOutput || (
                            <span className="text-vscode-text opacity-40 italic">No output…</span>
                        )}
                    </div>

                    {/* Input Bar */}
                    <form
                        onSubmit={handleSubmit}
                        className="flex items-center border-t border-vscode-border
                            px-2 py-1 gap-1 shrink-0"
                    >
                        <span className="text-[12px] text-vscode-text opacity-75 font-mono">&gt;</span>
                        <input
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Send to Serial…"
                            className="flex-1 bg-transparent text-[13px] font-mono
                                text-vscode-textActive outline-none placeholder:text-vscode-text placeholder:opacity-60"
                        />
                        <button type="submit" className="text-vscode-text opacity-80 hover:text-vscode-textActive hover:opacity-100 p-1" title="Send">
                            <Send size={13} />
                        </button>
                    </form>
                </>
            )}

            {/* ── Chips Console Tab ── */}
            {tab === 'chips' && (
                <div
                    ref={scrollRef}
                    onScroll={handleScroll}
                    className="flex-1 overflow-y-auto p-3 text-[13px]
                        font-mono text-vscode-text whitespace-pre-wrap leading-relaxed"
                >
                    {chipOutput || (
                        <span className="text-vscode-text opacity-40 italic">No chip logs…</span>
                    )}
                </div>
            )}

            {/* ── Plotter Tab ── */}
            {tab === 'plotter' && <SerialPlotter output={output} />}

            {/* ── History Tab ── */}
            {tab === 'history' && (
                <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
                    {compileHistory.length === 0 ? (
                        <p className="p-6 text-center text-vscode-text opacity-60 text-[13px] italic">
                            No compilation history yet. Hit Build to get started.
                        </p>
                    ) : (
                        compileHistory.map((entry) => (
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
                                    <span className="text-vscode-text opacity-65 shrink-0">
                                        {new Date(entry.timestamp).toLocaleTimeString()}
                                    </span>
                                    <span className="text-vscode-text opacity-65 shrink-0">
                                        {(entry.durationMs / 1000).toFixed(1)}s
                                    </span>
                                </summary>
                                <pre className="bg-vscode-codeBg px-4 py-2 text-[11px] font-mono
                                    text-vscode-text opacity-70 whitespace-pre-wrap overflow-x-auto max-h-48
                                    overflow-y-auto">
                                    {entry.output || '(no output)'}
                                </pre>
                            </details>
                        ))
                    )}
                </div>
            )}

            {/* ── Diagnostics Tab ── */}
            {tab === 'diagnostics' && (
                <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
                    <div className="flex items-center gap-2 px-3 py-2 border-b border-vscode-border">
                        <label htmlFor="serial-monitor-diagnostics-severity" className="text-[11px] text-vscode-text opacity-80">Severity</label>
                        <select
                            id="serial-monitor-diagnostics-severity"
                            value={severityFilter}
                            onChange={(e) => onDiagnosticsSeverityFilterChange(e.target.value as SeverityFilter)}
                            className="bg-vscode-input text-[11px] text-vscode-text border
                                border-vscode-border rounded px-1.5 py-0.5 outline-none cursor-pointer"
                        >
                            <option value="all">All</option>
                            <option value="error">Error</option>
                            <option value="warning">Warning</option>
                            <option value="info">Info</option>
                            <option value="hint">Hint</option>
                        </select>

                        {severityFilter !== 'all' && (
                            <button
                                onClick={() => onDiagnosticsSeverityFilterChange('all')}
                                className="text-[10px] px-1.5 py-0.5 rounded border border-vscode-border text-vscode-text opacity-70 hover:opacity-100 hover:bg-vscode-hover"
                                title="Clear severity filter"
                            >
                                Clear severity
                            </button>
                        )}

                        <label htmlFor="serial-monitor-diagnostics-chip" className="text-[11px] text-vscode-text opacity-80 ml-1">Chip</label>
                        <select
                            id="serial-monitor-diagnostics-chip"
                            value={chipFilter}
                            onChange={(e) => onDiagnosticsChipFilterChange(e.target.value)}
                            className="bg-vscode-input text-[11px] text-vscode-text border
                                border-vscode-border rounded px-1.5 py-0.5 outline-none cursor-pointer"
                        >
                            {chipFilterOptions.map((option) => (
                                <option key={option} value={option}>
                                    {option === 'all' ? 'All' : option}
                                </option>
                            ))}
                        </select>

                        {chipFilter !== 'all' && (
                            <button
                                onClick={() => onDiagnosticsChipFilterChange('all')}
                                className="text-[10px] px-1.5 py-0.5 rounded border border-vscode-border text-vscode-text opacity-70 hover:opacity-100 hover:bg-vscode-hover"
                                title="Clear chip filter"
                            >
                                Clear chip
                            </button>
                        )}

                        <span className="ml-auto text-[11px] text-vscode-text opacity-60">
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
                                return (
                                    <div
                                        key={itemId}
                                        className={[
                                            'border-b border-vscode-border',
                                            'px-3 py-2',
                                        ].join(' ')}
                                    >
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
                                                <span className="text-vscode-text opacity-70 truncate">{item.fileName}:{d.startLineNumber}:{d.startColumn}</span>
                                            </button>

                                            <button
                                                onClick={() => onDiagnosticsChipFilterChange(item.chipName)}
                                                className="text-[10px] px-1.5 py-0.5 rounded border border-vscode-border text-vscode-text opacity-70 hover:opacity-100 hover:bg-vscode-hover"
                                                title="Only this chip"
                                            >
                                                Only this chip
                                            </button>

                                            <button
                                                onClick={() => onDiagnosticsSeverityFilterChange(d.severity)}
                                                className="text-[10px] px-1.5 py-0.5 rounded border border-vscode-border text-vscode-text opacity-70 hover:opacity-100 hover:bg-vscode-hover"
                                                title={`Only ${d.severity} diagnostics`}
                                            >
                                                {severityFilterLabel(d.severity)}
                                            </button>
                                        </div>
                                        <button
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
                                                        className="rounded border border-vscode-border px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-vscode-text hover:bg-vscode-hover"
                                                    >
                                                        Open location
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => onDiagnosticsChipFilterChange(item.chipName)}
                                                        className="rounded border border-vscode-border px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-vscode-text hover:bg-vscode-hover"
                                                    >
                                                        Filter chip
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
        </div>
    );
}
