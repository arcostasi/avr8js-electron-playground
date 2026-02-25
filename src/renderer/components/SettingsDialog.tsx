/**
 * SettingsDialog
 * Multi-tab settings dialog.
 * Tabs: Build | Editor | Simulator | About
 *
 * Uses local draft state so the user can discard changes with Cancel.
 */
import React, { useState, useCallback } from 'react';
import { X, Wrench, FileCode2, Cpu, Info, RotateCcw } from 'lucide-react';
import {
    useSettingsStore,
    DEFAULT_SETTINGS,
} from '../store/settingsStore';
import type { AppSettings, BuildBackend, FQBNMap } from '../store/settingsStore';
import { WIRE_COLORS } from '../constants/wokwi-components';

// ── Tab definition ──────────────────────────────────────────────────────────

type TabId = 'build' | 'editor' | 'simulator' | 'about';

interface TabDef {
    id: TabId;
    label: string;
    icon: React.ReactNode;
}

const TABS: TabDef[] = [
    { id: 'build',     label: 'Build',     icon: <Wrench   size={15} /> },
    { id: 'editor',    label: 'Editor',    icon: <FileCode2 size={15} /> },
    { id: 'simulator', label: 'Simulator', icon: <Cpu      size={15} /> },
    { id: 'about',     label: 'About',     icon: <Info     size={15} /> },
];

// ── Shared UI atoms ─────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
    return (
        <label className="text-[12px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">
            {children}
        </label>
    );
}

function HelpText({ children }: { children: React.ReactNode }) {
    return <p className="text-[11px] text-gray-500 mt-0.5">{children}</p>;
}

function TextInput({
    value, onChange, placeholder, disabled, monospace,
}: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    disabled?: boolean;
    monospace?: boolean;
}) {
    return (
        <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            className={[
                'w-full px-3 py-1.5 rounded-md text-[13px]',
                'bg-[#1e1e1e] border border-[#3a3a3a]',
                'text-gray-100 placeholder-gray-600',
                'focus:outline-none focus:border-blue-500/60',
                'disabled:opacity-40 disabled:cursor-not-allowed',
                monospace ? 'font-mono' : '',
            ].join(' ')}
        />
    );
}

function NumberInput({
    value, onChange, min, max, step, disabled,
}: {
    value: number;
    onChange: (v: number) => void;
    min?: number;
    max?: number;
    step?: number;
    disabled?: boolean;
}) {
    return (
        <input
            type="number"
            value={value}
            min={min}
            max={max}
            step={step ?? 1}
            disabled={disabled}
            onChange={(e) => {
                const n = Number(e.target.value);
                if (!Number.isNaN(n)) onChange(n);
            }}
            className={[
                'w-28 px-3 py-1.5 rounded-md text-[13px]',
                'bg-[#1e1e1e] border border-[#3a3a3a]',
                'text-gray-100',
                'focus:outline-none focus:border-blue-500/60',
                'disabled:opacity-40 disabled:cursor-not-allowed',
            ].join(' ')}
        />
    );
}

function Toggle({
    checked, onChange, label,
}: {
    checked: boolean;
    onChange: (v: boolean) => void;
    label: string;
}) {
    return (
        <button
            type="button"
            onClick={() => onChange(!checked)}
            className="flex items-center gap-3 group"
        >
            <div
                className={[
                    'relative w-10 h-5 rounded-full transition-colors duration-200',
                    checked ? 'bg-blue-600' : 'bg-[#3a3a3a]',
                ].join(' ')}
            >
                <div
                    className={[
                        'absolute top-0.5 left-0.5 w-4 h-4 rounded-full',
                        'bg-white shadow transition-transform duration-200',
                        checked ? 'translate-x-5' : 'translate-x-0',
                    ].join(' ')}
                />
            </div>
            <span className="text-[13px] text-gray-300 group-hover:text-white transition-colors">
                {label}
            </span>
        </button>
    );
}

function SectionDivider({ title }: { title: string }) {
    return (
        <div className="flex items-center gap-2 my-4">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">{title}</span>
            <div className="flex-1 h-px bg-[#333]" />
        </div>
    );
}

// ── Tab panels ──────────────────────────────────────────────────────────────

