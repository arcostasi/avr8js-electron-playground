/**
 * NewProjectDialog
 * Modal for creating a new Arduino project under the examples/ folder.
 * User provides a name, board type, and optional starting template.
 */
import React, { useState, useRef, useEffect } from 'react';
import { FolderPlus, X } from 'lucide-react';

export interface NewProjectOptions {
    name: string;
    board: string;
    category: string;
    template: 'blank' | 'blink';
}

interface NewProjectDialogProps {
    /** Called with the project options to create, or null if cancelled */
    onConfirm: (opts: NewProjectOptions) => void;
    onClose: () => void;
}

const BOARDS = [
    { value: 'uno',  label: 'Arduino Uno' },
    { value: 'mega', label: 'Arduino Mega' },
    { value: 'nano', label: 'Arduino Nano' },
    { value: 'mini', label: 'Arduino Mini' },
];

const CATEGORIES = ['beginner', 'intermediate', 'advanced'];

function slugify(s: string) {
    return s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).join('-');
}

export default function NewProjectDialog({ onConfirm, onClose }: Readonly<NewProjectDialogProps>) {
    const [name, setName]         = useState('');
    const [board, setBoard]       = useState('uno');
    const [category, setCategory] = useState('beginner');
    const [template, setTemplate] = useState<'blank' | 'blink'>('blink');
    const [error, setError]       = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
        e.preventDefault();
        const trimmed = name.trim();
        if (!trimmed) { setError('Please enter a project name.'); return; }
        if (!/^[a-zA-Z0-9 _-]+$/.test(trimmed)) {
            setError('Name can only contain letters, numbers, spaces, hyphens and underscores.');
            return;
        }
        onConfirm({ name: trimmed, board, category, template });
    };

    const slug = slugify(name || 'my-project');

    return (
        /* Backdrop */
        <div
            className="fixed inset-0 z-[900] flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.6)' }}
            onPointerDown={onClose}
        >
            <div
                className="bg-vscode-bg rounded-xl shadow-2xl border border-vscode-border
                    w-full max-w-md overflow-hidden"
                onPointerDown={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center gap-3 px-5 py-3 border-b border-vscode-border bg-vscode-surface">
                    <FolderPlus size={18} className="text-blue-400" />
                    <h2 className="text-[15px] font-semibold text-vscode-textActive">New Project</h2>
                    <div className="flex-1" />
                    <button onClick={onClose} className="text-vscode-text opacity-60 hover:opacity-100">
                        <X size={18} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
                    {/* Project name */}
                    <div>
                        <label htmlFor="project-name" className="block text-[12px] text-vscode-text opacity-80 mb-1">
                            Project name *
                        </label>
                        <input
                            id="project-name"
                            ref={inputRef}
                            value={name}
                            onChange={e => { setName(e.target.value); setError(''); }}
                            placeholder="My LED Project"
                            className={[
                                'w-full bg-vscode-input border rounded px-3 py-2',
                                'text-[13px] text-vscode-textActive outline-none',
                                error ? 'border-red-500' : 'border-vscode-border',
                                'focus:border-blue-500',
                            ].join(' ')}
                        />
                        {error && <p className="text-[11px] text-red-400 mt-1">{error}</p>}
                        {name && (
                            <p className="text-[11px] text-vscode-text opacity-60 mt-1">
                                Folder: <code className="text-vscode-text opacity-80">examples/{category}/{slug}/</code>
                            </p>
                        )}
                    </div>

                    {/* Board */}
                    <div>
                        <label htmlFor="project-board" className="block text-[12px] text-vscode-text opacity-80 mb-1">Board</label>
                        <select
                            id="project-board"
                            value={board}
                            onChange={e => setBoard(e.target.value)}
                            className="w-full bg-vscode-input border border-vscode-border rounded px-3 py-2
                                text-[13px] text-vscode-text outline-none focus:border-blue-500
                                cursor-pointer"
                        >
                            {BOARDS.map(b => (
                                <option key={b.value} value={b.value}>{b.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* Category */}
                    <div>
                        <label htmlFor="project-category" className="block text-[12px] text-vscode-text opacity-80 mb-1">Category</label>
                        <select
                            id="project-category"
                            value={category}
                            onChange={e => setCategory(e.target.value)}
                            className="w-full bg-vscode-input border border-vscode-border rounded px-3 py-2
                                text-[13px] text-vscode-text outline-none focus:border-blue-500
                                cursor-pointer"
                        >
                            {CATEGORIES.map(c => (
                                <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                            ))}
                        </select>
                    </div>

                    {/* Template */}
                    <div>
                        <p className="block text-[12px] text-vscode-text opacity-80 mb-1.5">
                            Starting template
                        </p>
                        <div className="flex gap-3">
                            {(['blank', 'blink'] as const).map(t => (
                                <label
                                    key={t}
                                    className={[
                                        'flex items-center gap-2 flex-1 cursor-pointer',
                                        'border rounded-lg px-3 py-2',
                                        'transition-colors text-[13px]',
                                        template === t
                                            ? 'border-blue-500 bg-blue-600/10 text-blue-300'
                                            : 'border-vscode-border text-vscode-text opacity-80 hover:bg-vscode-hover hover:opacity-100',
                                    ].join(' ')}
                                >
                                    <input
                                        type="radio"
                                        name="template"
                                        value={t}
                                        checked={template === t}
                                        onChange={() => setTemplate(t)}
                                        className="accent-blue-500"
                                    />
                                    {t === 'blank' ? 'Blank sketch' : 'Blink LED'}
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-2 pt-1">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-[13px] text-vscode-text opacity-80
                                hover:opacity-100 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={!name.trim()}
                            className={[
                                'px-5 py-2 rounded text-[13px] font-medium',
                                'transition-colors',
                                name.trim()
                                    ? 'bg-blue-600 text-white hover:bg-blue-500'
                                    : 'bg-vscode-input text-vscode-text opacity-50 cursor-not-allowed',
                            ].join(' ')}
                        >
                            Create Project
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
