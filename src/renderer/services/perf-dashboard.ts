import type { PerfEntry } from '../utils/perf';

export type PerfDomain =
    | 'bootstrap'
    | 'projects'
    | 'diagram'
    | 'monaco'
    | 'simulator'
    | 'autosave'
    | 'custom-chips'
    | 'other';

export type PerfSeverity = 'good' | 'warn' | 'bad' | 'neutral';
export type PerfThresholdConfig = Record<string, number>;

export interface PerfDashboardOperation {
    name: string;
    domain: PerfDomain;
    count: number;
    measureCount: number;
    thresholdMs: number;
    lastDurationMs: number | null;
    avgDurationMs: number | null;
    p95DurationMs: number | null;
    maxDurationMs: number | null;
    lastDetail: string;
    lastTimestamp: number;
    severity: PerfSeverity;
}

export interface PerfDashboardDomainSummary {
    domain: PerfDomain;
    operationCount: number;
    measureCount: number;
    avgDurationMs: number | null;
    maxDurationMs: number | null;
    severity: PerfSeverity;
}

export interface PerfDashboardTimelinePoint {
    id: number;
    name: string;
    domain: PerfDomain;
    timestamp: number;
    durationMs: number | null;
    detail: string;
    severity: PerfSeverity;
    kind: PerfEntry['kind'];
}

export interface PerfDashboardCacheSummary {
    hits: number;
    misses: number;
    invalidations: number;
    evictions: number;
}

export interface PerfDashboardSummary {
    sessionElapsedMs: number;
    totalEvents: number;
    totalMeasures: number;
    lastEventName: string;
    startupDurationMs: number | null;
    latestProjectLoadMs: number | null;
    cache: PerfDashboardCacheSummary;
}

export interface PerfDashboardState {
    summary: PerfDashboardSummary;
    operations: PerfDashboardOperation[];
    domainSummaries: PerfDashboardDomainSummary[];
    timeline: PerfDashboardTimelinePoint[];
    sparkline: Array<{
        id: number;
        durationMs: number;
        severity: PerfSeverity;
        label: string;
    }>;
}

export interface PerfSessionSnapshot {
    exportedAt: string;
    sessionStartedAt: number;
    thresholds: PerfThresholdConfig;
    summary: PerfDashboardSummary;
    operations: PerfDashboardOperation[];
    domainSummaries: PerfDashboardDomainSummary[];
    timeline: PerfDashboardTimelinePoint[];
    sparkline: PerfDashboardState['sparkline'];
    entries: PerfEntry[];
}

export interface PerfOperationDelta {
    name: string;
    currentDurationMs: number;
    baselineDurationMs: number;
    deltaMs: number;
}

export interface PerfBaselineComparison {
    hasBaseline: boolean;
    startupDeltaMs: number | null;
    latestProjectLoadDeltaMs: number | null;
    sessionElapsedDeltaMs: number | null;
    totalEventsDelta: number | null;
    totalMeasuresDelta: number | null;
    operationDeltas: PerfOperationDelta[];
    regressions: PerfOperationDelta[];
    improvements: PerfOperationDelta[];
}

type MutableOperation = {
    name: string;
    domain: PerfDomain;
    count: number;
    durations: number[];
    lastDurationMs: number | null;
    maxDurationMs: number | null;
    lastDetail: string;
    lastTimestamp: number;
};

export const DEFAULT_THRESHOLD_CONFIG: PerfThresholdConfig = {
    'renderer-app-startup': 1200,
    'startup-load-first-project': 250,
    'project-select-load': 250,
    'project-refresh-load': 250,
    'project-load*': 250,
    'project-discovery*': 500,
    'monaco-*': 300,
    'simulation-*': 400,
};

const DEFAULT_THRESHOLD_MS = 100;

function percentile(values: number[], ratio: number): number | null {
    if (values.length === 0) return null;

    const sorted = [...values].sort((left, right) => left - right);
    const index = Math.max(0, Math.ceil(sorted.length * ratio) - 1);
    return sorted[Math.min(index, sorted.length - 1)] ?? null;
}

function average(values: number[]): number | null {
    if (values.length === 0) return null;
    const total = values.reduce((sum, value) => sum + value, 0);
    return total / values.length;
}

