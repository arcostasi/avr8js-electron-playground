/**
 * SerialPlotter
 * Real-time chart that parses numeric values and labels from serial output.
 * Supports multiple labeled series, pause/resume snapshot, sample window control,
 * interactive channel visibility + dynamic Y rescaling, hover crosshair tooltip, and CSV export.
 */
import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { Check, Copy, Pause, Play, Trash2 } from 'lucide-react';
import {
    formatPlotCsv,
    MAX_PLOT_SAMPLES,
    parsePlotData,
    type PlotData,
} from './serial-plotter-parser';

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

const SAMPLE_WINDOWS = [50, 100, 200, 500];

const PLOT_PAD = { left: 48, right: 12, top: 12, bottom: 24 };

interface SerialPlotterProps {
    /** The full accumulated serial output string */
    output: string;
}

interface PlotThemePalette {
    bgColor: string;
    gridColor: string;
    axisColor: string;
    labelColor: string;
}

function readPlotPalette(canvas: HTMLCanvasElement): PlotThemePalette {
    const css = getComputedStyle(canvas);
    return {
        bgColor: css.getPropertyValue('--vsc-sidebar').trim() || '#252526',
        gridColor: css.getPropertyValue('--vsc-surface').trim() || '#1a1a1a',
        axisColor: css.getPropertyValue('--vsc-border').trim() || '#3c3c3c',
        labelColor: css.getPropertyValue('--vsc-text-2').trim() || '#6a6a6a',
    };
}

function formatCompactValue(value: number): string {
    if (Number.isInteger(value)) return String(value);
    if (Math.abs(value) >= 100) return value.toFixed(1);
    return Number(value.toFixed(2)).toString();
}

function computeVisibleBounds(data: PlotData, visibleIndices: number[]) {
    let minVal = Infinity;
    let maxVal = -Infinity;
    let maxLen = 0;

    for (const idx of visibleIndices) {
        const s = data.series[idx];
        if (!s) continue;
        if (s.length > maxLen) maxLen = s.length;
        for (const v of s) {
            if (v < minVal) minVal = v;
            if (v > maxVal) maxVal = v;
        }
    }

    if (!Number.isFinite(minVal) || !Number.isFinite(maxVal)) {
        return null;
    }

    return { minVal, maxVal, maxLen };
}

interface PlotCanvasProps {
    data: PlotData;
    visibleIndices: number[];
    hiddenChannels: ReadonlySet<number>;
}

