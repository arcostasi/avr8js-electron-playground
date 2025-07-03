import type { PerfSessionSnapshot } from './perf-dashboard';
import { deletePersistedEntry, readPersistedJson, writePersistedJson } from './renderer-persist';

export interface PerfRendererMemorySnapshot {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
    utilization: number;
}

export interface PerfPanelBaselineRecord {
    id: string;
    name: string;
    note: string;
    savedAt: string;
    snapshot: PerfSessionSnapshot;
}

export interface PerfPanelBaselineCollection {
    selectedId: string | null;
    baselines: PerfPanelBaselineRecord[];
}

export interface PerfPanelPreferences {
    comparisonMode: 'baseline' | 'imported-live' | 'imported-pair';
    sortBy: 'recent' | 'last' | 'avg' | 'p95' | 'max' | 'count' | 'name' | 'delta';
    regressionThresholdMs: number;
}

const LEGACY_PERF_BASELINE_STORAGE_KEY = 'avr8js-perf-panel-baseline-v1';
const PERF_PANEL_STORAGE_SCOPE = 'perf-panel';
const PERF_PANEL_BASELINES_FILE = 'baselines-v2.json';
const PERF_PANEL_PREFERENCES_FILE = 'preferences-v1.json';

const DEFAULT_PERF_PANEL_PREFERENCES: PerfPanelPreferences = {
    comparisonMode: 'baseline',
    sortBy: 'recent',
    regressionThresholdMs: 0,
};

type PerformanceWithMemory = Performance & {
    memory?: {
        usedJSHeapSize: number;
        totalJSHeapSize: number;
        jsHeapSizeLimit: number;
    };
};

