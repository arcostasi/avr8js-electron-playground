/**
 * SerialMonitor
 * Enhanced terminal panel with auto-scroll, timestamps, line ending selector,
 * and serial input for sending data to the Arduino USART RX.
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    Copy, Trash2, EyeOff, Send,
    Terminal as TerminalIcon,
    Clock, ArrowDownToLine,
} from 'lucide-react';

interface SerialMonitorProps {
    output: string;
    onSend: (text: string) => void;
    onClear: () => void;
    onHide: () => void;
}

const LINE_ENDINGS: { label: string; value: string }[] = [
    { label: 'NL',     value: '\n'   },
    { label: 'CR',     value: '\r'   },
    { label: 'NL+CR',  value: '\n\r' },
    { label: 'None',   value: ''     },
];

export default function SerialMonitor({
    output, onSend, onClear, onHide,
}: SerialMonitorProps) {
    const [input, setInput] = useState('');
    const [autoScroll, setAutoScroll] = useState(true);
    const [showTimestamps, setShowTimestamps] = useState(false);
    const [lineEnding, setLineEnding] = useState('\n');
    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom when output changes
    useEffect(() => {
        if (autoScroll && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [output, autoScroll]);

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

    return (
        <div className="flex flex-col h-full bg-vscode-sidebar border-t border-vscode-border">
            {/* ── Toolbar ── */}
            <div className="flex bg-vscode-sidebar border-b border-vscode-border
                py-1 px-2 items-center shrink-0 gap-1 flex-wrap"
            >
                <span className="text-[12px] font-semibold text-vscode-text
                    uppercase flex items-center gap-1.5 mr-1"
                >
                    <TerminalIcon size={13} /> Serial Monitor
                </span>

                <div className="flex-1" />

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
                    className="bg-[#2a2a2a] text-[11px] text-gray-300 border
                        border-[#444] rounded px-1 py-0.5 outline-none
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

                {/* Hide */}
                <button
                    onClick={onHide}
                    title="Hide terminal"
                    className="text-gray-500 hover:text-gray-300 p-1
                        flex items-center gap-1 text-[12px]"
                >
                    <EyeOff size={12} />
                </button>
            </div>

            {/* ── Output Area ── */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-3 text-[13px]
                    font-mono text-gray-300 whitespace-pre-wrap leading-relaxed"
            >
                {formattedOutput || (
                    <span className="text-gray-500 italic">
                        No output...
                    </span>
                )}
            </div>

            {/* ── Input Bar ── */}
            <form
                onSubmit={handleSubmit}
                className="flex items-center border-t border-vscode-border
                    px-2 py-1 gap-1 shrink-0"
            >
                <span className="text-[12px] text-gray-500 font-mono">
                    &gt;
                </span>
                <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Send to Serial..."
                    className="flex-1 bg-transparent text-[13px] font-mono
                        text-gray-200 outline-none placeholder:text-gray-600"
                />
                <button
                    type="submit"
                    className="text-gray-400 hover:text-white p-1"
                    title="Send"
                >
                    <Send size={13} />
                </button>
            </form>
        </div>
    );
}
