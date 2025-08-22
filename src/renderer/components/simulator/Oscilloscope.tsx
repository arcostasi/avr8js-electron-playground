/**
 * Oscilloscope / Logic Analyzer
 * Samples digital port states at ~30fps and renders step waveforms.
 * Shows PORTB (D8-D13), PORTC (A0-A5), PORTD (D0-D7) — 24 channels total.
 * Each channel displays as a digital HIGH/LOW waveform over a rolling time window.
 */
import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { CpuSnapshot } from '../../hooks/useSimulation';

const SAMPLE_INTERVAL_MS = 33;  // ~30fps
const MAX_SAMPLES = 300;

// Port → pin labels
const CHANNELS: { port: 'portB' | 'portC' | 'portD'; bit: number; label: string }[] = [
    ...Array.from({ length: 6 }, (_, i) => ({ port: 'portB' as const, bit: i, label: `D${i + 8}` })),
    ...Array.from({ length: 6 }, (_, i) => ({ port: 'portC' as const, bit: i, label: `A${i}` })),
    ...Array.from({ length: 8 }, (_, i) => ({ port: 'portD' as const, bit: i, label: `D${i}` })),
];

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
    label: string;
    color: string;
    samples: boolean[]; // true = HIGH
    enabled: boolean;
}

export default function Oscilloscope({ isPlaying, getCpuSnapshot }: OscilloscopeProps) {
    const [channels, setChannels] = useState<ChannelData[]>(() =>
        CHANNELS.map((ch, i): ChannelData => ({
            label: ch.label,
            color: COLORS[i % COLORS.length],
            samples: [],
            enabled: i < 8, // Show first 8 channels by default
        }))
    );

    const samplesRef = useRef<boolean[][]>(CHANNELS.map((): boolean[] => []));

    const sample = useCallback(() => {
        const snap = getCpuSnapshot();
        if (!snap) return;

        const newSamples = CHANNELS.map(ch => Boolean((snap[ch.port] >> ch.bit) & 1));
        for (let i = 0; i < CHANNELS.length; i++) {
            samplesRef.current[i] = [...samplesRef.current[i], newSamples[i]].slice(-MAX_SAMPLES);
        }
        // Trigger a React re-render by copying refs
        setChannels(prev => prev.map((ch, i) => ({
            ...ch,
            samples: samplesRef.current[i],
        })));
    }, [getCpuSnapshot]);

    useEffect(() => {
        if (!isPlaying) {
            // Reset samples when stopping
            samplesRef.current = CHANNELS.map((): boolean[] => []);
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
                <div className="w-20 border-r border-vscode-border flex flex-col overflow-y-auto shrink-0 py-1">
                    {channels.map((ch, i) => (
                        <button
                            key={ch.label}
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
                            Enable channels on the left to see waveforms.
                        </div>
                    ) : (
                        enabledChannels.map(ch => (
                            <WaveformRow
                                key={ch.label}
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

function WaveformRow({ color, samples }: {
    color: string; samples: boolean[];
}) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const W = canvas.width;
        const H = canvas.height;
        const padX = 0;
        const high = H * 0.15;
        const low = H * 0.85;

        ctx.clearRect(0, 0, W, H);
        // Read theme from computed CSS variable on canvas element
        const isLight = !!canvasRef.current?.closest('.theme-light');
        const bgFill = isLight ? '#ebebeb' : '#0d0d0d';
        const midLine = isLight ? '#d8d8d8' : '#1a1a1a';
        ctx.fillStyle = bgFill;
        ctx.fillRect(0, 0, W, H);

        // Center line
        ctx.strokeStyle = midLine;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, H / 2);
        ctx.lineTo(W, H / 2);
        ctx.stroke();

        if (samples.length < 2) return;

        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();

        const stepW = (W - padX) / (MAX_SAMPLES - 1);

        for (let i = 0; i < samples.length; i++) {
            const x = padX + i * stepW;
            const y = samples[i] ? high : low;

            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                // Step: vertical line to new level, then horizontal
                const prevY = samples[i - 1] ? high : low;
                if (y !== prevY) {
                    ctx.lineTo(x, prevY);
                    ctx.lineTo(x, y);
                }
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();
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
