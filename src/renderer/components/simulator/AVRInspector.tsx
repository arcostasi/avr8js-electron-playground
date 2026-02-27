/**
 * AVRInspector
 * Live panel showing AVR CPU state: R0-R31, SREG, SP, PC, and I/O ports.
 * Refreshes every 200 ms while the simulation is running.
 */
import React, { useState, useEffect } from 'react';
import type { CpuSnapshot } from '../../hooks/useSimulation';
import { RefreshCw } from 'lucide-react';

interface AVRInspectorProps {
    isPlaying: boolean;
    getCpuSnapshot: () => CpuSnapshot | null;
}

const SREG_BITS = ['C', 'Z', 'N', 'V', 'S', 'H', 'T', 'I'] as const;

function hex2(n: number) { return n.toString(16).toUpperCase().padStart(2, '0'); }
function hex4(n: number) { return n.toString(16).toUpperCase().padStart(4, '0'); }

function SREGDisplay({ sreg }: { sreg: number }) {
    return (
        <div className="flex gap-0.5">
            {SREG_BITS.map((bit, i) => {
                const set = (sreg >> i) & 1;
                return (
                    <span
                        key={bit}
                        title={`${bit} (bit ${i})`}
                        className={[
                            'w-5 h-5 flex items-center justify-center',
                            'rounded text-[10px] font-mono font-bold',
                            set
                                ? 'bg-blue-600/40 text-blue-400'
                                : 'bg-vscode-input text-vscode-text opacity-40',
                        ].join(' ')}
                    >
                        {bit}
                    </span>
                );
            })}
        </div>
    );
}

function PortDisplay({ label, value }: { label: string; value: number }) {
    return (
        <div className="flex items-center gap-2">
            <span className="text-[11px] text-vscode-text opacity-50 w-12 font-mono">{label}</span>
            <div className="flex gap-0.5">
                {Array.from({ length: 8 }, (_, i) => {
                    const bit = 7 - i;
                    const set = (value >> bit) & 1;
                    return (
                        <span
                            key={bit}
                            title={`Pin ${bit}`}
                            className={[
                                'w-4 h-4 flex items-center justify-center',
                                'rounded-sm text-[9px] font-mono',
                                set
                                    ? 'bg-green-600/50 text-green-400'
                                    : 'bg-vscode-surface text-vscode-text opacity-30',
                            ].join(' ')}
                        >
                            {bit}
                        </span>
                    );
                })}
            </div>
            <span className="text-[11px] text-vscode-text opacity-50 font-mono">0x{hex2(value)}</span>
        </div>
    );
}

export default function AVRInspector({ isPlaying, getCpuSnapshot }: AVRInspectorProps) {
    const [snapshot, setSnapshot] = useState<CpuSnapshot | null>(null);
    const [paused, setPaused] = useState(false);

    useEffect(() => {
        if (!isPlaying || paused) return;

        const iv = setInterval(() => {
            const snap = getCpuSnapshot();
            if (snap) setSnapshot(snap);
        }, 200);

        return () => clearInterval(iv);
    }, [isPlaying, paused, getCpuSnapshot]);

    // Clear snapshot when stopped
    useEffect(() => {
        if (!isPlaying) setSnapshot(null);
    }, [isPlaying]);

    if (!isPlaying && !snapshot) {
        return (
            <div className="flex items-center justify-center h-full text-vscode-text opacity-40 text-[12px] italic">
                Start the simulation to inspect CPU state.
            </div>
        );
    }

    const regs = snapshot?.registers ?? new Uint8Array(32);
    const sp = snapshot?.sp ?? 0;
    const pc = snapshot?.pc ?? 0;
    const sreg = snapshot?.sreg ?? 0;

    return (
        <div className="flex flex-col h-full overflow-y-auto bg-vscode-panel text-[12px] font-mono">
            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-vscode-border bg-vscode-surface shrink-0">
                <span className="text-purple-400 font-bold text-[11px] uppercase tracking-wider">
                    AVR Inspector
                </span>
                <div className="flex-1" />
                <button
                    onClick={() => setPaused(p => !p)}
                    title={paused ? 'Resume updates' : 'Pause updates'}
                    className={[
                        'flex items-center gap-1 px-2 py-0.5 rounded text-[11px]',
                        paused
                            ? 'bg-amber-600/30 text-amber-300'
                            : 'text-vscode-text opacity-50 hover:opacity-100',
                    ].join(' ')}
                >
                    <RefreshCw size={11} className={paused ? '' : 'animate-spin'} />
                    {paused ? 'Paused' : 'Live'}
                </button>
            </div>

            <div className="px-3 py-2 space-y-3 overflow-y-auto flex-1">
                {/* Special registers */}
                <section>
                    <p className="text-[10px] text-vscode-text opacity-40 uppercase tracking-widest mb-1.5">
                        Special Registers
                    </p>
                    <div className="grid grid-cols-3 gap-x-4 gap-y-1">
                        <div className="flex gap-2 items-center">
                            <span className="text-vscode-text opacity-40 w-6">PC</span>
                            <span className="text-yellow-400">0x{hex4(pc * 2)}</span>
                        </div>
                        <div className="flex gap-2 items-center">
                            <span className="text-vscode-text opacity-40 w-6">SP</span>
                            <span className="text-yellow-400">0x{hex4(sp)}</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-vscode-text opacity-40 w-12 text-[10px]">SREG</span>
                        <SREGDisplay sreg={sreg} />
                        <span className="text-vscode-text opacity-30 ml-1">0x{hex2(sreg)}</span>
                    </div>
                </section>

                {/* I/O Ports */}
                <section>
                    <p className="text-[10px] text-vscode-text opacity-40 uppercase tracking-widest mb-1.5">
                        I/O Ports
                    </p>
                    <div className="space-y-1">
                        <PortDisplay label="PORTB" value={snapshot?.portB ?? 0} />
                        <PortDisplay label="PORTC" value={snapshot?.portC ?? 0} />
                        <PortDisplay label="PORTD" value={snapshot?.portD ?? 0} />
                    </div>
                </section>

                {/* General Purpose Registers R0-R31 */}
                <section>
                    <p className="text-[10px] text-vscode-text opacity-40 uppercase tracking-widest mb-1.5">
                        Registers R0–R31
                    </p>
                    <div className="grid grid-cols-4 gap-x-2 gap-y-0.5">
                        {Array.from({ length: 32 }, (_, i) => (
                            <div key={i} className="flex items-center gap-1">
                                <span className="text-vscode-text opacity-30 w-6 text-right">R{i}</span>
                                <span className="text-vscode-text">{hex2(regs[i])}</span>
                                <span className="text-vscode-text opacity-25 text-[10px]">
                                    ({regs[i]})
                                </span>
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );
}