export function captureRendererMemorySnapshot(): PerfRendererMemorySnapshot | null {
    const perf = performance as PerformanceWithMemory;
    const memory = perf.memory;
    if (!memory) return null;

    const { usedJSHeapSize, totalJSHeapSize, jsHeapSizeLimit } = memory;
    if ([usedJSHeapSize, totalJSHeapSize, jsHeapSizeLimit].some((value) => !Number.isFinite(value) || value <= 0)) {
        return null;
    }

    return {
        usedJSHeapSize,
        totalJSHeapSize,
        jsHeapSizeLimit,
        utilization: usedJSHeapSize / jsHeapSizeLimit,
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function isPerfSessionSnapshotLike(value: unknown): value is PerfSessionSnapshot {
    if (!isRecord(value)) return false;

    return typeof value.exportedAt === 'string'
        && isFiniteNumber(value.sessionStartedAt)
        && isRecord(value.summary)
        && Array.isArray(value.operations)
        && Array.isArray(value.entries);
}

function sanitizeBaselineRecord(value: unknown): PerfPanelBaselineRecord | null {
    if (!isRecord(value)) return null;
    if (typeof value.id !== 'string' || typeof value.name !== 'string' || typeof value.savedAt !== 'string') {
        return null;
    }
    if (!('snapshot' in value) || !isPerfSessionSnapshotLike(value.snapshot)) return null;

    return {
        id: value.id,
        name: value.name,
        note: typeof value.note === 'string' ? value.note : '',
        savedAt: value.savedAt,
        snapshot: value.snapshot,
    };
}

function normalizeBaselineName(name: string | undefined, savedAt: string, total: number): string {
    const trimmed = name?.trim();
    return trimmed || defaultBaselineName(savedAt, total);
}

function normalizeBaselineNote(note?: string): string {
    return note?.trim().slice(0, 160) ?? '';
}

function isPerfPanelPreferences(value: unknown): value is PerfPanelPreferences {
    if (!isRecord(value)) return false;

    const comparisonModes = new Set<PerfPanelPreferences['comparisonMode']>(['baseline', 'imported-live', 'imported-pair']);
    const sortKeys = new Set<PerfPanelPreferences['sortBy']>(['recent', 'last', 'avg', 'p95', 'max', 'count', 'name', 'delta']);

    return comparisonModes.has(value.comparisonMode as PerfPanelPreferences['comparisonMode'])
        && sortKeys.has(value.sortBy as PerfPanelPreferences['sortBy'])
        && isFiniteNumber(value.regressionThresholdMs)
        && value.regressionThresholdMs >= 0;
}

async function persistPerfPanelBaselines(collection: PerfPanelBaselineCollection): Promise<void> {
    await writePersistedJson(PERF_PANEL_STORAGE_SCOPE, PERF_PANEL_BASELINES_FILE, collection);
}

function createBaselineId(): string {
    return `baseline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function defaultBaselineName(savedAt: string, total: number): string {
    const date = new Date(savedAt);
    const timeLabel = Number.isNaN(date.getTime())
        ? savedAt
        : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return `Baseline ${total} · ${timeLabel}`;
}

async function migrateLegacyBaselineRecord(): Promise<PerfPanelBaselineCollection> {
    try {
        const raw = localStorage.getItem(LEGACY_PERF_BASELINE_STORAGE_KEY);
        if (!raw) {
            return {
                selectedId: null,
                baselines: [],
            };
        }

        const parsed = JSON.parse(raw) as Partial<PerfPanelBaselineRecord>;
        if (!parsed || typeof parsed !== 'object' || typeof parsed.savedAt !== 'string' || !isPerfSessionSnapshotLike(parsed.snapshot)) {
            return {
                selectedId: null,
                baselines: [],
            };
        }

        const migrated: PerfPanelBaselineRecord = {
            id: createBaselineId(),
            name: defaultBaselineName(parsed.savedAt, 1),
            note: '',
            savedAt: parsed.savedAt,
            snapshot: parsed.snapshot,
        };
        const collection = {
            selectedId: migrated.id,
            baselines: [migrated],
        } satisfies PerfPanelBaselineCollection;
        await persistPerfPanelBaselines(collection);
        localStorage.removeItem(LEGACY_PERF_BASELINE_STORAGE_KEY);
        return collection;
    } catch {
        return {
            selectedId: null,
            baselines: [],
        };
    }
}

export async function readPerfPanelBaselines(): Promise<PerfPanelBaselineCollection> {
    const parsed = await readPersistedJson<Partial<PerfPanelBaselineCollection> | null>(
        PERF_PANEL_STORAGE_SCOPE,
        PERF_PANEL_BASELINES_FILE,
        null,
    );
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.baselines)) {
        return migrateLegacyBaselineRecord();
    }

    const baselines = parsed.baselines
        .map((baseline) => sanitizeBaselineRecord(baseline))
        .filter((baseline): baseline is PerfPanelBaselineRecord => baseline !== null)
        .sort((left, right) => right.savedAt.localeCompare(left.savedAt));

    const selectedId = typeof parsed.selectedId === 'string' && baselines.some((baseline) => baseline.id === parsed.selectedId)
        ? parsed.selectedId
        : baselines[0]?.id ?? null;

    return {
        selectedId,
        baselines,
    };
}

export async function readPerfPanelBaseline(): Promise<PerfPanelBaselineRecord | null> {
    const collection = await readPerfPanelBaselines();
    return collection.baselines.find((baseline) => baseline.id === collection.selectedId) ?? null;
}

export async function writePerfPanelBaseline(
    snapshot: PerfSessionSnapshot,
    name?: string,
    note?: string,
): Promise<PerfPanelBaselineCollection> {
    const current = await readPerfPanelBaselines();
    const savedAt = new Date().toISOString();
    const record: PerfPanelBaselineRecord = {
        id: createBaselineId(),
        name: normalizeBaselineName(name, savedAt, current.baselines.length + 1),
        note: normalizeBaselineNote(note),
        savedAt,
        snapshot,
    };

    const collection: PerfPanelBaselineCollection = {
        selectedId: record.id,
        baselines: [record, ...current.baselines].sort((left, right) => right.savedAt.localeCompare(left.savedAt)),
    };

    await persistPerfPanelBaselines(collection);
    return collection;
}

export async function updatePerfPanelBaseline(
    id: string,
    updates: { name?: string; note?: string },
): Promise<PerfPanelBaselineCollection> {
    const current = await readPerfPanelBaselines();
    const baselines = current.baselines.map((baseline, index) => {
        if (baseline.id !== id) return baseline;

        return {
            ...baseline,
            name: normalizeBaselineName(updates.name, baseline.savedAt, index + 1),
            note: updates.note === undefined ? baseline.note : normalizeBaselineNote(updates.note),
        } satisfies PerfPanelBaselineRecord;
    });

    const collection = {
        selectedId: current.selectedId,
        baselines,
    } satisfies PerfPanelBaselineCollection;

    await persistPerfPanelBaselines(collection);
    return collection;
}

export async function selectPerfPanelBaseline(id: string): Promise<PerfPanelBaselineCollection> {
    const current = await readPerfPanelBaselines();
    if (!current.baselines.some((baseline) => baseline.id === id)) return current;

    const collection = {
        selectedId: id,
        baselines: current.baselines,
    } satisfies PerfPanelBaselineCollection;

    await persistPerfPanelBaselines(collection);
    return collection;
}

export async function clearPerfPanelBaseline(id?: string): Promise<PerfPanelBaselineCollection> {
    const current = await readPerfPanelBaselines();
    const targetId = id ?? current.selectedId;
    if (!targetId) return current;

    const baselines = current.baselines.filter((baseline) => baseline.id !== targetId);
    const collection = {
        selectedId: baselines[0]?.id ?? null,
        baselines,
    } satisfies PerfPanelBaselineCollection;

    if (baselines.length === 0) {
        await deletePersistedEntry(PERF_PANEL_STORAGE_SCOPE, PERF_PANEL_BASELINES_FILE);
    } else {
        await persistPerfPanelBaselines(collection);
    }

    return collection;
}

export async function readPerfPanelPreferences(): Promise<PerfPanelPreferences> {
    const parsed = await readPersistedJson<unknown>(
        PERF_PANEL_STORAGE_SCOPE,
        PERF_PANEL_PREFERENCES_FILE,
        null,
    );
    if (!isPerfPanelPreferences(parsed)) {
        return { ...DEFAULT_PERF_PANEL_PREFERENCES };
    }

    return {
        comparisonMode: parsed.comparisonMode,
        sortBy: parsed.sortBy,
        regressionThresholdMs: parsed.regressionThresholdMs,
    };
}

export async function writePerfPanelPreferences(preferences: PerfPanelPreferences): Promise<PerfPanelPreferences> {
    const normalized: PerfPanelPreferences = {
        comparisonMode: preferences.comparisonMode,
        sortBy: preferences.sortBy,
        regressionThresholdMs: Math.max(0, preferences.regressionThresholdMs),
    };

    await writePersistedJson(PERF_PANEL_STORAGE_SCOPE, PERF_PANEL_PREFERENCES_FILE, normalized);

    return normalized;
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

export function parsePerfSessionSnapshotJson(raw: string): PerfSessionSnapshot {
    const parsed = JSON.parse(raw) as Partial<PerfSessionSnapshot>;

    if (!parsed || typeof parsed !== 'object') {
        throw new TypeError('Snapshot must be a JSON object.');
    }

    if (typeof parsed.exportedAt !== 'string') {
        throw new TypeError('Snapshot is missing exportedAt.');
    }

    if (!isFiniteNumber(parsed.sessionStartedAt)) {
        throw new TypeError('Snapshot is missing sessionStartedAt.');
    }

    if (!parsed.summary || typeof parsed.summary !== 'object') {
        throw new TypeError('Snapshot is missing summary.');
    }

    if (!Array.isArray(parsed.operations)) {
        throw new TypeError('Snapshot is missing operations.');
    }

    if (!Array.isArray(parsed.entries)) {
        throw new TypeError('Snapshot is missing entries.');
    }

    return parsed as PerfSessionSnapshot;
}