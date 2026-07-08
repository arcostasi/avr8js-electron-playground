export const MAX_PLOT_SAMPLES = 200;
const EXTRA_TRAILING_LINES = 48;

export interface PlotData {
    labels: string[];
    series: number[][];
}

interface ParsedPoint {
    label: string | null;
    value: number;
}

const KEY_VALUE_TOKEN_RE = /^([A-Za-z_][A-Za-z0-9_.\-/]*?)[:=]([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)$/;
const KEY_ONLY_TOKEN_RE = /^([A-Za-z_][A-Za-z0-9_.\-/]*?)[:=]$/;

/**
 * Extracts only the trailing lines needed to produce `maxSamples` numeric rows
 * so large serial logs do not require splitting/regex-parsing from byte 0.
 */
function extractTrailingSlice(output: string, maxLines: number): string {
    if (output.length === 0) return '';

    let linesSeen = 0;
    let cursor = output.length - 1;
    while (cursor >= 0 && linesSeen < maxLines) {
        const nlIdx = output.lastIndexOf('\n', cursor);
        if (nlIdx < 0) {
            return output;
        }
        linesSeen += 1;
        cursor = nlIdx - 1;
    }

    const startIdx = output.indexOf('\n', cursor + 1);
    return startIdx >= 0 ? output.slice(startIdx + 1) : output;
}

function parsePlotLine(line: string): ParsedPoint[] {
    const trimmed = line.trim();
    if (!trimmed) return [];

    const tokens = trimmed.split(/[\s,;|]+/);
    const points: ParsedPoint[] = [];
    let pendingLabel: string | null = null;

    for (const token of tokens) {
        if (!token) continue;

        const keyValueMatch = KEY_VALUE_TOKEN_RE.exec(token);
        if (keyValueMatch) {
            const num = Number(keyValueMatch[2]);
            if (!Number.isNaN(num) && Number.isFinite(num)) {
                points.push({ label: keyValueMatch[1], value: num });
            }
            pendingLabel = null;
            continue;
        }

        const keyOnlyMatch = KEY_ONLY_TOKEN_RE.exec(token);
        if (keyOnlyMatch) {
            pendingLabel = keyOnlyMatch[1];
            continue;
        }

        const num = Number(token);
        if (!Number.isNaN(num) && Number.isFinite(num)) {
            points.push({ label: pendingLabel, value: num });
            pendingLabel = null;
            continue;
        }

        pendingLabel = null;
    }

    return points;
}

/**
 * Parses a serial output string into labeled numeric channel series capped at `maxSamples`.
 * Supports raw numeric CSV/space/semicolon lines, `key:value` / `key=value`,
 * and labeled telemetry lines such as `ADC: 352 | Voltage: 1.72 V`.
 */
export function parsePlotData(output: string, maxSamples = MAX_PLOT_SAMPLES): PlotData {
    const tail = extractTrailingSlice(output, maxSamples + EXTRA_TRAILING_LINES);
    const rows: ParsedPoint[][] = [];
    const lines = tail.split('\n');

    for (const line of lines) {
        const points = parsePlotLine(line);
        if (points.length > 0) {
            rows.push(points);
        }
    }

    if (rows.length === 0) {
        return { labels: [], series: [] };
    }

    const cappedRows = rows.length > maxSamples ? rows.slice(rows.length - maxSamples) : rows;
    let seriesCount = 0;
    for (const row of cappedRows) {
        if (row.length > seriesCount) seriesCount = row.length;
    }

    const labels: string[] = Array.from({ length: seriesCount }, (_, index) => `Ch${index + 1}`);
    const series: number[][] = Array.from({ length: seriesCount }, (): number[] => []);

    for (const row of cappedRows) {
        for (let i = 0; i < seriesCount; i++) {
            const point = row[i];
            if (point?.label) {
                labels[i] = point.label;
            }
            series[i].push(point ? point.value : 0);
        }
    }

    return { labels, series };
}

/**
 * Backward-compatible helper returning only numeric channel series.
 */
export function parseSeriesData(output: string, maxSamples = MAX_PLOT_SAMPLES): number[][] {
    return parsePlotData(output, maxSamples).series;
}

/**
 * Formats parsed plot data (optionally restricted to visible channels) as CSV.
 */
export function formatPlotCsv(data: PlotData, visibleIndices?: number[]): string {
    const indices = (visibleIndices ?? data.labels.map((_, idx) => idx))
        .filter((idx) => idx >= 0 && idx < data.series.length);

    if (indices.length === 0) return '';

    let sampleCount = 0;
    for (const idx of indices) {
        if (data.series[idx].length > sampleCount) {
            sampleCount = data.series[idx].length;
        }
    }

    const header = ['sample', ...indices.map((idx) => data.labels[idx] ?? `Ch${idx + 1}`)].join(',');
    const lines = [header];
    for (let sampleIdx = 0; sampleIdx < sampleCount; sampleIdx++) {
        const values = indices.map((idx) => String(data.series[idx][sampleIdx] ?? 0));
        lines.push(`${sampleIdx},${values.join(',')}`);
    }
    return lines.join('\n');
}