function BuildTab({
    draft, update,
}: {
    draft: AppSettings;
    update: (patch: Partial<AppSettings>) => void;
}) {
    const iCloud = draft.buildBackend === 'cloud';
    const iLocal = draft.buildBackend === 'local';

    const fqbnBoards: Array<{ key: keyof FQBNMap & string; label: string }> = [
        { key: 'uno',   label: 'Arduino Uno'   },
        { key: 'mega',  label: 'Arduino Mega'  },
        { key: 'nano',  label: 'Arduino Nano'  },
        { key: 'mini',  label: 'Arduino Mini'  },
    ];

    return (
        <div className="space-y-5">
            <SectionDivider title="Compiler Backend" />

            {/* Backend selection */}
            <div className="space-y-2">
                {([ ['cloud', 'Wokwi Cloud (Hexi)', 'Fast cloud compilation, no local tools required.'],
                    ['local', 'Local arduino-cli',   'Use an arduino-cli installation on this machine.'],
                ] as [BuildBackend, string, string][]).map(([val, lbl, help]) => (
                    <label
                        key={val}
                        className={[
                            'flex items-start gap-3 p-3 rounded-lg cursor-pointer border transition-colors',
                            draft.buildBackend === val
                                ? 'border-blue-500/60 bg-blue-500/10'
                                : 'border-[#333] hover:border-[#444] hover:bg-[#2a2a2a]',
                        ].join(' ')}
                    >
                        <input
                            type="radio"
                            name="buildBackend"
                            value={val}
                            checked={draft.buildBackend === val}
                            onChange={() => update({ buildBackend: val })}
                            className="mt-0.5 accent-blue-500"
                        />
                        <div>
                            <div className="text-[13px] font-medium text-gray-200">{lbl}</div>
                            <div className="text-[11px] text-gray-500 mt-0.5">{help}</div>
                        </div>
                    </label>
                ))}
            </div>

            {/* Cloud settings */}
            {iCloud && (
                <div>
                    <SectionDivider title="Cloud Settings" />
                    <div>
                        <Label>Compiler URL</Label>
                        <TextInput
                            value={draft.cloudUrl}
                            onChange={(v) => update({ cloudUrl: v })}
                            placeholder="https://hexi.wokwi.com"
                            monospace
                        />
                        <HelpText>The Hexi/Wokwi cloud endpoint used for compilation.</HelpText>
                    </div>
                </div>
            )}

            {/* Local settings */}
            {iLocal && (
                <div>
                    <SectionDivider title="arduino-cli Settings" />
                    <div className="space-y-4">
                        <div>
                            <Label>Installation folder</Label>
                            <TextInput
                                value={draft.arduinoCliPath}
                                onChange={(v) => update({ arduinoCliPath: v })}
                                placeholder="C:\Arduino"
                                monospace
                            />
                            <HelpText>
                                The directory that contains the arduino-cli executable.
                                Example: <code className="text-gray-400">C:\Arduino</code>
                            </HelpText>
                        </div>

                        <div>
                            <Label>Binary name</Label>
                            <TextInput
                                value={draft.arduinoCliBin}
                                onChange={(v) => update({ arduinoCliBin: v })}
                                placeholder="arduino-cli"
                                monospace
                            />
                            <HelpText>
                                File name of the executable inside the folder above.
                                Usually <code className="text-gray-400">arduino-cli</code> or{' '}
                                <code className="text-gray-400">arduino-cli.exe</code>.
                            </HelpText>
                        </div>

                        <div>
                            <Label>Extra compile flags</Label>
                            <TextInput
                                value={draft.extraFlags}
                                onChange={(v) => update({ extraFlags: v })}
                                placeholder="--verbose"
                                monospace
                            />
                            <HelpText>
                                Flags appended to every <code className="text-gray-400">arduino-cli compile</code> call.
                            </HelpText>
                        </div>
                    </div>

                    <SectionDivider title="FQBN per Board" />
                    <div className="space-y-2">
                        {fqbnBoards.map(({ key, label }) => (
                            <div key={key} className="flex items-center gap-3">
                                <span className="text-[12px] text-gray-400 w-28 shrink-0">{label}</span>
                                <TextInput
                                    value={draft.fqbnMap[key] ?? ''}
                                    onChange={(v) =>
                                        update({ fqbnMap: { ...draft.fqbnMap, [key]: v } })
                                    }
                                    placeholder={DEFAULT_SETTINGS.fqbnMap[key]}
                                    monospace
                                />
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function EditorTab({
    draft, update,
}: {
    draft: AppSettings;
    update: (patch: Partial<AppSettings>) => void;
}) {
    return (
        <div className="space-y-5">
            <SectionDivider title="Appearance" />
            <div>
                <Label>Font size (px)</Label>
                <div className="flex items-center gap-3">
                    <NumberInput
                        value={draft.editorFontSize}
                        onChange={(v) => update({ editorFontSize: Math.max(10, Math.min(32, v)) })}
                        min={10}
                        max={32}
                    />
                    <input
                        type="range"
                        min={10}
                        max={32}
                        value={draft.editorFontSize}
                        onChange={(e) =>
                            update({ editorFontSize: Number(e.target.value) })
                        }
                        className="flex-1 accent-blue-500"
                    />
                </div>
            </div>

            <div>
                <Toggle
                    checked={draft.wordWrap === 'on'}
                    onChange={(on) => update({ wordWrap: on ? 'on' : 'off' })}
                    label="Word wrap"
                />
            </div>

            <SectionDivider title="Auto-Save" />
            <div>
                <Label>Auto-save delay (ms)</Label>
                <div className="flex items-center gap-3">
                    <NumberInput
                        value={draft.autoSaveDelay}
                        onChange={(v) =>
                            update({ autoSaveDelay: Math.max(0, Math.min(30000, v)) })
                        }
                        min={0}
                        max={30000}
                        step={500}
                    />
                    <span className="text-[12px] text-gray-500">
                        {draft.autoSaveDelay === 0
                            ? 'disabled'
                            : `saves ${(draft.autoSaveDelay / 1000).toFixed(1)} s after last change`}
                    </span>
                </div>
                <HelpText>
                    Set to 0 to disable auto-save. Changes are always saved when switching projects.
                </HelpText>
            </div>
        </div>
    );
}

function SimulatorTab({
    draft, update,
}: {
    draft: AppSettings;
    update: (patch: Partial<AppSettings>) => void;
}) {
    return (
        <div className="space-y-5">
            <SectionDivider title="Wiring" />
            <div>
                <Label>Default wire color</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                    {WIRE_COLORS.map((c) => (
                        <button
                            key={c}
                            title={c}
                            onClick={() => update({ defaultWireColor: c })}
                            className={[
                                'w-7 h-7 rounded-full border-2 transition-all',
                                draft.defaultWireColor === c
                                    ? 'border-white scale-110 shadow-md shadow-white/20'
                                    : 'border-[#444] opacity-70 hover:opacity-100 hover:scale-110',
                            ].join(' ')}
                            style={{ backgroundColor: c }}
                        />
                    ))}
                </div>
                <HelpText>
                    The color used for newly drawn wires. Individual wires can be
                    recolored by clicking on them in edit mode.
                </HelpText>
            </div>

            <SectionDivider title="Interaction" />
            <div>
                <Toggle
                    checked={draft.showPinTooltips}
                    onChange={(v) => update({ showPinTooltips: v })}
                    label="Show pin-name tooltip on hover"
                />
            </div>
        </div>
    );
}

function AboutTab() {
    return (
        <div className="space-y-5">
            <div className="flex items-center gap-4 p-4 bg-[#1e1e1e] rounded-lg border border-[#333]">
                <div className="text-4xl">⚡</div>
                <div>
                    <div className="text-[16px] font-bold text-gray-100">AVR8js Electron Playground</div>
                    <div className="text-[12px] text-gray-500 mt-0.5">
                        v0.18 · Electron + React + Vite + Wokwi Elements
                    </div>
                </div>
            </div>

            <div className="space-y-2 text-[13px] text-gray-400">
                <p>
                    An Arduino/AVR simulator powered by{' '}
                    <strong className="text-gray-300">avr8js</strong> and the{' '}
                    <strong className="text-gray-300">Wokwi Elements</strong> component library.
                </p>
                <p>
                    Cloud compilation via{' '}
                    <strong className="text-gray-300">Hexi / Wokwi</strong>. Local compilation
                    requires a working <strong className="text-gray-300">arduino-cli</strong> installation.
                </p>
            </div>

            <SectionDivider title="Keyboard Shortcuts" />
            <div className="grid grid-cols-2 gap-y-2 text-[12px]">
                {([
                    ['Ctrl+Z',        'Undo diagram change'],
                    ['Ctrl+Y',        'Redo diagram change'],
                    ['R',             'Rotate selected component'],
                    ['Delete / ⌫',   'Delete selected wire'],
                    ['Esc',           'Deselect wire / component'],
                    ['Ctrl + Scroll', 'Zoom canvas'],
                    ['Middle drag',   'Pan canvas'],
                    ['Double-click wire', 'Delete wire (quick)'],
                ] as [string, string][]).map(([key, desc]) => (
                    <React.Fragment key={key}>
                        <kbd className="bg-[#2a2a2a] border border-[#444] px-2 py-0.5 rounded font-mono text-gray-300 text-[11px] w-fit">
                            {key}
                        </kbd>
                        <span className="text-gray-400">{desc}</span>
                    </React.Fragment>
                ))}
            </div>
        </div>
    );
}

// ── Main dialog ─────────────────────────────────────────────────────────────

interface SettingsDialogProps {
    onClose: () => void;
}

export default function SettingsDialog({ onClose }: SettingsDialogProps) {
    const { updateSettings, resetSettings, ...storedSettings } = useSettingsStore();

    // Local draft — only committed on Save
    const [draft, setDraft] = useState<AppSettings>({ ...storedSettings } as AppSettings);
    const [activeTab, setActiveTab] = useState<TabId>('build');

    const update = useCallback((patch: Partial<AppSettings>) => {
        setDraft((prev: AppSettings) => {
            const fqbnMap = patch.fqbnMap
                ? { ...prev.fqbnMap, ...patch.fqbnMap }
                : prev.fqbnMap;
            return { ...prev, ...patch, fqbnMap };
        });
    }, []);

    const handleSave = () => {
        updateSettings(draft);
        onClose();
    };

    const handleReset = () => {
        setDraft({ ...DEFAULT_SETTINGS });
    };

    // Close on backdrop click
    const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget) onClose();
    };

    return (
        /* ── Backdrop ── */
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onPointerDown={handleBackdrop}
        >
            {/* ── Dialog card ── */}
            <div
                className="flex flex-col w-[780px] max-h-[85vh] bg-[#252526] border border-[#3a3a3a] rounded-xl shadow-2xl shadow-black/70 overflow-hidden"
                onPointerDown={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#333] shrink-0">
                    <div className="flex items-center gap-2">
                        <span className="text-gray-300 font-semibold text-[15px]">⚙ Settings</span>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-500 hover:text-gray-200 transition-colors p-1 rounded"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Body: sidebar tabs + content */}
                <div className="flex flex-1 overflow-hidden">
                    {/* Sidebar */}
                    <nav className="flex flex-col w-40 border-r border-[#333] py-2 shrink-0 bg-[#1e1e1e]">
                        {TABS.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={[
                                    'flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-left',
                                    'transition-colors font-medium',
                                    activeTab === tab.id
                                        ? 'text-white bg-[#2a2a2a] border-l-2 border-blue-500'
                                        : 'text-gray-400 hover:text-gray-200 hover:bg-[#252525] border-l-2 border-transparent',
                                ].join(' ')}
                            >
                                {tab.icon}
                                {tab.label}
                            </button>
                        ))}
                    </nav>

                    {/* Content area */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-1">
                        {activeTab === 'build'     && <BuildTab     draft={draft} update={update} />}
                        {activeTab === 'editor'    && <EditorTab    draft={draft} update={update} />}
                        {activeTab === 'simulator' && <SimulatorTab draft={draft} update={update} />}
                        {activeTab === 'about'     && <AboutTab />}
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-5 py-3 border-t border-[#333] shrink-0 bg-[#1e1e1e]">
                    <button
                        onClick={handleReset}
                        className="flex items-center gap-1.5 text-[12px] text-gray-500 hover:text-gray-300 transition-colors"
                    >
                        <RotateCcw size={13} />
                        Reset to defaults
                    </button>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onClose}
                            className="px-4 py-1.5 text-[13px] text-gray-400 hover:text-gray-200 hover:bg-[#333] rounded transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            className="px-4 py-1.5 text-[13px] bg-blue-600 hover:bg-blue-500 text-white rounded font-medium transition-colors"
                        >
                            Save
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
