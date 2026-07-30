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
    disabled?: boolean;
    disabledReason?: string;
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

function HighlightLabel({ label, indices }: Readonly<{ label: string; indices: number[] }>) {
    const set = new Set(indices);
    return (
        <span>
            {label.split('').map((ch, i) => (
                <span key={i} className={set.has(i) ? 'text-blue-500 font-bold' : ''}>
                    {ch}
                </span>
            ))}
        </span>
    );
}

export default function CommandPalette({ commands, onClose }: Readonly<CommandPaletteProps>) {
    const [query, setQuery] = useState('');
    const [selectedIdx, setSelectedIdx] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    const filtered = useMemo(() => {
        const trimmed = query.trim();
        if (!trimmed) {
            return commands.map(cmd => ({ cmd, indices: [] as number[] }));
        }
        return commands
            .map(cmd => {
                const labelMatch = fuzzyMatch(cmd.label, trimmed);
                if (labelMatch.score >= 0) {
                    return { cmd, score: labelMatch.score + 1000, indices: labelMatch.indices };
                }
                if (cmd.description) {
                    const descMatch = fuzzyMatch(cmd.description, trimmed);
                    if (descMatch.score >= 0) {
                        return { cmd, score: descMatch.score, indices: [] as number[] };
                    }
                }
                return { cmd, score: -1, indices: [] as number[] };
            })
            .filter(r => r.score >= 0)
            .sort((a, b) => b.score - a.score)
            .map(r => ({ cmd: r.cmd, indices: r.indices }));
    }, [commands, query]);

    // Reset selection when filter changes
    useEffect(() => {
        setSelectedIdx(0);
    }, [query, commands]);

    // Scroll selected item into view
    useEffect(() => {
        if (listRef.current && filtered.length > 0) {
            const safeIdx = Math.min(selectedIdx, filtered.length - 1);
            const el = listRef.current.children[safeIdx] as HTMLElement | undefined;
            el?.scrollIntoView({ block: 'nearest' });
        }
    }, [filtered.length, selectedIdx]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIdx(i => (filtered.length === 0 ? 0 : Math.min(i + 1, filtered.length - 1)));
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
            if (item && !item.cmd.disabled) {
                item.cmd.action();
                onClose();
            }
        }
    };

    const execute = (cmd: PaletteCommand) => {
        if (cmd.disabled) return;
        cmd.action();
        onClose();
    };

    return (
        /* Backdrop */
        <div
            className="fixed inset-0 z-[1000] flex items-start justify-center pt-[12vh]"
            onPointerDown={onClose}
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Command Palette"
                className="w-full max-w-lg bg-vscode-bg rounded-xl shadow-2xl
                    border border-vscode-border overflow-hidden"
                onPointerDown={e => e.stopPropagation()}
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
                        filtered.map(({ cmd, indices }, i) => {
                            const isDisabled = Boolean(cmd.disabled);
                            return (
                                <button
                                    key={cmd.id}
                                    type="button"
                                    disabled={isDisabled}
                                    onClick={() => execute(cmd)}
                                    onMouseEnter={() => setSelectedIdx(i)}
                                    title={isDisabled ? (cmd.disabledReason ?? cmd.description ?? 'Unavailable') : cmd.description}
                                    className={[
                                        'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                                        isDisabled
                                            ? 'opacity-45 cursor-not-allowed text-vscode-text'
                                            : i === selectedIdx
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
                                    {(isDisabled ? (cmd.disabledReason ?? cmd.description) : cmd.description) && (
                                        <span className="text-[11px] text-vscode-text opacity-60 shrink-0">
                                            {isDisabled ? (cmd.disabledReason ?? cmd.description) : cmd.description}
                                        </span>
                                    )}
                                    {cmd.shortcut && (
                                        <span className="flex items-center gap-0.5 shrink-0">
                                            {cmd.shortcut.split('+').map((k, kIdx) => (
                                                <span
                                                    key={`${k}-${kIdx}`}
                                                    className="text-[10px]
                                                        px-1.5 py-0.5 bg-vscode-input border border-vscode-border text-vscode-text opacity-70 rounded"
                                                >
                                                    {k}
                                                </span>
                                            ))}
                                        </span>
                                    )}
                                </button>
                            );
                        })
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
