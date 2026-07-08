/**
 * Oscilloscope / Logic Analyzer
 * Samples digital port states at ~30fps and renders step waveforms.
 * Renders channels from the active MCU profile ports.
 * Each channel displays as a digital HIGH/LOW waveform over a rolling time window.
 */
import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { CpuSnapshot } from '../../hooks/useSimulation';
import { BitRingBuffer } from './oscilloscope-buffer';

const SAMPLE_INTERVAL_MS = 33;  // ~30fps
const MAX_SAMPLES = 300;
const ROW_HEIGHT = 36;

const COLORS = [
    '#38bdf8', '#4ade80', '#fb923c', '#f472b6',
    '#a78bfa', '#fbbf24', '#34d399', '#f87171',
    '#818cf8', '#2dd4bf', '#e879f9', '#38bdf8',
    '#4ade80', '#fb923c', '#f472b6', '#a78bfa',
    '#fbbf24', '#34d399', '#f87171', '#818cf8',
];

interface OscilloscopeProps {
    isPlaying: boolean;
    getCpuSnapshot: () => CpuSnapshot | null;
}

interface ChannelMeta {
    key: string;
    label: string;
    color: string;
    enabled: boolean;
}

interface ChannelDescriptor {
    key: string;
    portIndex: number;
    bit: number;
    label: string;
}

function buildChannelDescriptors(snapshot: CpuSnapshot): ChannelDescriptor[] {
    return snapshot.ports.flatMap((port, portIndex) =>
        Array.from({ length: 8 }, (_, bit): ChannelDescriptor => ({
            key: `${port.id}:${bit}`,
            portIndex,
            bit,
            label: `${port.label}.${bit}`,
        }))
    );
}

function hasSameChannelLayout(a: ChannelDescriptor[], b: ChannelDescriptor[]): boolean {
    return a.length === b.length && a.every((channel, index) => channel.key === b[index]?.key);
}

