/**
 * SerialMonitor
 * Enhanced terminal panel with 3 tabs:
 *  - Monitor  — raw serial output with send capability
 *  - Plotter  — real-time numeric chart
 *  - History  — compilation run history
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    Copy, Trash2, EyeOff, Send,
    Terminal as TerminalIcon,
    Clock, ArrowDownToLine, LineChart, History,
} from 'lucide-react';
import SerialPlotter from './SerialPlotter';
import type { CompileHistoryEntry } from '../store/projectStore';

interface SerialMonitorProps {
    output: string;
    onSend: (text: string) => void;
    onClear: () => void;
    onHide: () => void;
    compileHistory?: CompileHistoryEntry[];
    onClearHistory?: () => void;
}

const LINE_ENDINGS: { label: string; value: string }[] = [
    { label: 'NL',     value: '\n'   },
    { label: 'CR',     value: '\r'   },
    { label: 'NL+CR',  value: '\n\r' },
    { label: 'None',   value: ''     },
];

type Tab = 'monitor' | 'plotter' | 'history';

export default function SerialMonitor({
    output, onSend, onClear, onHide,
    compileHistory = [], onClearHistory,
}: SerialMonitorProps) {
    const [tab, setTab] = useState<Tab>('monitor');
    const [input, setInput] = useState('');
    const [autoScroll, setAutoScroll] = useState(true);
    const [showTimestamps, setShowTimestamps] = useState(false);
    const [lineEnding, setLineEnding] = useState('\n');
    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom when output changes
    useEffect(() => {
        if (tab === 'monitor' && autoScroll && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [output, autoScroll, tab]);

    const handleSubmit = useCallback((e: React.FormEvent) => {
        e.preventDefault();
        if (!input) return;
        onSend(input + lineEnding);
        setInput('');
    }, [input, lineEnding, onSend]);

    // Format output with optional timestamps
    const formattedOutput = showTimestamps
        ? output.split('\n').map((line) => {
            if (line.trim() === '') return line;
            const ts = new Date().toLocaleTimeString('en-US', {
                hour12: false,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
            });
            return `[${ts}] ${line}`;
        }).join('\n')
        : output;

    const tabBtn = (id: Tab, icon: React.ReactNode, label: string, badge?: number) => (
        <button
            onClick={() => setTab(id)}
            className={[
                'flex items-center gap-1 px-3 py-1.5 text-[12px]',
                'border-b-2 transition-colors',
                tab === id
                    ? 'border-blue-500 text-blue-300'
                    : 'border-transparent text-gray-500 hover:text-gray-300',
            ].join(' ')}
        >
            {icon}
            {label}
            {badge !== undefined && badge > 0 && (
                <span className="ml-1 px-1.5 rounded-full bg-vscode-input text-vscode-text opacity-70 text-[10px]">
                    {badge}
                </span>
            )}
        </button>
    );

    return (
        <div className="flex flex-col h-full bg-vscode-sidebar border-t border-vscode-border">
            {/* ── Tab Bar ── */}
            <div className="flex bg-vscode-sidebar border-b border-vscode-border shrink-0">
                <div className="flex items-end gap-0">
                    {tabBtn('monitor', <TerminalIcon size={13} />, 'Monitor')}
                    {tabBtn('plotter', <LineChart size={13} />, 'Plotter')}
                    {tabBtn('history', <History size={13} />, 'History', compileHistory.length)}
                </div>
                <div className="flex-1" />

                {/* Shared actions */}
                {tab === 'monitor' && (
                    <div className="flex items-center gap-0.5 px-2">
                        {/* Timestamp toggle */}
                        <button
                            onClick={() => setShowTimestamps(t => !t)}
                            title="Toggle timestamps"
                            className={`p-1 rounded text-[12px] flex items-center gap-1
                                ${showTimestamps
                                    ? 'text-blue-400 bg-blue-500/10'
                                    : 'text-gray-500 hover:text-gray-300'
                                }`}
                        >
                            <Clock size={12} />
                        </button>

                        {/* Auto-scroll toggle */}
                        <button
                            onClick={() => setAutoScroll(s => !s)}
                            title="Toggle auto-scroll"
                            className={`p-1 rounded text-[12px] flex items-center gap-1
                                ${autoScroll
                                    ? 'text-blue-400 bg-blue-500/10'
                                    : 'text-gray-500 hover:text-gray-300'
                                }`}
                        >
                            <ArrowDownToLine size={12} />
                        </button>

                        {/* Line ending selector */}
                        <select
                            value={lineEnding}
                            onChange={(e) => setLineEnding(e.target.value)}
                            title="Line ending"
                            className="bg-vscode-input text-[11px] text-vscode-text border
                                border-vscode-border rounded px-1 py-0.5 outline-none
                                cursor-pointer"
                        >
                            {LINE_ENDINGS.map(le => (
                                <option key={le.label} value={le.value}>
                                    {le.label}
                                </option>
                            ))}
                        </select>

                        {/* Copy */}
                        <button
                            onClick={() => navigator.clipboard.writeText(output)}
                            title="Copy output"
                            className="text-gray-500 hover:text-gray-300 p-1
                                flex items-center gap-1 text-[12px]"
                        >
                            <Copy size={12} />
                        </button>

                        {/* Clear */}
                        <button
                            onClick={onClear}
                            title="Clear"
                            className="text-gray-500 hover:text-gray-300 p-1
                                flex items-center gap-1 text-[12px]"
                        >
                            <Trash2 size={12} />
                        </button>
                    </div>
                )}

                {tab === 'history' && onClearHistory && (
                    <div className="flex items-center px-2">
                        <button
                            onClick={onClearHistory}
                            title="Clear history"
                            className="text-gray-500 hover:text-gray-300 p-1 text-[12px]"
                        >
                            <Trash2 size={12} />
                        </button>
                    </div>
                )}

                {/* Hide */}
                <div className="flex items-center px-2 border-l border-vscode-border">
                    <button
                        onClick={onHide}
                        title="Hide terminal"
                        className="text-gray-500 hover:text-gray-300 p-1
                            flex items-center gap-1 text-[12px]"
                    >
                        <EyeOff size={12} />
                    </button>
                </div>
            </div>

            {/* ── Monitor Tab ── */}
            {tab === 'monitor' && (
                <>
                    <div
                        ref={scrollRef}
                        className="flex-1 overflow-y-auto p-3 text-[13px]
                            font-mono text-vscode-text whitespace-pre-wrap leading-relaxed"
                    >
                        {formattedOutput || (
                            <span className="text-vscode-text opacity-40 italic">No output…</span>
                        )}
                    </div>

                    {/* Input Bar */}
                    <form
                        onSubmit={handleSubmit}
                        className="flex items-center border-t border-vscode-border
                            px-2 py-1 gap-1 shrink-0"
                    >
                        <span className="text-[12px] text-gray-500 font-mono">&gt;</span>
                        <input
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Send to Serial…"
                            className="flex-1 bg-transparent text-[13px] font-mono
                                text-gray-200 outline-none placeholder:text-gray-600"
                        />
                        <button type="submit" className="text-gray-400 hover:text-white p-1" title="Send">
                            <Send size={13} />
                        </button>
                    </form>
                </>
            )}

            {/* ── Plotter Tab ── */}
            {tab === 'plotter' && <SerialPlotter output={output} />}

            {/* ── History Tab ── */}
            {tab === 'history' && (
                <div className="flex-1 overflow-y-auto">
                    {compileHistory.length === 0 ? (
                        <p className="p-6 text-center text-gray-500 text-[13px] italic">
                            No compilation history yet. Hit Build to get started.
                        </p>
                    ) : (
                        compileHistory.map((entry) => (
                            <details key={entry.id} className="border-b border-vscode-border group">
                                <summary className={[
                                    'flex items-center gap-2 px-3 py-2 cursor-pointer',
                                    'text-[12px] list-none select-none',
                                    'hover:bg-vscode-hover',
                                ].join(' ')}>
                                    <span className={[
                                        'w-2 h-2 rounded-full shrink-0',
                                        entry.success ? 'bg-green-500' : 'bg-red-500',
                                    ].join(' ')} />
                                    <span className={entry.success ? 'text-green-400' : 'text-red-400'}>
                                        {entry.success ? 'Success' : 'Failed'}
                                    </span>
                                    <span className="text-gray-500">—</span>
                                    <span className="text-gray-400 font-medium truncate flex-1">
                                        {entry.projectName}
                                    </span>
                                    <span className="text-gray-600 shrink-0">
                                        {new Date(entry.timestamp).toLocaleTimeString()}
                                    </span>
                                    <span className="text-gray-600 shrink-0">
                                        {(entry.durationMs / 1000).toFixed(1)}s
                                    </span>
                                </summary>
                                <pre className="bg-vscode-codeBg px-4 py-2 text-[11px] font-mono
                                    text-vscode-text opacity-70 whitespace-pre-wrap overflow-x-auto max-h-48
                                    overflow-y-auto">
                                    {entry.output || '(no output)'}
                                </pre>
                            </details>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
