import { beforeEach, describe, expect, it } from 'vitest';
import {
    clearPerfPanelBaseline,
    parsePerfSessionSnapshotJson,
    readPerfPanelBaselines,
    readPerfPanelPreferences,
    selectPerfPanelBaseline,
    updatePerfPanelBaseline,
    writePerfPanelPreferences,
    writePerfPanelBaseline,
} from './perf-panel-storage';

const VALID_SNAPSHOT_JSON = JSON.stringify({
    exportedAt: '2026-03-07T12:00:00.000Z',
    sessionStartedAt: 10,
    thresholds: {},
    summary: {
        sessionElapsedMs: 50,
        totalEvents: 1,
        totalMeasures: 1,
        lastEventName: 'renderer-app-startup',
        startupDurationMs: 50,
        latestProjectLoadMs: null,
        cache: { hits: 0, misses: 0, invalidations: 0, evictions: 0 },
    },
    operations: [],
    domainSummaries: [],
    timeline: [],
    sparkline: [],
    entries: [],
});

function createStorageMock(): Storage {
    const store = new Map<string, string>();

    return {
        get length() {
            return store.size;
        },
        clear() {
            store.clear();
        },
        getItem(key: string) {
            return store.get(key) ?? null;
        },
        key(index: number) {
            return [...store.keys()][index] ?? null;
        },
        removeItem(key: string) {
            store.delete(key);
        },
        setItem(key: string, value: string) {
            store.set(key, value);
        },
    };
}

describe('perf-panel-storage', () => {
    beforeEach(() => {
        Object.defineProperty(globalThis, 'localStorage', {
            value: createStorageMock(),
            configurable: true,
            writable: true,
        });
        localStorage.clear();
    });

    it('parses a valid perf session snapshot json payload', () => {
        const snapshot = parsePerfSessionSnapshotJson(VALID_SNAPSHOT_JSON);

        expect(snapshot.exportedAt).toBe('2026-03-07T12:00:00.000Z');
        expect(snapshot.sessionStartedAt).toBe(10);
    });

    it('rejects invalid snapshot payloads', () => {
        expect(() => parsePerfSessionSnapshotJson('{"foo":1}')).toThrow(/exportedAt/i);
    });

    it('stores multiple named baselines and selects the latest save', async () => {
        const snapshot = parsePerfSessionSnapshotJson(VALID_SNAPSHOT_JSON);

        const firstCollection = await writePerfPanelBaseline(snapshot, 'Cold Start', 'fresh app boot');
        const secondCollection = await writePerfPanelBaseline(snapshot, 'Warm Start', 'second run');

        expect(firstCollection.baselines).toHaveLength(1);
        expect(secondCollection.baselines).toHaveLength(2);
        expect(secondCollection.baselines[0]?.name).toBe('Warm Start');
        expect(secondCollection.baselines[0]?.note).toBe('second run');
        expect(secondCollection.selectedId).toBe(secondCollection.baselines[0]?.id);
    });

    it('updates the selected baseline metadata', async () => {
        const snapshot = parsePerfSessionSnapshotJson(VALID_SNAPSHOT_JSON);
        const collection = await writePerfPanelBaseline(snapshot, 'Cold Start', 'before tuning');
        const targetId = collection.selectedId;

        expect(targetId).toBeTruthy();

        const updated = await updatePerfPanelBaseline(targetId ?? '', {
            name: 'Cold Start v2',
            note: 'after config cleanup',
        });

        expect(updated.baselines[0]?.name).toBe('Cold Start v2');
        expect(updated.baselines[0]?.note).toBe('after config cleanup');
    });

    it('selects and clears individual baselines', async () => {
        const snapshot = parsePerfSessionSnapshotJson(VALID_SNAPSHOT_JSON);
        const collection = await writePerfPanelBaseline(snapshot, 'Cold Start');
        const second = await writePerfPanelBaseline(snapshot, 'Warm Start');
        const targetId = collection.baselines[0]?.id;

        expect(targetId).toBeTruthy();

        const selected = await selectPerfPanelBaseline(targetId);
        expect(selected.selectedId).toBe(targetId);

        const cleared = await clearPerfPanelBaseline(targetId);
        expect(cleared.baselines).toHaveLength(1);
        expect(cleared.baselines[0]?.id).toBe(second.baselines[0]?.id);
    });

    it('migrates the legacy single-baseline payload', async () => {
        const snapshot = parsePerfSessionSnapshotJson(VALID_SNAPSHOT_JSON);
        localStorage.setItem('avr8js-perf-panel-baseline-v1', JSON.stringify({
            savedAt: '2026-03-07T10:00:00.000Z',
            snapshot,
        }));

        const collection = await readPerfPanelBaselines();

        expect(collection.baselines).toHaveLength(1);
        expect(collection.baselines[0]?.name).toMatch(/^Baseline 1/);
        expect(collection.baselines[0]?.note).toBe('');
        expect(collection.selectedId).toBe(collection.baselines[0]?.id);
        expect(localStorage.getItem('avr8js-perf-panel-baseline-v1')).toBeNull();
    });

    it('persists perf panel preferences with sane defaults', async () => {
        await expect(readPerfPanelPreferences()).resolves.toEqual({
            comparisonMode: 'baseline',
            sortBy: 'recent',
            regressionThresholdMs: 0,
        });

        const written = await writePerfPanelPreferences({
            comparisonMode: 'imported-pair',
            sortBy: 'delta',
            regressionThresholdMs: 75,
        });

        expect(written).toEqual({
            comparisonMode: 'imported-pair',
            sortBy: 'delta',
            regressionThresholdMs: 75,
        });
        await expect(readPerfPanelPreferences()).resolves.toEqual(written);
    });
});