const Oscilloscope = React.memo(function Oscilloscope({ isPlaying, getCpuSnapshot }: Readonly<OscilloscopeProps>) {
    const [channels, setChannels] = useState<ChannelMeta[]>([]);
    const [hasSamples, setHasSamples] = useState(false);

    const channelDescriptorsRef = useRef<ChannelDescriptor[]>([]);
    const channelsMetaRef = useRef<ChannelMeta[]>([]);
    const buffersRef = useRef<Map<string, BitRingBuffer>>(new Map());
    const canvasElsRef = useRef<Map<string, HTMLCanvasElement>>(new Map());
    const enabledByKeyRef = useRef<Map<string, boolean>>(new Map());
    const hasSamplesRef = useRef(false);
    const rafIdRef = useRef<number | null>(null);

    const drawChannelCanvas = useCallback((ch: ChannelMeta) => {
        const canvas = canvasElsRef.current.get(ch.key);
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const cssWidth = Math.max(1, Math.floor(canvas.clientWidth || 800));
        const dpr = globalThis.devicePixelRatio || 1;
        const backingWidth = Math.max(1, Math.floor(cssWidth * dpr));
        const backingHeight = Math.max(1, Math.floor(ROW_HEIGHT * dpr));
        if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
            canvas.width = backingWidth;
            canvas.height = backingHeight;
        }

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawWaveform(ctx, cssWidth, ROW_HEIGHT, ch.color, buffersRef.current.get(ch.key));
    }, []);

    const scheduleCanvasDraw = useCallback(() => {
        if (rafIdRef.current !== null) return;
        rafIdRef.current = globalThis.requestAnimationFrame(() => {
            rafIdRef.current = null;
            for (const ch of channelsMetaRef.current) {
                if (ch.enabled) {
                    drawChannelCanvas(ch);
                }
            }
        });
    }, [drawChannelCanvas]);

    const registerCanvas = useCallback((channelKey: string, canvas: HTMLCanvasElement | null) => {
        if (!canvas) {
            canvasElsRef.current.delete(channelKey);
            return;
        }
        canvasElsRef.current.set(channelKey, canvas);
        const meta = channelsMetaRef.current.find((candidate) => candidate.key === channelKey);
        if (meta) {
            drawChannelCanvas(meta);
        }
    }, [drawChannelCanvas]);

    const syncChannelsFromSnapshot = useCallback((snapshot: CpuSnapshot): ChannelDescriptor[] => {
        const nextDescriptors = buildChannelDescriptors(snapshot);
        if (hasSameChannelLayout(channelDescriptorsRef.current, nextDescriptors)) {
            return channelDescriptorsRef.current;
        }

        channelDescriptorsRef.current = nextDescriptors;
        const nextBuffers = new Map<string, BitRingBuffer>();
        const nextMeta: ChannelMeta[] = nextDescriptors.map((channel, index) => {
            const enabled = enabledByKeyRef.current.get(channel.key) ?? index < 8;
            enabledByKeyRef.current.set(channel.key, enabled);
            nextBuffers.set(channel.key, new BitRingBuffer(MAX_SAMPLES));
            return {
                key: channel.key,
                label: channel.label,
                color: COLORS[index % COLORS.length],
                enabled,
            };
        });

        buffersRef.current = nextBuffers;
        channelsMetaRef.current = nextMeta;
        setChannels(nextMeta);
        return nextDescriptors;
    }, []);

    const sample = useCallback(() => {
        const snap = getCpuSnapshot();
        if (!snap) return;

        const descriptors = syncChannelsFromSnapshot(snap);
        for (const channel of descriptors) {
            const port = snap.ports[channel.portIndex];
            const bit: 0 | 1 = ((port?.value ?? 0) >> channel.bit) & 1 ? 1 : 0;
            buffersRef.current.get(channel.key)?.push(bit);
        }

        if (!hasSamplesRef.current) {
            hasSamplesRef.current = true;
            setHasSamples(true);
        }

        scheduleCanvasDraw();
    }, [getCpuSnapshot, scheduleCanvasDraw, syncChannelsFromSnapshot]);

    useEffect(() => {
        channelsMetaRef.current = channels;
    }, [channels]);

    useEffect(() => {
        if (!isPlaying) {
            if (rafIdRef.current !== null) {
                globalThis.cancelAnimationFrame(rafIdRef.current);
                rafIdRef.current = null;
            }
            return;
        }

        sample();
        const iv = setInterval(sample, SAMPLE_INTERVAL_MS);
        return () => {
            clearInterval(iv);
            if (rafIdRef.current !== null) {
                globalThis.cancelAnimationFrame(rafIdRef.current);
                rafIdRef.current = null;
            }
        };
    }, [isPlaying, sample]);

    const clearWaveforms = useCallback(() => {
        for (const buf of buffersRef.current.values()) {
            buf.clear();
        }
        for (const ch of channelsMetaRef.current) {
            if (ch.enabled) {
                drawChannelCanvas(ch);
            }
        }
        hasSamplesRef.current = false;
        setHasSamples(false);
    }, [drawChannelCanvas]);

    const toggleChannel = useCallback((index: number) => {
        setChannels((prev) => prev.map((ch, idx) => {
            if (idx !== index) return ch;
            const nextEnabled = !ch.enabled;
            enabledByKeyRef.current.set(ch.key, nextEnabled);
            return { ...ch, enabled: nextEnabled };
        }));
    }, []);

    const enabledChannels = channels.filter(ch => ch.enabled);

    return (
        <div className="relative flex flex-col h-full bg-vscode-panel text-[12px] font-mono overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-vscode-border bg-vscode-surface shrink-0">
                <span className="text-cyan-400 font-bold text-[11px] uppercase tracking-wider">
                    Logic Analyzer
                </span>
                <span className="text-vscode-text opacity-30">—</span>
                <span className="text-vscode-text opacity-50 text-[11px]">
                    {(SAMPLE_INTERVAL_MS).toFixed(0)}ms / sample · {MAX_SAMPLES} samples
                </span>
                <div className="flex-1" />
                {hasSamples && (
                    <button
                        type="button"
                        onClick={clearWaveforms}
                        title="Clear captured waveforms"
                        className="px-2 py-0.5 rounded text-[11px] text-vscode-text opacity-60 hover:opacity-100 hover:bg-vscode-hover"
                    >
                        Clear
                    </button>
                )}
                {!isPlaying && (
                    <span className="text-amber-400 text-[11px]">
                        {hasSamples ? '— stopped (held) —' : '— paused —'}
                    </span>
                )}
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* Channel list / toggle */}
                <div className="w-24 border-r border-vscode-border flex flex-col overflow-y-auto shrink-0 py-1">
                    {channels.map((ch, i) => (
                        <button
                            key={ch.key}
                            type="button"
                            onClick={() => toggleChannel(i)}
                            className={[
                                'flex items-center gap-1.5 px-2 py-0.5',
                                'text-[11px] text-left transition-colors',
                                ch.enabled
                                    ? 'opacity-100'
                                    : 'opacity-30',
                            ].join(' ')}
                        >
                            <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ background: ch.color }}
                            />
                            <span style={{ color: ch.enabled ? ch.color : 'var(--vsc-text-2)' }}>
                                {ch.label}
                            </span>
                        </button>
                    ))}
                </div>

                {/* Waveforms */}
                <div className="flex-1 overflow-y-auto overflow-x-hidden">
                    {enabledChannels.length === 0 ? (
                        <div className="flex items-center justify-center h-full text-vscode-text opacity-30 text-[12px]">
                            {channels.length === 0 ? 'Start simulation to detect MCU ports.' : 'Enable channels on the left to see waveforms.'}
                        </div>
                    ) : (
                        enabledChannels.map(ch => (
                            <WaveformRow
                                key={ch.key}
                                channelKey={ch.key}
                                label={ch.label}
                                color={ch.color}
                                onRegisterCanvas={registerCanvas}
                                onResizeCanvas={() => drawChannelCanvas(ch)}
                            />
                        ))
                    )}
                </div>
            </div>

            {!isPlaying && !hasSamples && (
                <div className="absolute inset-0 flex items-center justify-center text-vscode-text opacity-30 pointer-events-none text-[12px]">
                    Start simulation to capture waveforms.
                </div>
            )}
        </div>
    );
});