const PlotCanvas = React.memo(function PlotCanvas({
    data,
    visibleIndices,
    hiddenChannels,
}: Readonly<PlotCanvasProps>) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const paletteRef = useRef<PlotThemePalette | null>(null);
    const [themeTick, setThemeTick] = useState(0);
    const [size, setSize] = useState({ width: 0, height: 0 });
    const [hoverX, setHoverX] = useState<number | null>(null);

    const bounds = useMemo(() => computeVisibleBounds(data, visibleIndices), [data, visibleIndices]);

    const hoverInfo = useMemo(() => {
        if (hoverX === null || !bounds || bounds.maxLen === 0 || size.width <= 0) return null;
        const plotW = Math.max(1, size.width - PLOT_PAD.left - PLOT_PAD.right);
        const ratio = bounds.maxLen > 1
            ? Math.min(1, Math.max(0, (hoverX - PLOT_PAD.left) / plotW))
            : 0;
        const sampleIndex = bounds.maxLen > 1 ? Math.round(ratio * (bounds.maxLen - 1)) : 0;
        const snappedX = bounds.maxLen > 1
            ? PLOT_PAD.left + (sampleIndex / (bounds.maxLen - 1)) * plotW
            : PLOT_PAD.left;
        return { sampleIndex, snappedX };
    }, [bounds, hoverX, size.width]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        paletteRef.current = readPlotPalette(canvas);

        const update = () => {
            const rect = canvas.getBoundingClientRect();
            setSize({
                width: Math.max(1, Math.floor(rect.width)),
                height: Math.max(1, Math.floor(rect.height)),
            });
        };

        update();
        const resizeObserver = new ResizeObserver(update);
        resizeObserver.observe(canvas);

        const themeObserver = new MutationObserver(() => {
            paletteRef.current = readPlotPalette(canvas);
            setThemeTick((tick) => tick + 1);
        });
        themeObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['class', 'data-theme'],
        });

        return () => {
            resizeObserver.disconnect();
            themeObserver.disconnect();
        };
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const palette = paletteRef.current ?? readPlotPalette(canvas);
        paletteRef.current = palette;

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
        const plotW = Math.max(1, drawW - PLOT_PAD.left - PLOT_PAD.right);
        const plotH = Math.max(1, drawH - PLOT_PAD.top - PLOT_PAD.bottom);

        ctx.clearRect(0, 0, drawW, drawH);
        const { bgColor, gridColor, axisColor, labelColor } = palette;
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, drawW, drawH);

        if (data.series.length === 0) {
            ctx.fillStyle = labelColor;
            ctx.font = '13px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('No numeric data yet...', drawW / 2, drawH / 2);
            return;
        }

        if (!bounds || visibleIndices.length === 0) {
            ctx.fillStyle = labelColor;
            ctx.font = '12px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('All channels hidden — click legend to show', drawW / 2, drawH / 2);
            return;
        }

        let globalMin = bounds.minVal;
        let globalMax = bounds.maxVal;
        if (globalMin === globalMax) {
            globalMin -= 1;
            globalMax += 1;
        }
        const range = globalMax - globalMin;

        ctx.strokeStyle = gridColor;
        ctx.lineWidth = 1;
        const gridLines = 5;
        for (let i = 0; i <= gridLines; i++) {
            const y = PLOT_PAD.top + (i / gridLines) * plotH;
            ctx.beginPath();
            ctx.moveTo(PLOT_PAD.left, y);
            ctx.lineTo(PLOT_PAD.left + plotW, y);
            ctx.stroke();

            const val = globalMax - (i / gridLines) * range;
            ctx.fillStyle = labelColor;
            ctx.font = '10px monospace';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillText(formatCompactValue(val), PLOT_PAD.left - 4, y);
        }

        ctx.strokeStyle = axisColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(PLOT_PAD.left, PLOT_PAD.top);
        ctx.lineTo(PLOT_PAD.left, PLOT_PAD.top + plotH);
        ctx.lineTo(PLOT_PAD.left + plotW, PLOT_PAD.top + plotH);
        ctx.stroke();

        const maxLen = bounds.maxLen;
        for (let si = 0; si < data.series.length; si++) {
            if (hiddenChannels.has(si)) continue;
            const s = data.series[si];
            if (s.length < 2) continue;

            ctx.beginPath();
            ctx.strokeStyle = SERIES_COLORS[si % SERIES_COLORS.length];
            ctx.lineWidth = 1.5;

            for (let i = 0; i < s.length; i++) {
                const x = PLOT_PAD.left + (i / (maxLen - 1)) * plotW;
                const y = PLOT_PAD.top + (1 - (s[i] - globalMin) / range) * plotH;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
        }

        if (hoverInfo) {
            ctx.save();
            ctx.strokeStyle = labelColor;
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.moveTo(hoverInfo.snappedX, PLOT_PAD.top);
            ctx.lineTo(hoverInfo.snappedX, PLOT_PAD.top + plotH);
            ctx.stroke();
            ctx.restore();

            for (const si of visibleIndices) {
                const s = data.series[si];
                const val = s?.[hoverInfo.sampleIndex];
                if (val === undefined) continue;
                const y = PLOT_PAD.top + (1 - (val - globalMin) / range) * plotH;
                ctx.beginPath();
                ctx.arc(hoverInfo.snappedX, y, 3.5, 0, Math.PI * 2);
                ctx.fillStyle = SERIES_COLORS[si % SERIES_COLORS.length];
                ctx.fill();
                ctx.strokeStyle = bgColor;
                ctx.lineWidth = 1;
                ctx.stroke();
            }
        }
    }, [bounds, data.series, hiddenChannels, hoverInfo, size.height, size.width, themeTick, visibleIndices]);

    const placeTooltipRight = hoverInfo ? hoverInfo.snappedX < size.width * 0.65 : true;

    return (
        <div className="relative w-full h-full">
            <canvas
                ref={canvasRef}
                onMouseMove={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setHoverX(e.clientX - rect.left);
                }}
                onMouseLeave={() => setHoverX(null)}
                className="w-full h-full cursor-crosshair"
                style={{ display: 'block' }}
            />
            {hoverInfo && visibleIndices.length > 0 && (
                <div
                    className={[
                        'pointer-events-none absolute top-2 z-10',
                        'rounded border border-vscode-border bg-vscode-panel/95',
                        'px-2 py-1.5 text-[11px] font-mono shadow-lg',
                    ].join(' ')}
                    style={{
                        left: placeTooltipRight
                            ? `${Math.min(size.width - 120, hoverInfo.snappedX + 10)}px`
                            : undefined,
                        right: placeTooltipRight
                            ? undefined
                            : `${Math.max(8, size.width - hoverInfo.snappedX + 10)}px`,
                    }}
                >
                    <div className="text-vscode-text opacity-65 mb-1">
                        Sample #{hoverInfo.sampleIndex + 1}
                    </div>
                    <div className="flex flex-col gap-0.5">
                        {visibleIndices.map((idx) => {
                            const val = data.series[idx]?.[hoverInfo.sampleIndex];
                            if (val === undefined) return null;
                            const color = SERIES_COLORS[idx % SERIES_COLORS.length];
                            return (
                                <div key={idx} className="flex items-center justify-between gap-3">
                                    <span className="flex items-center gap-1.5" style={{ color }}>
                                        <span
                                            className="inline-block w-2 h-2 rounded-full"
                                            style={{ background: color }}
                                        />
                                        {data.labels[idx]}
                                    </span>
                                    <span className="text-vscode-textActive">
                                        {formatCompactValue(val)}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
});

const SerialPlotter = React.memo(function SerialPlotter({ output }: Readonly<SerialPlotterProps>) {
    const [cleared, setCleared] = useState('');
    const [sampleWindow, setSampleWindow] = useState(MAX_PLOT_SAMPLES);
    const [isPaused, setIsPaused] = useState(false);
    const [frozenData, setFrozenData] = useState<PlotData | null>(null);
    const [hiddenChannels, setHiddenChannels] = useState<Set<number>>(() => new Set());
    const [copiedCsv, setCopiedCsv] = useState(false);
    const copyTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);

    useEffect(() => () => {
        if (copyTimerRef.current !== null) {
            globalThis.clearTimeout(copyTimerRef.current);
        }
    }, []);

    const effectiveOutput = output.startsWith(cleared) ? output.slice(cleared.length) : output;
    const liveData = useMemo(
        () => parsePlotData(effectiveOutput, sampleWindow),
        [effectiveOutput, sampleWindow],
    );
    const displayData = isPaused && frozenData ? frozenData : liveData;

    const visibleIndices = useMemo(
        () => displayData.series.map((_, idx) => idx).filter((idx) => !hiddenChannels.has(idx)),
        [displayData.series, hiddenChannels],
    );

    const visibleBounds = useMemo(
        () => computeVisibleBounds(displayData, visibleIndices),
        [displayData, visibleIndices],
    );

    const handleTogglePause = useCallback(() => {
        setIsPaused((prev) => {
            const next = !prev;
            setFrozenData(next ? liveData : null);
            return next;
        });
    }, [liveData]);

    const handleToggleChannel = useCallback((idx: number) => {
        setHiddenChannels((prev) => {
            const next = new Set(prev);
            if (next.has(idx)) {
                next.delete(idx);
            } else {
                next.add(idx);
            }
            return next;
        });
    }, []);

    const handleCopyCsv = useCallback(() => {
        const csv = formatPlotCsv(displayData, visibleIndices);
        if (!csv) return;
        void navigator.clipboard.writeText(csv);
        setCopiedCsv(true);
        if (copyTimerRef.current !== null) {
            globalThis.clearTimeout(copyTimerRef.current);
        }
        copyTimerRef.current = globalThis.setTimeout(() => {
            setCopiedCsv(false);
            copyTimerRef.current = null;
        }, 1500);
    }, [displayData, visibleIndices]);

    const handleClear = useCallback(() => {
        setCleared(output);
        setFrozenData(null);
        setIsPaused(false);
    }, [output]);

    const sampleCount = displayData.series[0]?.length ?? 0;

    return (
        <div className="flex flex-col h-full bg-vscode-sidebar">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2 px-3 py-1.5 bg-vscode-sidebar border-b border-vscode-border shrink-0">
                <button
                    type="button"
                    onClick={handleTogglePause}
                    title={isPaused ? 'Resume live plotting' : 'Pause live plotting'}
                    className={[
                        'flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] transition-colors',
                        isPaused
                            ? 'border-amber-500/50 bg-amber-500/15 text-amber-300'
                            : 'border-vscode-border text-vscode-text opacity-75 hover:opacity-100 hover:bg-vscode-hover',
                    ].join(' ')}
                >
                    {isPaused ? <Play size={11} /> : <Pause size={11} />}
                    <span>{isPaused ? 'Resume' : 'Pause'}</span>
                </button>

                <label className="flex items-center gap-1 text-[11px] text-vscode-text opacity-75">
                    <span>Window</span>
                    <select
                        value={sampleWindow}
                        onChange={(e) => setSampleWindow(Number(e.target.value))}
                        title="Sample window size"
                        className={[
                            'bg-vscode-input text-[11px] text-vscode-text',
                            'border border-vscode-border rounded px-1.5 py-0.5 outline-none cursor-pointer',
                        ].join(' ')}
                    >
                        {SAMPLE_WINDOWS.map((win) => (
                            <option key={win} value={win}>
                                {win}
                            </option>
                        ))}
                    </select>
                </label>

                <div className="flex-1 flex flex-wrap items-center justify-end gap-1.5 min-w-0">
                    {displayData.series.map((s, i) => {
                        const isHidden = hiddenChannels.has(i);
                        const color = SERIES_COLORS[i % SERIES_COLORS.length];
                        const label = displayData.labels[i] ?? `Ch${i + 1}`;
                        const latest = s.length > 0 ? formatCompactValue(s[s.length - 1]) : '—';
                        return (
                            <button
                                key={`${i}-${label}`}
                                type="button"
                                onClick={() => handleToggleChannel(i)}
                                title={isHidden ? `Show ${label}` : `Hide ${label}`}
                                className={[
                                    'flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] transition-opacity',
                                    isHidden
                                        ? 'border-transparent opacity-40 line-through hover:opacity-70'
                                        : 'border-vscode-border/70 bg-vscode-bg/40 hover:bg-vscode-hover',
                                ].join(' ')}
                            >
                                <span
                                    className="inline-block w-2.5 h-2 rounded-sm shrink-0"
                                    style={{ background: color }}
                                />
                                <span style={{ color }}>{label}</span>
                                <span className="text-vscode-textActive font-mono">{latest}</span>
                            </button>
                        );
                    })}
                </div>

                <div className="flex items-center gap-0.5 shrink-0">
                    <button
                        type="button"
                        onClick={handleCopyCsv}
                        disabled={sampleCount === 0 || visibleIndices.length === 0}
                        title={copiedCsv ? 'CSV copied!' : 'Copy visible channels as CSV'}
                        className={[
                            'p-1 rounded transition-colors',
                            sampleCount === 0 || visibleIndices.length === 0
                                ? 'text-vscode-text opacity-25 cursor-not-allowed'
                                : copiedCsv
                                    ? 'text-green-400 bg-green-500/10'
                                    : 'text-vscode-text opacity-65 hover:opacity-100 hover:bg-vscode-hover',
                        ].join(' ')}
                    >
                        {copiedCsv ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                    <button
                        type="button"
                        onClick={handleClear}
                        title="Clear plot"
                        className="text-vscode-text opacity-65 hover:opacity-100 hover:bg-vscode-hover p-1 rounded"
                    >
                        <Trash2 size={12} />
                    </button>
                </div>
            </div>

            {/* Canvas */}
            <div className="flex-1 relative overflow-hidden p-0">
                <PlotCanvas
                    data={displayData}
                    visibleIndices={visibleIndices}
                    hiddenChannels={hiddenChannels}
                />
            </div>

            {/* Footer info */}
            <div className="px-3 py-1 border-t border-vscode-border text-[11px] text-vscode-text opacity-65 flex flex-wrap items-center gap-4">
                <span>{sampleCount} samples</span>
                <span>
                    {visibleIndices.length}/{displayData.series.length}{' '}
                    channel{displayData.series.length !== 1 ? 's' : ''}
                </span>
                {visibleBounds && (
                    <span className="font-mono">
                        Min {formatCompactValue(visibleBounds.minVal)} · Max {formatCompactValue(visibleBounds.maxVal)}
                    </span>
                )}
                {isPaused && (
                    <span className="text-amber-300 font-medium">Paused</span>
                )}
                <span className="opacity-65 ml-auto truncate">
                    Supports CSV or label:value (click legend to toggle series)
                </span>
            </div>
        </div>
    );
});

export default SerialPlotter;
