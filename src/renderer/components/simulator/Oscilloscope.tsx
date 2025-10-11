/**
 * Oscilloscope / Logic Analyzer
 * Samples digital port states at ~30fps and renders step waveforms.
 * Renders channels from the active MCU profile ports.
 * Each channel displays as a digital HIGH/LOW waveform over a rolling time window.
 */
import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { CpuSnapshot } from '../../hooks/useSimulation';

const SAMPLE_INTERVAL_MS = 33;  // ~30fps
const MAX_SAMPLES = 300;

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

interface ChannelData {
    key: string;
    label: string;
    color: string;
    samples: boolean[]; // true = HIGH
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

export default function Oscilloscope({ isPlaying, getCpuSnapshot }: Readonly<OscilloscopeProps>) {
    const [channels, setChannels] = useState<ChannelData[]>([]);
    const channelDescriptorsRef = useRef<ChannelDescriptor[]>([]);
    const samplesRef = useRef<boolean[][]>([]);

    const syncChannelsFromSnapshot = useCallback((snapshot: CpuSnapshot): ChannelDescriptor[] => {
        const nextDescriptors = buildChannelDescriptors(snapshot);
        if (hasSameChannelLayout(channelDescriptorsRef.current, nextDescriptors)) {
            return channelDescriptorsRef.current;
        }

        const previousEnabledByKey = new Map(channels.map((channel) => [channel.key, channel.enabled]));
        channelDescriptorsRef.current = nextDescriptors;
        samplesRef.current = nextDescriptors.map((): boolean[] => []);
        setChannels(nextDescriptors.map((channel, index): ChannelData => ({
            key: channel.key,
            label: channel.label,
            color: COLORS[index % COLORS.length],
            samples: [],
            enabled: previousEnabledByKey.get(channel.key) ?? index < 8,
        })));
        return nextDescriptors;
    }, [channels]);

    const sample = useCallback(() => {
        const snap = getCpuSnapshot();
        if (!snap) return;

        const descriptors = syncChannelsFromSnapshot(snap);
        const newSamples = descriptors.map((channel) => {
            const port = snap.ports[channel.portIndex];
            return Boolean(((port?.value ?? 0) >> channel.bit) & 1);
        });

        for (let i = 0; i < descriptors.length; i++) {
            samplesRef.current[i] = [...samplesRef.current[i], newSamples[i]].slice(-MAX_SAMPLES);
        }

        setChannels(prev => prev.map((ch, i) => ({
            ...ch,
            samples: samplesRef.current[i],
        })));
    }, [getCpuSnapshot, syncChannelsFromSnapshot]);

    useEffect(() => {
        if (!isPlaying) {
            channelDescriptorsRef.current = [];
            samplesRef.current = [];
            setChannels(prev => prev.map(ch => ({ ...ch, samples: [] as boolean[] })));
            return;
        }
        const iv = setInterval(sample, SAMPLE_INTERVAL_MS);
        return () => clearInterval(iv);
    }, [isPlaying, sample]);

    const toggleChannel = (i: number) => {
        setChannels(prev => prev.map((ch, idx) =>
            idx === i ? { ...ch, enabled: !ch.enabled } : ch
        ));
    };

    const enabledChannels = channels.filter(ch => ch.enabled);

    return (
        <div className="flex flex-col h-full bg-vscode-panel text-[12px] font-mono overflow-hidden">
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
                {!isPlaying && (
                    <span className="text-amber-400 text-[11px]">— paused —</span>
                )}
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* Channel list / toggle */}
                <div className="w-24 border-r border-vscode-border flex flex-col overflow-y-auto shrink-0 py-1">
                    {channels.map((ch, i) => (
                        <button
                            key={ch.key}
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
                                color={ch.color}
                                samples={ch.samples}
                            />
                        ))
                    )}
                </div>
            </div>

            {!isPlaying && channels[0].samples.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-vscode-text opacity-30 pointer-events-none text-[12px]">
                    Start simulation to capture waveforms.
                </div>
            )}
        </div>
    );
}

function drawWaveform(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    color: string,
    samples: boolean[],
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

    if (samples.length < 2) {
        return;
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    const stepWidth = (width - padX) / (MAX_SAMPLES - 1);

    for (let i = 0; i < samples.length; i++) {
        const x = padX + i * stepWidth;
        const y = samples[i] ? high : low;

        if (i === 0) {
            ctx.moveTo(x, y);
            continue;
        }

        const previousY = samples[i - 1] ? high : low;
        if (y !== previousY) {
            ctx.lineTo(x, previousY);
            ctx.lineTo(x, y);
        }
        ctx.lineTo(x, y);
    }
    ctx.stroke();
}

function WaveformRow({ color, samples }: Readonly<{
    color: string; samples: boolean[];
}>) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        drawWaveform(ctx, canvas.width, canvas.height, color, samples);
    }, [samples, color]);

    return (
        <div className="flex items-center border-b border-vscode-border" style={{ height: 36 }}>
            <canvas
                ref={canvasRef}
                width={800}
                height={36}
                className="w-full"
                style={{ height: 36, display: 'block' }}
            />
        </div>
    );
}