function parseCacheCounters(detail: string): Partial<PerfDashboardCacheSummary> {
    const counters: Partial<PerfDashboardCacheSummary> = {};
    const matches = detail.matchAll(/(hits|misses|invalidations|evictions)=(\d+)/g);
    for (const match of matches) {
        const metric = match[1] as keyof PerfDashboardCacheSummary;
        counters[metric] = Number(match[2]);
    }
    return counters;
}

export function parsePerfThresholdConfig(raw: string): {
    thresholds: PerfThresholdConfig;
    error: string | null;
} {
    try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('Threshold config must be a JSON object.');
        }

        const thresholds = { ...DEFAULT_THRESHOLD_CONFIG };
        for (const [key, value] of Object.entries(parsed)) {
            if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) {
                throw new Error(`Threshold for ${key} must be a positive number.`);
            }
            thresholds[key] = value;
        }

        return { thresholds, error: null };
    } catch (error) {
        return {
            thresholds: { ...DEFAULT_THRESHOLD_CONFIG },
            error: error instanceof Error ? error.message : 'Invalid threshold config.',
        };
    }
}

export function resolvePerfThresholdMs(name: string, thresholds: PerfThresholdConfig = DEFAULT_THRESHOLD_CONFIG): number {
    const exactMatch = thresholds[name];
    if (typeof exactMatch === 'number') return exactMatch;

    let bestPrefixLength = -1;
    let resolvedThreshold = DEFAULT_THRESHOLD_MS;

    for (const [pattern, thresholdMs] of Object.entries(thresholds)) {
        if (!pattern.endsWith('*')) continue;
        const prefix = pattern.slice(0, -1);
        if (!name.startsWith(prefix) || prefix.length <= bestPrefixLength) continue;
        bestPrefixLength = prefix.length;
        resolvedThreshold = thresholdMs;
    }

    return resolvedThreshold;
}

function severityFromDuration(durationMs: number | null, thresholdMs: number): PerfSeverity {
    if (durationMs === null) return 'neutral';
    if (durationMs <= thresholdMs) return 'good';
    if (durationMs <= thresholdMs * 1.25) return 'warn';
    return 'bad';
}

function worstSeverity(left: PerfSeverity, right: PerfSeverity): PerfSeverity {
    const ranking: Record<PerfSeverity, number> = {
        neutral: 0,
        good: 1,
        warn: 2,
        bad: 3,
    };
    return ranking[left] >= ranking[right] ? left : right;
}

export function classifyPerfDomain(name: string): PerfDomain {
    if (name.startsWith('renderer-') || name.startsWith('startup-')) return 'bootstrap';
    if (name.startsWith('project-')) return 'projects';
    if (name.startsWith('diagram-')) return 'diagram';
    if (name.startsWith('monaco-')) return 'monaco';
    if (name.startsWith('simulation-')) return 'simulator';
    if (name.startsWith('autosave-')) return 'autosave';
    if (name.startsWith('custom-chips:') || name.startsWith('chip-')) return 'custom-chips';
    return 'other';
}

function updateOperationMetrics(operationMap: Map<string, MutableOperation>, entry: PerfEntry): void {
    const operation = operationMap.get(entry.name) ?? {
        name: entry.name,
        domain: classifyPerfDomain(entry.name),
        count: 0,
        durations: [],
        lastDurationMs: null,
        maxDurationMs: null,
        lastDetail: '',
        lastTimestamp: 0,
    };

    operation.count += 1;
    operation.lastDetail = entry.detail ?? operation.lastDetail;
    operation.lastTimestamp = entry.timestamp;

    if (entry.kind === 'measure' && typeof entry.durationMs === 'number') {
        operation.durations.push(entry.durationMs);
        operation.lastDurationMs = entry.durationMs;
        operation.maxDurationMs = operation.maxDurationMs === null
            ? entry.durationMs
            : Math.max(operation.maxDurationMs, entry.durationMs);
    }

    operationMap.set(entry.name, operation);
}

function accumulateCacheSummary(cache: PerfDashboardCacheSummary, entry: PerfEntry): void {
    if (entry.name === 'project-load-cache:hit') {
        cache.hits += 1;
        return;
    }

    if (!entry.name.startsWith('project-discovery-cache:') || !entry.detail) {
        return;
    }

    const counters = parseCacheCounters(entry.detail);
    cache.hits += counters.hits ?? 0;
    cache.misses += counters.misses ?? 0;
    cache.invalidations += counters.invalidations ?? 0;
    cache.evictions += counters.evictions ?? 0;
}

