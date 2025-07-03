export type PerfEntryKind = 'mark' | 'measure';

export interface PerfEntry {
    id: number;
    kind: PerfEntryKind;
    name: string;
    timestamp: number;
    durationMs?: number;
    detail?: string;
}

type PerfListener = (entry: PerfEntry) => void;

const listeners = new Set<PerfListener>();
const recentEntries: PerfEntry[] = [];
const MAX_RECENT_ENTRIES = 200;
let sequence = 0;
let loggingEnabled = false;

function pushEntry(entry: PerfEntry): void {
    recentEntries.push(entry);
    if (recentEntries.length > MAX_RECENT_ENTRIES) {
        recentEntries.splice(0, recentEntries.length - MAX_RECENT_ENTRIES);
    }

    if (loggingEnabled) {
        for (const listener of listeners) {
            listener(entry);
        }
    }
}

function nextId(): number {
    sequence += 1;
    return sequence;
}

export function setPerfLoggingEnabled(enabled: boolean): void {
    loggingEnabled = enabled;
}

export function subscribePerfEntries(listener: PerfListener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function getRecentPerfEntries(): PerfEntry[] {
    return [...recentEntries];
}

export function markPerf(name: string, detail?: string): void {
    const id = nextId();
    const markName = `avr8js:${name}:mark:${id}`;
    performance.mark(markName);
    pushEntry({
        id,
        kind: 'mark',
        name,
        timestamp: performance.now(),
        detail,
    });
    performance.clearMarks(markName);
}

export function startPerfMeasure(name: string, detail?: string): () => number {
    const id = nextId();
    const startMark = `avr8js:${name}:start:${id}`;
    const endMark = `avr8js:${name}:end:${id}`;
    const measureName = `avr8js:${name}:measure:${id}`;
    performance.mark(startMark);

    return () => {
        performance.mark(endMark);
        performance.measure(measureName, startMark, endMark);

        const entries = performance.getEntriesByName(measureName, 'measure');
        const lastEntry = entries.length > 0 ? entries[entries.length - 1] : undefined;
        const durationMs = lastEntry?.duration ?? 0;

        pushEntry({
            id,
            kind: 'measure',
            name,
            timestamp: performance.now(),
            durationMs,
            detail,
        });

        performance.clearMarks(startMark);
        performance.clearMarks(endMark);
        performance.clearMeasures(measureName);
        return durationMs;
    };
}

export function measureSync<T>(name: string, fn: () => T, detail?: string): T {
    const end = startPerfMeasure(name, detail);
    try {
        return fn();
    } finally {
        end();
    }
}

export async function measureAsync<T>(name: string, fn: () => Promise<T>, detail?: string): Promise<T> {
    const end = startPerfMeasure(name, detail);
    try {
        return await fn();
    } finally {
        end();
    }
}

export function formatPerfEntry(entry: PerfEntry): string {
    const detail = entry.detail ? ` (${entry.detail})` : '';
    if (entry.kind === 'mark') {
        return `[perf] mark ${entry.name}${detail}`;
    }
    const duration = (entry.durationMs ?? 0).toFixed(1);
    return `[perf] ${entry.name}: ${duration} ms${detail}`;
}