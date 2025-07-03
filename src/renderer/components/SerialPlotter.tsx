/**
 * SerialPlotter
 * Real-time chart that parses comma-separated numeric values from serial output.
 * Supports multiple series (one per comma-delimited column), auto-scaling,
 * and a rolling window of the last N samples.
 */
import React, { useMemo, useRef, useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';

const MAX_SAMPLES = 200;
const SERIES_COLORS = [
    '#38bdf8', // sky-400
    '#4ade80', // green-400
    '#fb923c', // orange-400
    '#f472b6', // pink-400
    '#a78bfa', // violet-400
    '#fbbf24', // amber-400
    '#34d399', // emerald-400
    '#f87171', // red-400
];

interface SerialPlotterProps {
    /** The full accumulated serial output string */
    output: string;
}

/**
 * Parse a text output string into series data.
 * Only lines containing at least one number are used.
 * Each line produces one row; columns are comma / space / tab separated.
 */
function parseSeriesData(output: string): number[][] {
    const rows: number[][] = [];
    const lines = output.split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const parts = trimmed.split(/[\s,;]+/);
        const nums = parts.map(Number).filter(n => !Number.isNaN(n) && isFinite(n));
        if (nums.length > 0) rows.push(nums);
    }

    // Transpose: rows → columns (series)
    if (rows.length === 0) return [];
    const seriesCount = Math.max(...rows.map(r => r.length));
    const series: number[][] = Array.from({ length: seriesCount }, (): number[] => []);
    for (const row of rows) {
        for (let i = 0; i < seriesCount; i++) {
            series[i].push(row[i] ?? 0);
        }
    }
    // Trim each series to the last MAX_SAMPLES
    return series.map(s => s.slice(-MAX_SAMPLES));
}

function PlotCanvas({ series }: { series: number[][] }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [size, setSize] = useState({ width: 0, height: 0 });

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const update = () => {
            const rect = canvas.getBoundingClientRect();
            setSize({
                width: Math.max(1, Math.floor(rect.width)),
                height: Math.max(1, Math.floor(rect.height)),
            });
        };

        update();
        const observer = new ResizeObserver(update);
        observer.observe(canvas);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = globalThis.devicePixelRatio || 1;
        const width = Math.max(1, Math.floor(size.width * dpr));
        const height = Math.max(1, Math.floor(size.height * dpr));
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);

        const drawW = size.width;
        const drawH = size.height;
        const padL = 48, padR = 12, padT = 12, padB = 24;
        const plotW = Math.max(1, drawW - padL - padR);
        const plotH = Math.max(1, drawH - padT - padB);

        // Background
        ctx.clearRect(0, 0, drawW, drawH);
        const css = getComputedStyle(canvas);
        const bgColor = css.getPropertyValue('--vsc-sidebar').trim() || '#252526';
        const gridColor = css.getPropertyValue('--vsc-surface').trim() || '#1a1a1a';
        const axisColor = css.getPropertyValue('--vsc-border').trim() || '#3c3c3c';
        const labelColor = css.getPropertyValue('--vsc-text-2').trim() || '#6a6a6a';
        const noDataTxt = css.getPropertyValue('--vsc-text-2').trim() || '#6a6a6a';
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, drawW, drawH);

        if (series.length === 0) {
            ctx.fillStyle = noDataTxt;
            ctx.font = '13px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('No numeric data yet...', drawW / 2, drawH / 2);
            return;
        }

        // Compute global min/max across all series
        let globalMin = Infinity;
        let globalMax = -Infinity;
        for (const s of series) {
            for (const v of s) {
                if (v < globalMin) globalMin = v;
                if (v > globalMax) globalMax = v;
            }
        }
        if (globalMin === globalMax) { globalMin -= 1; globalMax += 1; }
        const range = globalMax - globalMin;

        // Grid lines
        ctx.strokeStyle = gridColor;
        ctx.lineWidth = 1;
        const gridLines = 5;
        for (let i = 0; i <= gridLines; i++) {
            const y = padT + (i / gridLines) * plotH;
            ctx.beginPath();
            ctx.moveTo(padL, y);
            ctx.lineTo(padL + plotW, y);
            ctx.stroke();

            // Y labels
            const val = globalMax - (i / gridLines) * range;
            ctx.fillStyle = labelColor;
            ctx.font = '10px monospace';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillText(val.toFixed(1), padL - 4, y);
        }

        // Axes
        ctx.strokeStyle = axisColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padL, padT);
        ctx.lineTo(padL, padT + plotH);
        ctx.lineTo(padL + plotW, padT + plotH);
        ctx.stroke();

        // Series lines
        const maxLen = Math.max(...series.map(s => s.length));

        for (let si = 0; si < series.length; si++) {
            const s = series[si];
            if (s.length < 2) continue;
            ctx.beginPath();
            ctx.strokeStyle = SERIES_COLORS[si % SERIES_COLORS.length];
            ctx.lineWidth = 1.5;

            for (let i = 0; i < s.length; i++) {
                const x = padL + (i / (maxLen - 1)) * plotW;
                const y = padT + (1 - (s[i] - globalMin) / range) * plotH;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
        }
    }, [series, size.width, size.height]);

    return (
        <canvas
            ref={canvasRef}
            className="w-full h-full"
            style={{ display: 'block' }}
        />
    );
}

export default function SerialPlotter({ output }: SerialPlotterProps) {
    const [cleared, setCleared] = useState('');

    const effectiveOutput = output.startsWith(cleared) ? output.slice(cleared.length) : output;
    const series = useMemo(() => parseSeriesData(effectiveOutput), [effectiveOutput]);

    const handleClear = () => setCleared(output);

    return (
        <div className="flex flex-col h-full bg-vscode-sidebar">
            {/* Toolbar */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-vscode-sidebar border-b border-vscode-border shrink-0">
                <span className="text-[12px] font-semibold text-vscode-text opacity-60 uppercase tracking-wide">
                    Serial Plotter
                </span>
                <div className="flex-1" />
                {/* Legend */}
                <div className="flex items-center gap-2">
                    {series.map((_, i) => (
                        <span key={i} className="flex items-center gap-1 text-[11px]">
                            <span
                                className="inline-block w-3 h-2 rounded-sm"
                                style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }}
                            />
                            <span style={{ color: SERIES_COLORS[i % SERIES_COLORS.length] }}>
                                Ch{i + 1}
                            </span>
                        </span>
                    ))}
                </div>
                <button
                    onClick={handleClear}
                    title="Clear plot"
                    className="text-vscode-text opacity-50 hover:opacity-100 p-1"
                >
                    <Trash2 size={12} />
                </button>
            </div>

            {/* Canvas */}
            <div className="flex-1 relative overflow-hidden p-0">
                <PlotCanvas series={series} />
            </div>

            {/* Footer info */}
            <div className="px-3 py-1 border-t border-vscode-border text-[11px] text-vscode-text opacity-40 flex gap-4">
                <span>{series[0]?.length ?? 0} samples</span>
                <span>{series.length} channel{series.length !== 1 ? 's' : ''}</span>
                <span className="opacity-60">
                    Format: Serial.print(val1); Serial.print(","); Serial.println(val2);
                </span>
            </div>
        </div>
    );
}