function buildOperationSummaries(
    operationMap: Map<string, MutableOperation>,
    thresholds: PerfThresholdConfig,
): PerfDashboardOperation[] {
    return [...operationMap.values()]
        .map<PerfDashboardOperation>((operation) => {
            const avgDurationMs = average(operation.durations);
            const p95DurationMs = percentile(operation.durations, 0.95);
            const thresholdMs = resolvePerfThresholdMs(operation.name, thresholds);
            const severity = severityFromDuration(
                operation.lastDurationMs ?? p95DurationMs ?? avgDurationMs,
                thresholdMs,
            );

            return {
                name: operation.name,
                domain: operation.domain,
                count: operation.count,
                measureCount: operation.durations.length,
                thresholdMs,
                lastDurationMs: operation.lastDurationMs,
                avgDurationMs,
                p95DurationMs,
                maxDurationMs: operation.maxDurationMs,
                lastDetail: operation.lastDetail,
                lastTimestamp: operation.lastTimestamp,
                severity,
            };
        })
        .sort((left, right) => right.lastTimestamp - left.lastTimestamp);
}

function buildDomainSummaries(operations: PerfDashboardOperation[]): PerfDashboardDomainSummary[] {
    const domainMap = new Map<PerfDomain, PerfDashboardDomainSummary>();

    for (const operation of operations) {
        const current = domainMap.get(operation.domain) ?? {
            domain: operation.domain,
            operationCount: 0,
            measureCount: 0,
            avgDurationMs: null,
            maxDurationMs: null,
            severity: 'neutral' as PerfSeverity,
        };

        current.operationCount += 1;
        current.measureCount += operation.measureCount;
        current.avgDurationMs = current.avgDurationMs === null
            ? operation.avgDurationMs
            : average([
                current.avgDurationMs,
                operation.avgDurationMs ?? current.avgDurationMs,
            ]);
        current.maxDurationMs = current.maxDurationMs === null
            ? operation.maxDurationMs
            : Math.max(current.maxDurationMs, operation.maxDurationMs ?? current.maxDurationMs);
        current.severity = worstSeverity(current.severity, operation.severity);
        domainMap.set(operation.domain, current);
    }

    return [...domainMap.values()].sort((left, right) => left.domain.localeCompare(right.domain));
}

function buildSparkline(entries: PerfEntry[], thresholds: PerfThresholdConfig): PerfDashboardState['sparkline'] {
    return entries
        .filter((entry) => entry.kind === 'measure' && typeof entry.durationMs === 'number')
        .slice(-24)
        .map((entry) => ({
            id: entry.id,
            durationMs: entry.durationMs ?? 0,
            severity: severityFromDuration(entry.durationMs ?? null, resolvePerfThresholdMs(entry.name, thresholds)),
            label: entry.name,
        }));
}

export function buildPerfDashboardState(
    entries: PerfEntry[],
    sessionStartedAt: number,
    thresholds: PerfThresholdConfig = DEFAULT_THRESHOLD_CONFIG,
): PerfDashboardState {
    const operationMap = new Map<string, MutableOperation>();
    const cache: PerfDashboardCacheSummary = {
        hits: 0,
        misses: 0,
        invalidations: 0,
        evictions: 0,
    };

    let lastEventName = 'No events yet';
    let lastTimestamp = sessionStartedAt;

    for (const entry of entries) {
        lastEventName = entry.name;
        lastTimestamp = Math.max(lastTimestamp, entry.timestamp);
        updateOperationMetrics(operationMap, entry);
        accumulateCacheSummary(cache, entry);
    }

    const operations = buildOperationSummaries(operationMap, thresholds);

    const timeline = entries
        .slice(-12)
        .reverse()
        .map<PerfDashboardTimelinePoint>((entry) => ({
            id: entry.id,
            name: entry.name,
            domain: classifyPerfDomain(entry.name),
            timestamp: entry.timestamp,
            durationMs: entry.kind === 'measure' ? entry.durationMs ?? null : null,
            detail: entry.detail ?? '',
            severity: severityFromDuration(entry.durationMs ?? null, resolvePerfThresholdMs(entry.name, thresholds)),
            kind: entry.kind,
        }));

    const totalMeasures = entries.filter((entry) => entry.kind === 'measure').length;
    const startupDurationMs = operations.find((operation) => operation.name === 'renderer-app-startup')?.lastDurationMs ?? null;
    const latestProjectLoadMs = operations.find(
        (operation) => operation.measureCount > 0 && operation.name.includes('project') && operation.name.includes('load'),
    )?.lastDurationMs ?? null;

    return {
        summary: {
            sessionElapsedMs: Math.max(0, lastTimestamp - sessionStartedAt),
            totalEvents: entries.length,
            totalMeasures,
            lastEventName,
            startupDurationMs,
            latestProjectLoadMs,
            cache,
        },
        operations,
        domainSummaries: buildDomainSummaries(operations),
        timeline,
        sparkline: buildSparkline(entries, thresholds),
    };
}

