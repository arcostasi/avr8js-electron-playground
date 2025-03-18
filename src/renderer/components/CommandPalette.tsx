/**
 * CommandPalette
 * Global command palette triggered with Ctrl+P.
 * Fuzzy-search through registered commands and execute them with Enter.
 */
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, Keyboard } from 'lucide-react';

export interface PaletteCommand {
    id: string;
    label: string;
    description?: string;
    shortcut?: string;
    icon?: React.ReactNode;
    action: () => void;
}

interface CommandPaletteProps {
    commands: PaletteCommand[];
    onClose: () => void;
}

/** Simple fuzzy match: all query chars present in label, in order */
function fuzzyMatch(label: string, query: string): { score: number; indices: number[] } {
    const lo = label.toLowerCase();
    const ql = query.toLowerCase();
    let j = 0;
    const indices: number[] = [];
    for (let i = 0; i < lo.length && j < ql.length; i++) {
        if (lo[i] === ql[j]) {
            indices.push(i);
            j++;
        }
    }
    if (j < ql.length) return { score: -1, indices: [] };
    // Score: prefer earlier matches
    const score = -indices.reduce((a, b) => a + b, 0);
    return { score, indices };
}

function HighlightLabel({ label, indices }: { label: string; indices: number[] }) {
    const set = new Set(indices);
    return (
        <span>
            {label.split('').map((ch, i) => (
                <span key={i} className={set.has(i) ? 'text-blue-300 font-bold' : ''}>
                    {ch}
                </span>
            ))}
        </span>
    );
}

export default function CommandPalette({ commands, onClose }: CommandPaletteProps) {
    const [query, setQuery] = useState('');
    const [selectedIdx, setSelectedIdx] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    const filtered = useMemo(() => {
        if (!query.trim()) {
            return commands.map(cmd => ({ cmd, indices: [] as number[] }));
        }
        return commands
            .map(cmd => {
                const { score, indices } = fuzzyMatch(cmd.label, query);
                return { cmd, score, indices };
            })
            .filter(r => r.score >= 0)
            .sort((a, b) => b.score - a.score)
            .map(r => ({ cmd: r.cmd, indices: r.indices }));
    }, [commands, query]);

    // Reset selection when filter changes
    useEffect(() => {
        setSelectedIdx(0);
    }, [query]);

    // Scroll selected item into view
    useEffect(() => {
        if (listRef.current) {
            const el = listRef.current.children[selectedIdx] as HTMLElement | undefined;
            el?.scrollIntoView({ block: 'nearest' });
        }
    }, [selectedIdx]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIdx(i => Math.min(i + 1, filtered.length - 1));
            return;
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIdx(i => Math.max(i - 1, 0));
            return;
        }
        if (e.key === 'Enter') {
            e.preventDefault();
            const item = filtered[selectedIdx];
            if (item) { item.cmd.action(); onClose(); }
        }
    };

    const execute = (cmd: PaletteCommand) => {
        cmd.action();
        onClose();
    };

    return (
        /* Backdrop */
        <div
            className="fixed inset-0 z-[1000] flex items-start justify-center pt-[12vh]"
            onClick={onClose}
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }}
        >
            <div
                className="w-full max-w-lg bg-vscode-bg rounded-xl shadow-2xl
                    border border-vscode-border overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* Search input */}
                <div className="flex items-center gap-2 px-4 py-3 border-b border-vscode-border bg-vscode-surface">
                    <Search size={16} className="text-vscode-text opacity-60 shrink-0" />
                    <input
                        ref={inputRef}
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Type a command…"
                        className="flex-1 bg-transparent text-[14px] text-vscode-textActive
                            outline-none placeholder:text-vscode-text placeholder:opacity-50"
                    />
                    <span className="text-[11px] text-vscode-text opacity-60 px-1.5 py-0.5 bg-vscode-input rounded border border-vscode-border">
                        ESC
                    </span>
                </div>

                {/* Results */}
                <div ref={listRef} className="overflow-y-auto" style={{ maxHeight: 320 }}>
                    {filtered.length === 0 ? (
                        <p className="px-4 py-6 text-center text-vscode-text opacity-60 text-[13px] italic">
                            No commands match "{query}"
                        </p>
                    ) : (
                        filtered.map(({ cmd, indices }, i) => (
                            <button
                                key={cmd.id}
                                onClick={() => execute(cmd)}
                                onMouseEnter={() => setSelectedIdx(i)}
                                className={[
                                    'w-full flex items-center gap-3 px-4 py-2.5 text-left',
                                    'transition-colors',
                                    i === selectedIdx
                                        ? 'bg-vscode-hover text-vscode-textActive'
                                        : 'text-vscode-text hover:bg-vscode-hover',
                                ].join(' ')}
                            >
                                {cmd.icon && (
                                    <span className="text-vscode-text opacity-55 shrink-0">{cmd.icon}</span>
                                )}
                                <span className="flex-1 text-[13px]">
                                    <HighlightLabel label={cmd.label} indices={indices} />
                                </span>
                                {cmd.description && (
                                    <span className="text-[11px] text-vscode-text opacity-60 shrink-0">
                                        {cmd.description}
                                    </span>
                                )}
                                {cmd.shortcut && (
                                    <span className="flex items-center gap-0.5 shrink-0">
                                        {cmd.shortcut.split('+').map(k => (
                                            <span
                                                key={k}
                                                className="text-[10px]
                                                    px-1.5 py-0.5 bg-vscode-input border border-vscode-border text-vscode-text opacity-70 rounded"
                                            >
                                                {k}
                                            </span>
                                        ))}
                                    </span>
                                )}
                            </button>
                        ))
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center gap-3 px-4 py-2 border-t border-vscode-border
                    text-[11px] text-vscode-text opacity-65 bg-vscode-surface"
                >
                    <Keyboard size={12} />
                    <span>↑↓ navigate</span>
                    <span>↵ execute</span>
                    <span>Esc close</span>
                    <div className="flex-1" />
                    <span>{filtered.length} commands</span>
                </div>
            </div>
        </div>
    );
}
