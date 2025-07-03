import { describe, expect, it } from 'vitest';
import {
    buildPerfBaselineComparison,
    buildPerfDashboardState,
    buildPerfSessionSnapshot,
    classifyPerfDomain,
    parsePerfThresholdConfig,
    resolvePerfThresholdMs,
} from './perf-dashboard';
import type { PerfEntry } from '../utils/perf';

describe('perf-dashboard', () => {
    it('classifies domains from operation names', () => {
        expect(classifyPerfDomain('renderer-app-startup')).toBe('bootstrap');
        expect(classifyPerfDomain('project-select-load')).toBe('projects');
        expect(classifyPerfDomain('monaco-editor-idle-wait')).toBe('monaco');
        expect(classifyPerfDomain('simulation-start')).toBe('simulator');
        expect(classifyPerfDomain('custom-chips:build')).toBe('custom-chips');
        expect(classifyPerfDomain('unknown-op')).toBe('other');
    });

    it('aggregates operation timings and cache counters', () => {
        const entries: PerfEntry[] = [
            { id: 1, kind: 'measure', name: 'renderer-app-startup', timestamp: 100, durationMs: 900 },
            { id: 2, kind: 'measure', name: 'project-select-load', timestamp: 180, durationMs: 180, detail: 'hello-world' },
            { id: 3, kind: 'measure', name: 'project-select-load', timestamp: 240, durationMs: 260, detail: 'ssd1306' },
            { id: 4, kind: 'mark', name: 'project-load-cache:hit', timestamp: 245 },
            { id: 5, kind: 'mark', name: 'project-discovery-cache:builtin-root', timestamp: 250, detail: 'hits=7,misses=2,invalidations=1,evictions=0,projects=10' },
        ];

        const state = buildPerfDashboardState(entries, 50);
        const projectLoad = state.operations.find((operation) => operation.name === 'project-select-load');

        expect(projectLoad).toMatchObject({
            domain: 'projects',
            count: 2,
            measureCount: 2,
            lastDurationMs: 260,
            maxDurationMs: 260,
        });
        expect(projectLoad?.avgDurationMs).toBe(220);
        expect(projectLoad?.p95DurationMs).toBe(260);
        expect(state.summary.cache).toEqual({
            hits: 8,
            misses: 2,
            invalidations: 1,
            evictions: 0,
        });
        expect(state.summary.startupDurationMs).toBe(900);
        expect(state.summary.latestProjectLoadMs).toBe(260);
        expect(state.sparkline).toHaveLength(3);
    });

    it('supports configurable thresholds with exact and wildcard matches', () => {
        const parsed = parsePerfThresholdConfig(JSON.stringify({
            'project-*': 700,
            'project-select-load': 150,
        }));

        expect(parsed.error).toBeNull();
        expect(resolvePerfThresholdMs('project-select-load', parsed.thresholds)).toBe(150);
        expect(resolvePerfThresholdMs('project-open-folder-load-first', parsed.thresholds)).toBe(700);

        const state = buildPerfDashboardState([
            { id: 1, kind: 'measure', name: 'project-select-load', timestamp: 10, durationMs: 180 },
        ], 0, parsed.thresholds);

        expect(state.operations[0]?.thresholdMs).toBe(150);
        expect(state.operations[0]?.severity).toBe('warn');
    });

    it('limits the timeline to the latest 12 events in reverse chronological order', () => {
        const entries: PerfEntry[] = Array.from({ length: 15 }, (_, index) => ({
            id: index + 1,
            kind: 'measure' as const,
            name: `project-load-${index + 1}`,
            timestamp: index * 10,
            durationMs: index + 1,
        }));

        const state = buildPerfDashboardState(entries, 0);

        expect(state.timeline).toHaveLength(12);
        expect(state.timeline[0]?.id).toBe(15);
        expect(state.timeline[11]?.id).toBe(4);
    });

    it('builds an exportable session snapshot with raw entries and derived state', () => {
        const entries: PerfEntry[] = [
            { id: 1, kind: 'measure', name: 'renderer-app-startup', timestamp: 100, durationMs: 800 },
            { id: 2, kind: 'mark', name: 'project-load-cache:hit', timestamp: 150, detail: 'hello-world' },
        ];

        const snapshot = buildPerfSessionSnapshot(entries, 50, {
            'renderer-app-startup': 1200,
        });

        expect(snapshot.sessionStartedAt).toBe(50);
        expect(snapshot.entries).toEqual(entries);
        expect(snapshot.summary.totalEvents).toBe(2);
        expect(snapshot.summary.cache.hits).toBe(1);
        expect(snapshot.operations[0]?.name).toBe('project-load-cache:hit');
        expect(snapshot.exportedAt).toMatch(/T/);
    });

    it('compares a current snapshot against a persisted baseline', () => {
        const baseline = buildPerfSessionSnapshot([
            { id: 1, kind: 'measure', name: 'renderer-app-startup', timestamp: 100, durationMs: 900 },
            { id: 2, kind: 'measure', name: 'project-select-load', timestamp: 150, durationMs: 180 },
            { id: 3, kind: 'measure', name: 'simulation-start', timestamp: 170, durationMs: 90 },
        ], 0);

        const current = buildPerfSessionSnapshot([
            { id: 1, kind: 'measure', name: 'renderer-app-startup', timestamp: 100, durationMs: 1100 },
            { id: 2, kind: 'measure', name: 'project-select-load', timestamp: 150, durationMs: 160 },
            { id: 3, kind: 'measure', name: 'monaco-editor-boot', timestamp: 190, durationMs: 320 },
            { id: 4, kind: 'measure', name: 'simulation-start', timestamp: 210, durationMs: 130 },
        ], 0);

        const comparison = buildPerfBaselineComparison(current, baseline);

        expect(comparison.hasBaseline).toBe(true);
        expect(comparison.startupDeltaMs).toBe(200);
        expect(comparison.latestProjectLoadDeltaMs).toBe(-20);
        expect(comparison.operationDeltas).toHaveLength(3);
        expect(comparison.regressions[0]).toMatchObject({
            name: 'renderer-app-startup',
            deltaMs: 200,
        });
        expect(comparison.improvements[0]).toMatchObject({
            name: 'project-select-load',
            deltaMs: -20,
        });
        expect(comparison.operationDeltas[2]).toMatchObject({
            name: 'project-select-load',
            deltaMs: -20,
        });
    });
});