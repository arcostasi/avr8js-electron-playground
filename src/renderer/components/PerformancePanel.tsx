import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Activity, ChevronDown, ChevronUp, Database, Download, Pause, Play, RotateCcw, Trash2, Upload,
} from 'lucide-react';
import { getRecentPerfEntries, subscribePerfEntries } from '../utils/perf';
import type { PerfEntry } from '../utils/perf';
import { useSettingsStore } from '../store/settingsStore';
import {
    buildPerfBaselineComparison,
    buildPerfSessionSnapshot,
    parsePerfThresholdConfig,
} from '../services/perf-dashboard';
import type {
    PerfBaselineComparison,
    PerfDashboardDomainSummary,
    PerfDomain,
    PerfDashboardOperation,
    PerfSessionSnapshot,
    PerfDashboardTimelinePoint,
    PerfSeverity,
} from '../services/perf-dashboard';
import {
    captureRendererMemorySnapshot,
    clearPerfPanelBaseline,
    parsePerfSessionSnapshotJson,
    readPerfPanelBaselines,
    readPerfPanelPreferences,
    selectPerfPanelBaseline,
    updatePerfPanelBaseline,
    writePerfPanelPreferences,
    writePerfPanelBaseline,
} from '../services/perf-panel-storage';
import type {
    PerfPanelBaselineCollection,
    PerfPanelBaselineRecord,
    PerfPanelPreferences,
    PerfRendererMemorySnapshot,
} from '../services/perf-panel-storage';

const MAX_PANEL_ENTRIES = 200;
const FLUSH_INTERVAL_MS = 120;

type OperationSortKey = 'recent' | 'last' | 'avg' | 'p95' | 'max' | 'count' | 'name' | 'delta';
type ComparisonMode = 'baseline' | 'imported-live' | 'imported-pair';

function formatDuration(durationMs: number | null): string {
    if (durationMs === null) return '--';
    if (durationMs >= 1000) return `${(durationMs / 1000).toFixed(2)} s`;
    return `${durationMs.toFixed(1)} ms`;
}

function formatCount(value: number): string {
    return new Intl.NumberFormat('en-US').format(value);
}

function formatTimestamp(timestamp: number): string {
    return `${(timestamp / 1000).toFixed(2)} s`;
}