export function buildPerfSessionSnapshot(
    entries: PerfEntry[],
    sessionStartedAt: number,
    thresholds: PerfThresholdConfig = DEFAULT_THRESHOLD_CONFIG,
): PerfSessionSnapshot {
    const dashboard = buildPerfDashboardState(entries, sessionStartedAt, thresholds);

    return {
        exportedAt: new Date().toISOString(),
        sessionStartedAt,
        thresholds: { ...thresholds },
        summary: dashboard.summary,
        operations: dashboard.operations,
        domainSummaries: dashboard.domainSummaries,
        timeline: dashboard.timeline,
        sparkline: dashboard.sparkline,
        entries: entries.map((entry) => ({ ...entry })),
    };
}

export function buildPerfBaselineComparison(
    current: PerfSessionSnapshot,
    baseline: PerfSessionSnapshot | null,
): PerfBaselineComparison {
    if (!baseline) {
        return {
            hasBaseline: false,
            startupDeltaMs: null,
            latestProjectLoadDeltaMs: null,
            sessionElapsedDeltaMs: null,
            totalEventsDelta: null,
            totalMeasuresDelta: null,
            operationDeltas: [],
            regressions: [],
            improvements: [],
        };
    }

    const baselineOperations = new Map(
        baseline.operations
            .filter((operation) => operation.lastDurationMs !== null)
            .map((operation) => [operation.name, operation] as const),
    );

    const operationDeltas = current.operations
        .filter((operation) => operation.lastDurationMs !== null)
        .map((operation) => {
            const previous = baselineOperations.get(operation.name);
            if (previous?.lastDurationMs === undefined || previous.lastDurationMs === null) return null;

            return {
                name: operation.name,
                currentDurationMs: operation.lastDurationMs,
                baselineDurationMs: previous.lastDurationMs,
                deltaMs: operation.lastDurationMs - previous.lastDurationMs,
            } satisfies PerfOperationDelta;
        })
        .filter((operation): operation is PerfOperationDelta => operation !== null)
        .filter((operation) => operation.deltaMs !== 0)
        .sort((left, right) => right.deltaMs - left.deltaMs);

    const regressions = operationDeltas
        .filter((operation) => operation.deltaMs > 0)
        .slice(0, 5);

    const improvements = operationDeltas
        .filter((operation) => operation.deltaMs < 0)
        .sort((left, right) => left.deltaMs - right.deltaMs)
        .slice(0, 5);

    return {
        hasBaseline: true,
        startupDeltaMs: current.summary.startupDurationMs !== null && baseline.summary.startupDurationMs !== null
            ? current.summary.startupDurationMs - baseline.summary.startupDurationMs
            : null,
        latestProjectLoadDeltaMs: current.summary.latestProjectLoadMs !== null && baseline.summary.latestProjectLoadMs !== null
            ? current.summary.latestProjectLoadMs - baseline.summary.latestProjectLoadMs
            : null,
        sessionElapsedDeltaMs: current.summary.sessionElapsedMs - baseline.summary.sessionElapsedMs,
        totalEventsDelta: current.summary.totalEvents - baseline.summary.totalEvents,
        totalMeasuresDelta: current.summary.totalMeasures - baseline.summary.totalMeasures,
        operationDeltas,
        regressions,
        improvements,
    };
}