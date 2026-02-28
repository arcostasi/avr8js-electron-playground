/**
 * SimulatorToolbar
 * Top toolbar with mode toggle, build/run/stop controls, simulation info,
 * wire color picker, add component trigger, and speed control.
 */
import React from 'react';
import { Play, Square, Wrench, MousePointer2, Undo2, Redo2 } from 'lucide-react';

interface SimulatorToolbarProps {
    isEditMode: boolean;
    onToggleEditMode: () => void;
    isPlaying: boolean;
    isCompiling: boolean;
    hex: string | null | undefined;
    onCompile: () => void;
    onPlay: () => void;
    onStop: () => void;
    simTime: string;
    simSpeed: string;
    /** Current speed multiplier 0.05–8 */
    speedMultiplier?: number;
    onSpeedChange?: (v: number) => void;
    renderAddMenu: React.ReactNode;
    onUndo?: () => void;
    onRedo?: () => void;
    canUndo?: boolean;
    canRedo?: boolean;
    /** Whether the AVR Inspector panel is open */
    showInspector?: boolean;
    onToggleInspector?: () => void;
    /** Whether the Oscilloscope panel is open */
    showOscilloscope?: boolean;
    onToggleOscilloscope?: () => void;
}

export default function SimulatorToolbar({
    isEditMode, onToggleEditMode,
    isPlaying, isCompiling, hex,
    onCompile, onPlay, onStop,
    simTime, simSpeed,
    speedMultiplier = 1.0, onSpeedChange,
    renderAddMenu,
    onUndo, onRedo, canUndo, canRedo,
    showInspector, onToggleInspector,
    showOscilloscope, onToggleOscilloscope,
}: SimulatorToolbarProps) {
    return (
        <div className={
            'flex items-center gap-1 px-2 py-1 '
            + 'bg-vscode-surface2 border-b border-vscode-border '
            + 'z-10 shrink-0 overflow-hidden'
        }>

            {/* Add Component (always visible in edit mode) */}
            {isEditMode && renderAddMenu}

            {/* Undo / Redo (edit mode only) */}
            {isEditMode && (
                <>
                    <button
                        onClick={onUndo}
                        disabled={!canUndo}
                        title="Undo (Ctrl+Z)"
                        className={[
                            'flex items-center justify-center',
                            'w-6 h-6 rounded',
                            'transition-all',
                            canUndo
                                ? 'text-vscode-text hover:text-vscode-textActive hover:bg-vscode-hover'
                                : 'text-vscode-border cursor-not-allowed',
                        ].join(' ')}
                    >
                        <Undo2 size={14} />
                    </button>
                    <button
                        onClick={onRedo}
                        disabled={!canRedo}
                        title="Redo (Ctrl+Y)"
                        className={[
                            'flex items-center justify-center',
                            'w-6 h-6 rounded',
                            'transition-all',
                            canRedo
                                ? 'text-vscode-text hover:text-vscode-textActive hover:bg-vscode-hover'
                                : 'text-vscode-border cursor-not-allowed',
                        ].join(' ')}
                    >
                        <Redo2 size={14} />
                    </button>
                    <div className="h-4 w-px bg-vscode-divider mx-0.5" />
                </>
            )}

            {/* Mode Toggle */}
            <button
                onClick={onToggleEditMode}
                title={isEditMode ? 'Switch to Run Mode' : 'Switch to Edit Mode'}
                className={[
                    'flex items-center gap-1',
                    'px-2 py-1 rounded text-[12px]',
                    'font-medium transition-all',
                    isEditMode
                        ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40'
                        : 'text-vscode-text hover:text-vscode-textActive hover:bg-vscode-hover',
                ].join(' ')}
            >
                <MousePointer2 size={14} />
                {isEditMode ? 'Edit' : 'View'}
            </button>

            <div className="h-4 w-px bg-vscode-divider mx-0.5" />

            {/* Build / Run / Stop — icon-only to save space */}
            <button
                onClick={onCompile}
                disabled={isCompiling || isPlaying}
                title="Build / Compile (F5)"
                className={[
                    'flex items-center justify-center',
                    'w-7 h-7 rounded text-[12px]',
                    'font-medium transition-all',
                    isCompiling || isPlaying
                        ? 'text-vscode-border cursor-not-allowed'
                        : 'text-vscode-text hover:text-vscode-textActive hover:bg-vscode-hover',
                ].join(' ')}
            >
                <Wrench size={14} className={isCompiling ? 'animate-spin' : ''} />
            </button>

            <button
                onClick={onPlay}
                disabled={isPlaying || !hex}
                title="Run"
                className={[
                    'flex items-center justify-center',
                    'w-7 h-7 rounded text-[12px]',
                    'font-medium transition-all',
                    isPlaying || !hex
                        ? 'text-vscode-border cursor-not-allowed'
                        : 'text-green-500 hover:text-green-400 hover:bg-green-900/20',
                ].join(' ')}
            >
                <Play size={14} />
            </button>

            <button
                onClick={onStop}
                disabled={!isPlaying}
                title="Stop"
                className={[
                    'flex items-center justify-center',
                    'w-7 h-7 rounded text-[12px]',
                    'font-medium transition-all',
                    !isPlaying
                        ? 'text-vscode-border cursor-not-allowed'
                        : 'text-red-400 hover:text-red-300 hover:bg-red-900/20',
                ].join(' ')}
            >
                <Square size={14} />
            </button>

            {/* Spacer */}
            <div className="flex-1 min-w-0" />

            {/* Speed control */}
            {onSpeedChange && (
                <div className="flex items-center gap-1 text-[11px] shrink-0">
                    <input
                        type="range"
                        min={0.05}
                        max={4}
                        step={0.05}
                        value={speedMultiplier}
                        onChange={e => onSpeedChange(parseFloat(e.target.value))}
                        title={`Speed: ${speedMultiplier.toFixed(2)}×`}
                        className="w-16 cursor-pointer themed-slider"
                        style={{ '--pct': `${((speedMultiplier - 0.05) / (4 - 0.05) * 100).toFixed(1)}%` } as React.CSSProperties}
                    />
                    <span className="w-9 font-mono text-right text-vscode-text tabular-nums">
                        {speedMultiplier.toFixed(1)}×
                    </span>
                    <div className="h-4 w-px bg-vscode-divider mx-0.5" />
                </div>
            )}

            {/* Panel toggles */}
            {onToggleInspector && (
                <button
                    onClick={onToggleInspector}
                    title="AVR Register Inspector"
                    className={[
                        'px-2 py-0.5 rounded text-[11px] font-mono shrink-0',
                        'transition-colors',
                        showInspector
                            ? 'bg-purple-600/25 text-purple-300 border border-purple-500/40'
                            : 'text-vscode-text opacity-60 hover:opacity-100 hover:bg-vscode-hover',
                    ].join(' ')}
                >
                    CPU
                </button>
            )}
            {onToggleOscilloscope && (
                <button
                    onClick={onToggleOscilloscope}
                    title="Oscilloscope / Logic Analyzer"
                    className={[
                        'px-2 py-0.5 rounded text-[11px] font-mono ml-1 shrink-0',
                        'transition-colors',
                        showOscilloscope
                            ? 'bg-cyan-600/25 text-cyan-300 border border-cyan-500/40'
                            : 'text-vscode-text opacity-60 hover:opacity-100 hover:bg-vscode-hover',
                    ].join(' ')}
                >
                    OSC
                </button>
            )}

            {(onToggleInspector || onToggleOscilloscope) && (
                <div className="h-4 w-px bg-vscode-divider mx-1 shrink-0" />
            )}

            {/* Sim info */}
            <div className="flex items-center gap-1.5 text-[12px] font-mono shrink-0">
                <span className="text-vscode-text opacity-50 tabular-nums">{simTime}</span>
                <span className={[
                    'px-1.5 py-0.5 rounded text-[11px] font-bold tabular-nums',
                    Number.parseInt(simSpeed) >= 100
                        ? 'bg-green-900/40 text-green-400'
                        : 'bg-yellow-900/40 text-yellow-400',
                ].join(' ')}>
                    {simSpeed}
                </span>
            </div>
        </div>
    );
}