function formatBytes(bytes: number | null): string {
    if (bytes === null) return '--';
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDelta(delta: number | null, unit: 'ms' | 'count' | 'percent'): string {
    if (delta === null) return '--';
    const prefix = delta > 0 ? '+' : '';
    if (unit === 'ms') return `${prefix}${delta.toFixed(1)} ms`;
    if (unit === 'percent') return `${prefix}${delta.toFixed(1)}%`;
    return `${prefix}${delta}`;
}

function createSuggestedBaselineName(): string {
    return `Session ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
}

function truncateBaselineNote(note: string, limit = 96): string {
    if (note.length <= limit) return note;
    return `${note.slice(0, limit - 1)}…`;
}

function lastEntryId(entries: PerfEntry[]): number {
    let lastId = 0;
    for (const entry of entries) {
        lastId = entry.id;
    }
    return lastId;
}

function severityClasses(severity: PerfSeverity): string {
    if (severity === 'good') return 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
    if (severity === 'warn') return 'text-amber-300 border-amber-500/30 bg-amber-500/10';
    if (severity === 'bad') return 'text-rose-300 border-rose-500/30 bg-rose-500/10';
    return 'text-vscode-text border-vscode-border bg-vscode-hover';
}

function domainLabel(domain: PerfDashboardDomainSummary['domain']): string {
    return domain === 'custom-chips' ? 'custom chips' : domain;
}

function metricValueForSort(
    operation: PerfDashboardOperation,
    sortBy: 'recent' | 'last' | 'avg' | 'p95' | 'max' | 'count' | 'name' | 'delta',
    deltaMs: number | null,
): number | null {
    if (sortBy === 'delta') return deltaMs;
    if (sortBy === 'last') return operation.lastDurationMs;
    if (sortBy === 'avg') return operation.avgDurationMs;
    if (sortBy === 'p95') return operation.p95DurationMs;
    return operation.maxDurationMs;
}

function sparklineBarClass(severity: PerfSeverity): string {
    if (severity === 'good') return 'bg-emerald-400/80';
    if (severity === 'warn') return 'bg-amber-300/80';
    if (severity === 'bad') return 'bg-rose-300/80';
    return 'bg-vscode-text/40';
}

function sortOperations(
    operations: PerfDashboardOperation[],
    sortBy: OperationSortKey,
    comparison: PerfBaselineComparison,
): PerfDashboardOperation[] {
    const deltaByName = new Map(comparison.operationDeltas.map((item) => [item.name, item.deltaMs] as const));
    const sorted = [...operations];
    sorted.sort((left, right) => {
        if (sortBy === 'name') return left.name.localeCompare(right.name);
        if (sortBy === 'count') return right.measureCount - left.measureCount;
        if (sortBy === 'recent') return right.lastTimestamp - left.lastTimestamp;

        const leftValue = metricValueForSort(left, sortBy, deltaByName.get(left.name) ?? null);
        const rightValue = metricValueForSort(right, sortBy, deltaByName.get(right.name) ?? null);
        return (rightValue ?? -1) - (leftValue ?? -1);
    });
    return sorted;
}

function downloadSnapshotFile(content: string, fileName: string): void {
    const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}

function CompactMetricCard({
    label,
    value,
    accent = 'text-blue-300',
}: Readonly<{
    label: string;
    value: string;
    accent?: string;
}>) {
    return (
        <div className="min-w-[84px] rounded-md border border-vscode-border bg-vscode-sidebar px-2.5 py-2">
            <div className="text-[10px] uppercase tracking-[0.18em] text-vscode-text opacity-60">{label}</div>
            <div className={`mt-1 text-[13px] font-semibold ${accent}`}>{value}</div>
        </div>
    );
}

function regressionTone(deltaMs: number | null): string {
    if (deltaMs === null || deltaMs <= 0) return '';
    if (deltaMs >= 150) return 'bg-rose-500/8';
    return 'bg-amber-500/8';
}

function OperationsTable({
    operations,
    comparison,
}: Readonly<{
    operations: PerfDashboardOperation[];
    comparison: PerfBaselineComparison;
}>) {
    const regressionByName = new Map(comparison.operationDeltas.map((item) => [item.name, item] as const));

    return (
        <div className="rounded-md border border-vscode-border overflow-hidden">
            <div className="grid grid-cols-[minmax(0,2fr)_72px_90px_90px_90px_72px_86px] gap-0 bg-vscode-sidebar text-[10px] uppercase tracking-[0.18em] text-vscode-text opacity-65">
                <div className="px-3 py-2">Operation</div>
                <div className="px-3 py-2">SLA</div>
                <div className="px-3 py-2">Last</div>
                <div className="px-3 py-2">Avg</div>
                <div className="px-3 py-2">P95</div>
                <div className="px-3 py-2">Max</div>
                <div className="px-3 py-2">Delta</div>
            </div>
            <div className="max-h-64 overflow-y-auto bg-vscode-bg">
                {operations.length === 0 ? (
                    <div className="px-3 py-4 text-[12px] text-vscode-text opacity-60">No measurements yet.</div>
                ) : operations.map((operation) => {
                    const regression = regressionByName.get(operation.name) ?? null;

                    return (
                        <div
                            key={operation.name}
                            className={[
                                'grid grid-cols-[minmax(0,2fr)_72px_90px_90px_90px_72px_86px] gap-0 border-t border-vscode-border/70 text-[12px]',
                                regressionTone(regression?.deltaMs ?? null),
                            ].join(' ')}
                        >
                            <div className="px-3 py-2 min-w-0">
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] ${severityClasses(operation.severity)}`}>
                                        {operation.domain}
                                    </span>
                                    <span className="truncate text-vscode-textActive">{operation.name}</span>
                                </div>
                                <div className="mt-1 text-[11px] text-vscode-text opacity-60 truncate">
                                    {operation.measureCount > 0
                                        ? `${formatCount(operation.measureCount)} measure(s)`
                                        : `${formatCount(operation.count)} mark(s)`}
                                    {operation.lastDetail ? ` · ${operation.lastDetail}` : ''}
                                    {regression ? ` · Δ ${formatDelta(regression.deltaMs, 'ms')}` : ''}
                                </div>
                            </div>
                            <div className="px-3 py-2 font-mono text-vscode-text">{formatDuration(operation.thresholdMs)}</div>
                            <div className="px-3 py-2 font-mono text-vscode-text">{formatDuration(operation.lastDurationMs)}</div>
                            <div className="px-3 py-2 font-mono text-vscode-text">{formatDuration(operation.avgDurationMs)}</div>
                            <div className="px-3 py-2 font-mono text-vscode-text">{formatDuration(operation.p95DurationMs)}</div>
                            <div className="px-3 py-2 font-mono text-vscode-text">{formatDuration(operation.maxDurationMs)}</div>
                            <div className={`px-3 py-2 font-mono ${regression ? 'text-amber-300' : 'text-vscode-text opacity-60'}`}>
                                {formatDelta(regression?.deltaMs ?? null, 'ms')}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function Sparkline({
    points,
}: Readonly<{
    points: Array<{ id: number; durationMs: number; severity: PerfSeverity; label: string }>;
}>) {
    const maxDuration = points.reduce((max, point) => Math.max(max, point.durationMs), 0);

    return (
        <div className="rounded-md border border-vscode-border bg-vscode-bg overflow-hidden">
            <div className="px-3 py-2 bg-vscode-sidebar text-[10px] uppercase tracking-[0.18em] text-vscode-text opacity-65">
                Timeline Sparkline
            </div>
            {points.length === 0 ? (
                <div className="px-3 py-4 text-[12px] text-vscode-text opacity-60">No measured durations yet.</div>
            ) : (
                <div className="px-3 py-3">
                    <div className="flex items-end gap-1 h-20">
                        {points.map((point) => {
                            const height = maxDuration > 0 ? Math.max(10, Math.round((point.durationMs / maxDuration) * 100)) : 10;
                            return (
                                <div
                                    key={point.id}
                                    title={`${point.label}: ${formatDuration(point.durationMs)}`}
                                    className={`flex-1 min-w-[6px] rounded-t-sm ${sparklineBarClass(point.severity)}`}
                                    style={{ height: `${height}%` }}
                                />
                            );
                        })}
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-vscode-text opacity-55">
                        <span>oldest</span>
                        <span>{formatDuration(maxDuration || null)}</span>
                        <span>newest</span>
                    </div>
                </div>
            )}
        </div>
    );
}

function TimelineList({ timeline }: Readonly<{ timeline: PerfDashboardTimelinePoint[] }>) {
    return (
        <div className="rounded-md border border-vscode-border bg-vscode-bg overflow-hidden">
            <div className="px-3 py-2 bg-vscode-sidebar text-[10px] uppercase tracking-[0.18em] text-vscode-text opacity-65">
                Recent Timeline
            </div>
            <div className="max-h-44 overflow-y-auto">
                {timeline.length === 0 ? (
                    <div className="px-3 py-4 text-[12px] text-vscode-text opacity-60">Waiting for events.</div>
                ) : timeline.map((entry) => (
                    <div key={entry.id} className="border-t border-vscode-border/70 px-3 py-2 text-[12px]">
                        <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <div className="truncate text-vscode-textActive">{entry.name}</div>
                                <div className="mt-1 truncate text-[11px] text-vscode-text opacity-60">
                                    {entry.detail || entry.domain}
                                </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                                <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] ${severityClasses(entry.severity)}`}>
                                    {entry.kind}
                                </span>
                                <div className="font-mono text-vscode-text">{formatDuration(entry.durationMs)}</div>
                            </div>
                        </div>
                        <div className="mt-1 text-[11px] text-vscode-text opacity-45">{formatTimestamp(entry.timestamp)}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default function PerformancePanel() { // NOSONAR: metrics panel composition and local UI state orchestration
    const settings = useSettingsStore();
    const [entries, setEntries] = useState<PerfEntry[]>(() => getRecentPerfEntries().slice(-MAX_PANEL_ENTRIES));
    const [sessionStartedAt, setSessionStartedAt] = useState<number>(() => getRecentPerfEntries()[0]?.timestamp ?? performance.now());
    const [isFrozen, setIsFrozen] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [memorySnapshot, setMemorySnapshot] = useState<PerfRendererMemorySnapshot | null>(() => captureRendererMemorySnapshot());
    const [baselineCollection, setBaselineCollection] = useState<PerfPanelBaselineCollection>({ selectedId: null, baselines: [] });
    const [panelPreferences, setPanelPreferences] = useState<PerfPanelPreferences>({ comparisonMode: 'baseline', sortBy: 'recent', regressionThresholdMs: 0 });
    const [importedSnapshot, setImportedSnapshot] = useState<PerfSessionSnapshot | null>(null);
    const [importedSnapshotLabel, setImportedSnapshotLabel] = useState<string>('');
    const [importedTargetSnapshot, setImportedTargetSnapshot] = useState<PerfSessionSnapshot | null>(null);
    const [importedTargetSnapshotLabel, setImportedTargetSnapshotLabel] = useState<string>('');
    const [comparisonMode, setComparisonMode] = useState<ComparisonMode>(panelPreferences.comparisonMode);
    const [importError, setImportError] = useState<string | null>(null);
    const [pendingImportSlot, setPendingImportSlot] = useState<'reference' | 'target'>('reference');
    const [newBaselineNameDraft, setNewBaselineNameDraft] = useState<string>(() => createSuggestedBaselineName());
    const [newBaselineNoteDraft, setNewBaselineNoteDraft] = useState<string>('');
    const [selectedBaselineNameDraft, setSelectedBaselineNameDraft] = useState<string>('');
    const [selectedBaselineNoteDraft, setSelectedBaselineNoteDraft] = useState<string>('');
    const [lastExportAt, setLastExportAt] = useState<number | null>(null);
    const [domainFilter, setDomainFilter] = useState<'all' | PerfDomain>('all');
    const [sortBy, setSortBy] = useState<OperationSortKey>(panelPreferences.sortBy);
    const [regressionThresholdMs, setRegressionThresholdMs] = useState<number>(panelPreferences.regressionThresholdMs);
    const [resetAfterId, setResetAfterId] = useState(() => {
        const recent = getRecentPerfEntries();
        return lastEntryId(recent);
    });

    const pendingEntriesRef = useRef<PerfEntry[]>([]);
    const flushTimeoutRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
    const importInputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        let cancelled = false;

        void (async () => {
            const [storedBaselines, storedPreferences] = await Promise.all([
                readPerfPanelBaselines(),
                readPerfPanelPreferences(),
            ]);
            if (cancelled) return;

            setBaselineCollection(storedBaselines);
            setPanelPreferences(storedPreferences);
            setComparisonMode(storedPreferences.comparisonMode);
            setSortBy(storedPreferences.sortBy);
            setRegressionThresholdMs(storedPreferences.regressionThresholdMs);
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (isFrozen) return;

        const recent = getRecentPerfEntries().filter((entry) => entry.id > resetAfterId).slice(-MAX_PANEL_ENTRIES);
        setEntries(recent);
        setSessionStartedAt(recent[0]?.timestamp ?? performance.now());
    }, [isFrozen, resetAfterId]);

    useEffect(() => {
        if (isFrozen) return;

        setMemorySnapshot(captureRendererMemorySnapshot());
        const intervalId = globalThis.setInterval(() => {
            setMemorySnapshot(captureRendererMemorySnapshot());
        }, 1500);

        return () => globalThis.clearInterval(intervalId);
    }, [isFrozen]);

    useEffect(() => {
        const flushPending = () => {
            flushTimeoutRef.current = null;
            if (isFrozen || pendingEntriesRef.current.length === 0) return;

            const incoming = pendingEntriesRef.current
                .filter((entry) => entry.id > resetAfterId)
                .slice(-MAX_PANEL_ENTRIES);
            pendingEntriesRef.current = [];
            if (incoming.length === 0) return;

            setEntries((previous) => {
                const combined = [...previous, ...incoming].slice(-MAX_PANEL_ENTRIES);
                if (previous.length === 0 && combined.length > 0) {
                    setSessionStartedAt(combined[0].timestamp);
                }
                return combined;
            });
        };

        const unsubscribe = subscribePerfEntries((entry) => {
            pendingEntriesRef.current.push(entry);
            if (flushTimeoutRef.current !== null) return;

            flushTimeoutRef.current = globalThis.setTimeout(flushPending, FLUSH_INTERVAL_MS);
        });

        return () => {
            unsubscribe();
            if (flushTimeoutRef.current !== null) {
                globalThis.clearTimeout(flushTimeoutRef.current);
                flushTimeoutRef.current = null;
            }
            pendingEntriesRef.current = [];
        };
    }, [isFrozen, resetAfterId]);

    const thresholdConfig = useMemo(
        () => parsePerfThresholdConfig(settings.performanceThresholdsJson),
        [settings.performanceThresholdsJson],
    );

    const snapshot = useMemo(
        () => buildPerfSessionSnapshot(entries, sessionStartedAt, thresholdConfig.thresholds),
        [entries, sessionStartedAt, thresholdConfig.thresholds],
    );

    const baselineRecord = useMemo<PerfPanelBaselineRecord | null>(
        () => baselineCollection.baselines.find((baseline) => baseline.id === baselineCollection.selectedId) ?? null,
        [baselineCollection],
    );

    const baselineComparison = useMemo(
        () => buildPerfBaselineComparison(snapshot, baselineRecord?.snapshot ?? null),
        [snapshot, baselineRecord],
    );

    const importedLiveComparison = useMemo(
        () => buildPerfBaselineComparison(snapshot, importedSnapshot),
        [snapshot, importedSnapshot],
    );

    const importedPairComparison = useMemo(
        () => buildPerfBaselineComparison(importedTargetSnapshot ?? snapshot, importedSnapshot),
        [importedSnapshot, importedTargetSnapshot, snapshot],
    );

    const activeComparisonMode = useMemo<ComparisonMode>(() => {
        if (comparisonMode === 'imported-pair' && importedSnapshot && importedTargetSnapshot) {
            return 'imported-pair';
        }
        if (comparisonMode === 'imported-live' && importedSnapshot) {
            return 'imported-live';
        }
        return 'baseline';
    }, [comparisonMode, importedSnapshot, importedTargetSnapshot]);

    const activeDisplaySnapshot = activeComparisonMode === 'imported-pair' && importedTargetSnapshot
        ? importedTargetSnapshot
        : snapshot;

    let activeComparison = baselineComparison;
    if (activeComparisonMode === 'imported-live') {
        activeComparison = importedLiveComparison;
    } else if (activeComparisonMode === 'imported-pair') {
        activeComparison = importedPairComparison;
    }

    const activeDomainSummaries = activeDisplaySnapshot.domainSummaries;
    const activeSummary = activeDisplaySnapshot.summary;

    const visibleOperations = useMemo(() => {
        const filteredByDomain = domainFilter === 'all'
            ? activeDisplaySnapshot.operations
            : activeDisplaySnapshot.operations.filter((operation) => operation.domain === domainFilter);
        const deltaByName = new Map(activeComparison.operationDeltas.map((item) => [item.name, item.deltaMs] as const));
        const filteredByRegression = activeComparison.hasBaseline && regressionThresholdMs > 0
            ? filteredByDomain.filter((operation) => (deltaByName.get(operation.name) ?? 0) >= regressionThresholdMs)
            : filteredByDomain;

        return sortOperations(filteredByRegression, sortBy, activeComparison).slice(0, 12);
    }, [activeComparison, activeDisplaySnapshot.operations, domainFilter, regressionThresholdMs, sortBy]);

    const comparisonSourceLabel = useMemo(() => {
        if (activeComparisonMode === 'imported-pair' && importedSnapshot && importedTargetSnapshot) {
            return `${importedTargetSnapshotLabel || 'target snapshot'} vs ${importedSnapshotLabel || 'reference snapshot'}`;
        }
        if (activeComparisonMode === 'imported-live' && importedSnapshot) {
            return `${importedSnapshotLabel || 'imported snapshot'} vs live session`;
        }
        if (baselineRecord) {
            const savedAtLabel = new Date(baselineRecord.savedAt).toLocaleTimeString();
            return baselineRecord.note
                ? `${baselineRecord.name} · ${savedAtLabel} · ${truncateBaselineNote(baselineRecord.note, 56)}`
                : `${baselineRecord.name} · ${savedAtLabel}`;
        }
        return 'no baseline saved';
    }, [activeComparisonMode, importedSnapshot, importedSnapshotLabel, importedTargetSnapshot, importedTargetSnapshotLabel, baselineRecord]);

    useEffect(() => {
        if (!baselineRecord) {
            setSelectedBaselineNameDraft('');
            setSelectedBaselineNoteDraft('');
            return;
        }

        setSelectedBaselineNameDraft(baselineRecord.name);
        setSelectedBaselineNoteDraft(baselineRecord.note);
    }, [baselineRecord]);

    useEffect(() => {
        void (async () => {
            const nextPreferences = await writePerfPanelPreferences({
                comparisonMode: activeComparisonMode,
                sortBy,
                regressionThresholdMs,
            });
            setPanelPreferences((current) => {
                if (
                    current.comparisonMode === nextPreferences.comparisonMode
                    && current.sortBy === nextPreferences.sortBy
                    && current.regressionThresholdMs === nextPreferences.regressionThresholdMs
                ) {
                    return current;
                }
                return nextPreferences;
            });
        })();
    }, [activeComparisonMode, regressionThresholdMs, sortBy]);

    const handleReset = () => {
        const recent = getRecentPerfEntries();
        setResetAfterId(lastEntryId(recent));
        setEntries([]);
        setSessionStartedAt(performance.now());
        pendingEntriesRef.current = [];
    };

    const handleExportSnapshot = () => {
        const payload = JSON.stringify(snapshot, null, 2);
        const stamp = new Date().toISOString().split(':').join('-').split('.').join('-');
        downloadSnapshotFile(payload, `perf-session-${stamp}.json`);
        setLastExportAt(Date.now());
    };

    const handleSaveBaseline = () => {
        void (async () => {
            setBaselineCollection(await writePerfPanelBaseline(snapshot, newBaselineNameDraft, newBaselineNoteDraft));
        })();
        setNewBaselineNameDraft(createSuggestedBaselineName());
        setNewBaselineNoteDraft('');
    };

    const handleClearBaseline = () => {
        void (async () => {
            setBaselineCollection(await clearPerfPanelBaseline());
        })();
    };

    const handleSelectBaseline = (baselineId: string) => {
        void (async () => {
            setBaselineCollection(await selectPerfPanelBaseline(baselineId));
        })();
        setComparisonMode('baseline');
    };

    const handleUpdateSelectedBaseline = () => {
        if (!baselineRecord) return;
        void (async () => {
            setBaselineCollection(await updatePerfPanelBaseline(baselineRecord.id, {
                name: selectedBaselineNameDraft,
                note: selectedBaselineNoteDraft,
            }));
        })();
    };

    const handleImportSnapshotClick = (slot: 'reference' | 'target' = 'reference') => {
        setPendingImportSlot(slot);
        importInputRef.current?.click();
    };

    const handleImportSnapshotFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            const raw = await file.text();
            const parsed = parsePerfSessionSnapshotJson(raw);
            if (pendingImportSlot === 'target') {
                setImportedTargetSnapshot(parsed);
                setImportedTargetSnapshotLabel(file.name);
                if (importedSnapshot) {
                    setComparisonMode('imported-pair');
                }
            } else {
                setImportedSnapshot(parsed);
                setImportedSnapshotLabel(file.name);
                setComparisonMode(importedTargetSnapshot ? 'imported-pair' : 'imported-live');
            }
            setImportError(null);
        } catch (error) {
            setImportError(error instanceof Error ? error.message : 'Failed to import snapshot.');
        } finally {
            event.target.value = '';
        }
    };

    const handleClearImportedSnapshot = (slot: 'reference' | 'target' = 'reference') => {
        if (slot === 'target') {
            setImportedTargetSnapshot(null);
            setImportedTargetSnapshotLabel('');
            if (activeComparisonMode === 'imported-pair') {
                setComparisonMode(importedSnapshot ? 'imported-live' : 'baseline');
            }
            setImportError(null);
            return;
        }

        setImportedSnapshot(null);
        setImportedSnapshotLabel('');
        setImportError(null);
        if (activeComparisonMode === 'imported-live' || activeComparisonMode === 'imported-pair') {
            setComparisonMode('baseline');
        }
    };

    let comparisonSummaryTarget: PerfPanelBaselineRecord | PerfSessionSnapshot | null = baselineRecord;
    let comparisonClearAction = handleClearBaseline;
    let comparisonClearTitle = 'Delete selected baseline';
    let comparisonClearLabel = 'delete selected';
    let comparisonEmptyState = 'Save the current session as baseline to compare future regressions.';

    if (activeComparisonMode === 'imported-live') {
        comparisonSummaryTarget = importedSnapshot;
        comparisonClearAction = () => handleClearImportedSnapshot('reference');
        comparisonClearTitle = 'Clear imported reference snapshot';
        comparisonClearLabel = 'clear ref';
        comparisonEmptyState = importedSnapshot
            ? 'Import a target snapshot to compare two imported sessions directly.'
            : 'Import a reference snapshot JSON to compare the current session or another snapshot against it.';
    } else if (activeComparisonMode === 'imported-pair') {
        comparisonSummaryTarget = importedTargetSnapshot;
        comparisonClearAction = () => handleClearImportedSnapshot('target');
        comparisonClearTitle = 'Clear imported target snapshot';
        comparisonClearLabel = 'clear target';
        comparisonEmptyState = 'Import a target snapshot to compare two imported sessions directly.';
    }

    return (
        <div className="absolute bottom-4 right-4 z-30 flex flex-col items-end gap-2 pointer-events-none">
            <input
                ref={importInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(event) => { void handleImportSnapshotFile(event); }}
            />
            <div
                className="pointer-events-auto rounded-lg border border-vscode-border bg-vscode-panel/95 shadow-2xl backdrop-blur"
                style={{ width: isExpanded ? 'min(560px, calc(100vw - 88px))' : 'auto' }}
            >
                <div className="flex items-center gap-3 border-b border-vscode-border px-3 py-2.5">
                    <div className="flex items-center gap-2 text-vscode-textActive min-w-0">
                        <Activity size={15} className="text-blue-300" />
                        <span className="text-[12px] font-semibold uppercase tracking-[0.18em]">Performance</span>
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                        <button
                            onClick={handleSaveBaseline}
                            className="rounded-md border border-vscode-border bg-vscode-sidebar p-1.5 text-vscode-text hover:text-vscode-textActive hover:bg-vscode-hover transition-colors"
                            title="Save current session as local baseline"
                        >
                            <Database size={14} />
                        </button>
                        <button
                            onClick={() => setIsFrozen((value) => !value)}
                            className="rounded-md border border-vscode-border bg-vscode-sidebar p-1.5 text-vscode-text hover:text-vscode-textActive hover:bg-vscode-hover transition-colors"
                            title={isFrozen ? 'Resume metrics updates' : 'Freeze metrics updates'}
                        >
                            {isFrozen ? <Play size={14} /> : <Pause size={14} />}
                        </button>
                        <button
                            onClick={handleReset}
                            className="rounded-md border border-vscode-border bg-vscode-sidebar p-1.5 text-vscode-text hover:text-vscode-textActive hover:bg-vscode-hover transition-colors"
                            title="Reset session metrics"
                        >
                            <RotateCcw size={14} />
                        </button>
                        <button
                            onClick={() => setIsExpanded((value) => !value)}
                            className="rounded-md border border-vscode-border bg-vscode-sidebar p-1.5 text-vscode-text hover:text-vscode-textActive hover:bg-vscode-hover transition-colors"
                            title={isExpanded ? 'Collapse performance panel' : 'Expand performance panel'}
                        >
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                        </button>
                        <button
                            onClick={handleExportSnapshot}
                            className="rounded-md border border-vscode-border bg-vscode-sidebar p-1.5 text-vscode-text hover:text-vscode-textActive hover:bg-vscode-hover transition-colors"
                            title="Export session metrics snapshot as JSON"
                        >
                            <Download size={14} />
                        </button>
                        <button
                            onClick={() => handleImportSnapshotClick('reference')}
                            className="rounded-md border border-vscode-border bg-vscode-sidebar p-1.5 text-vscode-text hover:text-vscode-textActive hover:bg-vscode-hover transition-colors"
                            title="Import a reference perf snapshot for comparison"
                        >
                            <Upload size={14} />
                        </button>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2 px-3 py-3 bg-vscode-bg">
                    <CompactMetricCard label="Session" value={formatDuration(activeSummary.sessionElapsedMs)} />
                    <CompactMetricCard label="Events" value={formatCount(activeSummary.totalEvents)} accent="text-vscode-textActive" />
                    <CompactMetricCard label="Measures" value={formatCount(activeSummary.totalMeasures)} accent="text-vscode-textActive" />
                    <CompactMetricCard label="Startup" value={formatDuration(activeSummary.startupDurationMs)} accent="text-emerald-300" />
                    <CompactMetricCard label="Proj Load" value={formatDuration(activeSummary.latestProjectLoadMs)} accent="text-amber-300" />
                    <CompactMetricCard label="Cache Hits" value={formatCount(activeSummary.cache.hits)} accent="text-sky-300" />
                    <CompactMetricCard label="Heap Used" value={formatBytes(memorySnapshot?.usedJSHeapSize ?? null)} accent="text-fuchsia-300" />
                    <CompactMetricCard label="Heap Load" value={memorySnapshot ? `${(memorySnapshot.utilization * 100).toFixed(1)}%` : '--'} accent="text-fuchsia-300" />
                </div>

                <div className="border-t border-vscode-border px-3 py-2 bg-vscode-panel">
                    <div className="flex flex-wrap gap-2">
                        {activeDomainSummaries.length === 0 ? (
                            <span className="text-[11px] text-vscode-text opacity-60">No domains observed yet.</span>
                        ) : activeDomainSummaries.map((summary) => (
                            <div
                                key={summary.domain}
                                className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] ${severityClasses(summary.severity)}`}
                            >
                                <span className="uppercase tracking-[0.14em]">{domainLabel(summary.domain)}</span>
                                <span className="font-mono">{formatDuration(summary.maxDurationMs)}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {isExpanded && (
                    <div className="space-y-3 border-t border-vscode-border bg-vscode-bg px-3 py-3">
                        <div className="flex flex-wrap items-center gap-2 text-[12px]">
                            <span className="text-vscode-text opacity-60 uppercase tracking-[0.14em]">Filter</span>
                            {(['all', ...activeDomainSummaries.map((summary) => summary.domain)] as Array<'all' | PerfDomain>).map((domain) => (
                                <button
                                    key={domain}
                                    onClick={() => setDomainFilter(domain)}
                                    className={[
                                        'rounded-full border px-2.5 py-1 transition-colors',
                                        domainFilter === domain
                                            ? 'border-blue-500/50 bg-blue-500/10 text-blue-200'
                                            : 'border-vscode-border bg-vscode-sidebar text-vscode-text hover:bg-vscode-hover',
                                    ].join(' ')}
                                >
                                    {domain === 'all' ? 'all' : domainLabel(domain)}
                                </button>
                            ))}
                            <span className="ml-auto text-vscode-text opacity-60 uppercase tracking-[0.14em]">Sort</span>
                            <select
                                value={sortBy}
                                onChange={(event) => setSortBy(event.target.value as typeof sortBy)}
                                className="rounded-md border border-vscode-border bg-vscode-sidebar px-2 py-1 text-vscode-text outline-none"
                            >
                                <option value="recent">recent</option>
                                <option value="last">last</option>
                                <option value="avg">avg</option>
                                <option value="p95">p95</option>
                                <option value="max">max</option>
                                <option value="count">count</option>
                                <option value="delta">delta</option>
                                <option value="name">name</option>
                            </select>
                        </div>

                        {activeComparison.hasBaseline && (
                            <div className="rounded-md border border-vscode-border bg-vscode-sidebar px-3 py-2 text-[12px] text-vscode-text">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-[10px] uppercase tracking-[0.18em] opacity-60">Regression Filter</span>
                                    {[0, 25, 50, 100].map((value) => (
                                        <button
                                            key={value}
                                            onClick={() => setRegressionThresholdMs(value)}
                                            className={[
                                                'rounded-full border px-2.5 py-1 transition-colors',
                                                regressionThresholdMs === value
                                                    ? 'border-blue-500/50 bg-blue-500/10 text-blue-200'
                                                    : 'border-vscode-border bg-vscode-bg text-vscode-text hover:bg-vscode-hover',
                                            ].join(' ')}
                                        >
                                            {value === 0 ? 'all' : `Δ >= ${value} ms`}
                                        </button>
                                    ))}
                                    <input
                                        type="number"
                                        min={0}
                                        step={10}
                                        value={regressionThresholdMs}
                                        onChange={(event) => setRegressionThresholdMs(Math.max(0, Number(event.target.value) || 0))}
                                        className="ml-auto w-24 rounded-md border border-vscode-border bg-vscode-bg px-2 py-1 text-vscode-text outline-none"
                                    />
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-3 text-[12px]">
                            <div className="rounded-md border border-vscode-border bg-vscode-sidebar px-3 py-2">
                                <div className="text-[10px] uppercase tracking-[0.18em] text-vscode-text opacity-60">Last Event</div>
                                <div className="mt-1 truncate text-vscode-textActive">{activeSummary.lastEventName}</div>
                            </div>
                            <div className="rounded-md border border-vscode-border bg-vscode-sidebar px-3 py-2">
                                <div className="text-[10px] uppercase tracking-[0.18em] text-vscode-text opacity-60">Snapshot Export</div>
                                <div className="mt-1 text-vscode-text">
                                    {lastExportAt === null
                                        ? 'not exported yet'
                                        : `saved ${new Date(lastExportAt).toLocaleTimeString()}`}
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-[12px]">
                            <div className="rounded-md border border-vscode-border bg-vscode-sidebar px-3 py-2">
                                <div className="text-[10px] uppercase tracking-[0.18em] text-vscode-text opacity-60">Renderer Memory</div>
                                <div className="mt-1 text-vscode-text">
                                    {memorySnapshot
                                        ? `${formatBytes(memorySnapshot.usedJSHeapSize)} / ${formatBytes(memorySnapshot.jsHeapSizeLimit)}`
                                        : 'not exposed by this runtime'}
                                </div>
                            </div>
                            <div className="rounded-md border border-vscode-border bg-vscode-sidebar px-3 py-2">
                                <div className="text-[10px] uppercase tracking-[0.18em] text-vscode-text opacity-60">Comparison</div>
                                <div className="mt-1 text-vscode-text">{comparisonSourceLabel}</div>
                                <div className="mt-1 text-[11px] text-vscode-text opacity-60">
                                    {baselineCollection.baselines.length === 1
                                        ? '1 saved baseline'
                                        : `${baselineCollection.baselines.length} saved baselines`}
                                </div>
                            </div>
                        </div>

                        <div className="rounded-md border border-vscode-border bg-vscode-sidebar px-3 py-2 text-[12px] text-vscode-text">
                            <div className="text-[10px] uppercase tracking-[0.18em] opacity-60">Baseline Library</div>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                <input
                                    value={newBaselineNameDraft}
                                    onChange={(event) => setNewBaselineNameDraft(event.target.value)}
                                    placeholder="Baseline name"
                                    className="min-w-[180px] flex-1 rounded-md border border-vscode-border bg-vscode-bg px-2 py-1.5 text-vscode-text outline-none"
                                />
                                <button
                                    onClick={handleSaveBaseline}
                                    className="rounded border border-vscode-border px-2.5 py-1.5 text-vscode-text hover:bg-vscode-hover"
                                >
                                    save current
                                </button>
                            </div>
                            <textarea
                                value={newBaselineNoteDraft}
                                onChange={(event) => setNewBaselineNoteDraft(event.target.value)}
                                placeholder="Short note for the new baseline"
                                rows={2}
                                className="mt-2 w-full resize-none rounded-md border border-vscode-border bg-vscode-bg px-2 py-1.5 text-vscode-text outline-none"
                            />
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                <select
                                    value={baselineCollection.selectedId ?? ''}
                                    onChange={(event) => handleSelectBaseline(event.target.value)}
                                    className="min-w-[220px] flex-1 rounded-md border border-vscode-border bg-vscode-bg px-2 py-1.5 text-vscode-text outline-none"
                                >
                                    <option value="" disabled={baselineCollection.baselines.length > 0}>select baseline</option>
                                    {baselineCollection.baselines.map((baseline) => (
                                        <option key={baseline.id} value={baseline.id}>
                                            {`${baseline.name} · ${new Date(baseline.savedAt).toLocaleTimeString()}`}
                                        </option>
                                    ))}
                                </select>
                                <button
                                    onClick={handleClearBaseline}
                                    disabled={!baselineRecord}
                                    className={[
                                        'rounded border border-vscode-border px-2.5 py-1.5 text-vscode-text hover:bg-vscode-hover',
                                        baselineRecord ? '' : 'cursor-not-allowed opacity-40',
                                    ].join(' ')}
                                >
                                    delete selected
                                </button>
                            </div>
                            {baselineRecord && (
                                <div className="mt-3 rounded-md border border-vscode-border/70 bg-vscode-bg px-2.5 py-2">
                                    <div className="text-[10px] uppercase tracking-[0.18em] text-vscode-text opacity-60">Selected Baseline</div>
                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                        <input
                                            value={selectedBaselineNameDraft}
                                            onChange={(event) => setSelectedBaselineNameDraft(event.target.value)}
                                            placeholder="Selected baseline name"
                                            className="min-w-[180px] flex-1 rounded-md border border-vscode-border bg-vscode-sidebar px-2 py-1.5 text-vscode-text outline-none"
                                        />
                                        <button
                                            onClick={handleUpdateSelectedBaseline}
                                            className="rounded border border-vscode-border px-2.5 py-1.5 text-vscode-text hover:bg-vscode-hover"
                                        >
                                            update metadata
                                        </button>
                                    </div>
                                    <textarea
                                        value={selectedBaselineNoteDraft}
                                        onChange={(event) => setSelectedBaselineNoteDraft(event.target.value)}
                                        placeholder="Short note for the selected baseline"
                                        rows={2}
                                        className="mt-2 w-full resize-none rounded-md border border-vscode-border bg-vscode-sidebar px-2 py-1.5 text-vscode-text outline-none"
                                    />
                                </div>
                            )}
                        </div>

                        <div className="rounded-md border border-vscode-border bg-vscode-sidebar px-3 py-2 text-[12px] text-vscode-text">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[10px] uppercase tracking-[0.18em] opacity-60">Comparison Source</span>
                                <button
                                    onClick={() => setComparisonMode('baseline')}
                                    className={[
                                        'rounded-full border px-2.5 py-1 transition-colors',
                                        comparisonMode === 'baseline'
                                            ? 'border-blue-500/50 bg-blue-500/10 text-blue-200'
                                            : 'border-vscode-border bg-vscode-sidebar text-vscode-text hover:bg-vscode-hover',
                                    ].join(' ')}
                                >
                                    baseline
                                </button>
                                <button
                                    onClick={() => importedSnapshot && setComparisonMode('imported-live')}
                                    disabled={!importedSnapshot}
                                    className={[
                                        'rounded-full border px-2.5 py-1 transition-colors',
                                        activeComparisonMode === 'imported-live'
                                            ? 'border-blue-500/50 bg-blue-500/10 text-blue-200'
                                            : 'border-vscode-border bg-vscode-sidebar text-vscode-text hover:bg-vscode-hover',
                                        importedSnapshot ? '' : 'opacity-40 cursor-not-allowed',
                                    ].join(' ')}
                                >
                                    imported vs live
                                </button>
                                <button
                                    onClick={() => importedSnapshot && importedTargetSnapshot && setComparisonMode('imported-pair')}
                                    disabled={!importedSnapshot || !importedTargetSnapshot}
                                    className={[
                                        'rounded-full border px-2.5 py-1 transition-colors',
                                        activeComparisonMode === 'imported-pair'
                                            ? 'border-blue-500/50 bg-blue-500/10 text-blue-200'
                                            : 'border-vscode-border bg-vscode-sidebar text-vscode-text hover:bg-vscode-hover',
                                        importedSnapshot && importedTargetSnapshot ? '' : 'opacity-40 cursor-not-allowed',
                                    ].join(' ')}
                                >
                                    imported vs imported
                                </button>
                                <button
                                    onClick={() => handleImportSnapshotClick('reference')}
                                    className="ml-auto rounded border border-vscode-border px-2 py-1 text-vscode-text opacity-80 hover:bg-vscode-hover hover:opacity-100"
                                >
                                    import ref
                                </button>
                                <button
                                    onClick={() => handleImportSnapshotClick('target')}
                                    disabled={!importedSnapshot}
                                    className={[
                                        'rounded border border-vscode-border px-2 py-1 text-vscode-text opacity-80 hover:bg-vscode-hover hover:opacity-100',
                                        importedSnapshot ? '' : 'cursor-not-allowed opacity-40',
                                    ].join(' ')}
                                >
                                    import target
                                </button>
                                {importedSnapshot && (
                                    <button
                                        onClick={() => handleClearImportedSnapshot('reference')}
                                        className="rounded border border-vscode-border px-2 py-1 text-vscode-text opacity-80 hover:bg-vscode-hover hover:opacity-100"
                                        title="Clear imported reference snapshot"
                                    >
                                        <span className="inline-flex items-center gap-1">
                                            <Trash2 size={12} />
                                            clear ref
                                        </span>
                                    </button>
                                )}
                                {importedTargetSnapshot && (
                                    <button
                                        onClick={() => handleClearImportedSnapshot('target')}
                                        className="rounded border border-vscode-border px-2 py-1 text-vscode-text opacity-80 hover:bg-vscode-hover hover:opacity-100"
                                        title="Clear imported target snapshot"
                                    >
                                        <span className="inline-flex items-center gap-1">
                                            <Trash2 size={12} />
                                            clear target
                                        </span>
                                    </button>
                                )}
                            </div>
                            <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] opacity-70">
                                <div className="rounded border border-vscode-border/70 bg-vscode-bg px-2 py-1.5">
                                    {importedSnapshot ? `ref: ${importedSnapshotLabel}` : 'ref: not loaded'}
                                </div>
                                <div className="rounded border border-vscode-border/70 bg-vscode-bg px-2 py-1.5">
                                    {importedTargetSnapshot ? `target: ${importedTargetSnapshotLabel}` : 'target: not loaded'}
                                </div>
                            </div>
                            {importError && <div className="mt-2 text-rose-300">{importError}</div>}
                        </div>

                        <div className="rounded-md border border-vscode-border bg-vscode-sidebar px-3 py-2 text-[12px] text-vscode-text">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] uppercase tracking-[0.18em] opacity-60">Comparison Summary</span>
                                {comparisonSummaryTarget && (
                                    <button
                                        onClick={comparisonClearAction}
                                        className="ml-auto rounded border border-vscode-border px-2 py-1 text-vscode-text opacity-80 hover:bg-vscode-hover hover:opacity-100"
                                        title={comparisonClearTitle}
                                    >
                                        <span className="inline-flex items-center gap-1">
                                            <Trash2 size={12} />
                                            {comparisonClearLabel}
                                        </span>
                                    </button>
                                )}
                            </div>
                            {activeComparison.hasBaseline ? (
                                <div className="mt-2 space-y-2">
                                    <div>
                                        {`Startup Δ ${formatDelta(activeComparison.startupDeltaMs, 'ms')}`}
                                        {' · '}
                                        {`Project Δ ${formatDelta(activeComparison.latestProjectLoadDeltaMs, 'ms')}`}
                                        {' · '}
                                        {`Events Δ ${formatDelta(activeComparison.totalEventsDelta, 'count')}`}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2 text-[11px] opacity-75">
                                        <span>{`${activeComparison.regressions.length} regressions`}</span>
                                        <span>·</span>
                                        <span>{`${activeComparison.improvements.length} improvements`}</span>
                                        <span>·</span>
                                        <span>{`${activeComparison.operationDeltas.length} deltas tracked`}</span>
                                    </div>
                                    {activeComparison.regressions.length === 0 ? (
                                        <div className="opacity-60">No operation regressions above baseline.</div>
                                    ) : (
                                        <div className="space-y-1">
                                            {activeComparison.regressions.map((regression) => (
                                                <div key={regression.name} className="flex items-center justify-between gap-3">
                                                    <span className="truncate text-vscode-textActive">{regression.name}</span>
                                                    <span className="shrink-0 font-mono text-amber-300">{formatDelta(regression.deltaMs, 'ms')}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {activeComparison.improvements.length > 0 && (
                                        <div className="space-y-1">
                                            <div className="text-[11px] uppercase tracking-[0.16em] text-vscode-text opacity-55">Top Improvements</div>
                                            {activeComparison.improvements.map((improvement) => (
                                                <div key={improvement.name} className="flex items-center justify-between gap-3">
                                                    <span className="truncate text-vscode-textActive">{improvement.name}</span>
                                                    <span className="shrink-0 font-mono text-emerald-300">{formatDelta(improvement.deltaMs, 'ms')}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {activeComparisonMode === 'baseline' && baselineRecord?.note && (
                                        <div className="rounded border border-vscode-border/70 bg-vscode-bg px-2 py-1.5 text-[11px] opacity-80">
                                            {baselineRecord.note}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="mt-2 opacity-60">{comparisonEmptyState}</div>
                            )}
                        </div>

                        <div className="rounded-md border border-vscode-border bg-vscode-sidebar px-3 py-2 text-[12px] text-vscode-text">
                            {`Cache: H ${activeSummary.cache.hits} · M ${activeSummary.cache.misses} · I ${activeSummary.cache.invalidations} · E ${activeSummary.cache.evictions}`}
                        </div>

                        {thresholdConfig.error && (
                            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-200">
                                {`Threshold config fallback active: ${thresholdConfig.error}`}
                            </div>
                        )}

                        <OperationsTable operations={visibleOperations} comparison={activeComparison} />
                        <Sparkline points={activeDisplaySnapshot.sparkline} />
                        <TimelineList timeline={activeDisplaySnapshot.timeline} />
                    </div>
                )}
            </div>
        </div>
    );
}