export default Oscilloscope;

function drawWaveform(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    color: string,
    buffer?: BitRingBuffer,
): void {
    const padX = 0;
    const high = height * 0.15;
    const low = height * 0.85;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#0d0d0d';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    if (!buffer || buffer.size < 2) {
        return;
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    const stepWidth = (width - padX) / (MAX_SAMPLES - 1);
    const len = buffer.size;
    let previousY = buffer.get(0) === 1 ? high : low;
    ctx.moveTo(padX, previousY);

    for (let i = 1; i < len; i++) {
        const x = padX + i * stepWidth;
        const y = buffer.get(i) === 1 ? high : low;

        if (y !== previousY) {
            ctx.lineTo(x, previousY);
            ctx.lineTo(x, y);
            previousY = y;
        } else if (i === len - 1) {
            ctx.lineTo(x, y);
        }
    }
    ctx.stroke();
}

const WaveformRow = React.memo(function WaveformRow({
    channelKey,
    label,
    color,
    onRegisterCanvas,
    onResizeCanvas,
}: Readonly<{
    channelKey: string;
    label: string;
    color: string;
    onRegisterCanvas: (key: string, canvas: HTMLCanvasElement | null) => void;
    onResizeCanvas: () => void;
}>) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const onResizeRef = useRef(onResizeCanvas);
    onResizeRef.current = onResizeCanvas;

    const handleCanvasRef = useCallback((el: HTMLCanvasElement | null) => {
        canvasRef.current = el;
        onRegisterCanvas(channelKey, el);
    }, [channelKey, onRegisterCanvas]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        onResizeRef.current();
        const observer = new ResizeObserver(() => onResizeRef.current());
        observer.observe(canvas);
        return () => observer.disconnect();
    }, [channelKey]);

    return (
        <div className="relative flex items-center border-b border-vscode-border" style={{ height: ROW_HEIGHT }}>
            <span
                className={[
                    'pointer-events-none absolute left-1.5 top-1 z-10',
                    'flex items-center gap-1 rounded bg-vscode-panel/85',
                    'border border-vscode-border/60 px-1.5 py-0.5 text-[10px] font-mono',
                ].join(' ')}
                style={{ color }}
            >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                {label}
            </span>
            <canvas
                ref={handleCanvasRef}
                className="w-full"
                style={{ height: ROW_HEIGHT, display: 'block' }}
            />
        </div>
    );
});
