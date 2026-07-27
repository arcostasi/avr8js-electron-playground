/**
 * SimulatorToolbar
 * Top toolbar with mode toggle, build/run/stop controls, simulation info,
 * wire color picker, add component trigger, and speed control.
 */
import React from 'react';
import { Play, Square, RotateCw, Wrench, MousePointer2, Undo2, Redo2, Save, Check, Loader2, Box, CircuitBoard } from 'lucide-react';
import type { ProjectSaveStatus } from '../../types/wokwi.types';

interface SimulatorToolbarProps {
    isEditMode: boolean;
    onToggleEditMode: () => void;
    hasOpenProject?: boolean;
    canCompile?: boolean;
    hasParts?: boolean;
    hasCustomView?: boolean;
    isCustomViewActive?: boolean;
    onToggleCustomView?: () => void;
    isPlaying: boolean;
    isCompiling: boolean;
    hex: string | null | undefined;
    onCompile: () => void;
    onPlay: () => void;
    onStop: () => void;
    onRestart?: () => void;
    onSaveProject?: () => void;
    canSaveProject?: boolean;
    hasUnsavedChanges?: boolean;
    saveStatus?: ProjectSaveStatus;
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
    hasOpenProject = true,
    canCompile = true,
    hasParts = true,
    hasCustomView = false, isCustomViewActive = false, onToggleCustomView,
    isPlaying, isCompiling, hex,
    onCompile, onPlay, onStop, onRestart,
    onSaveProject, canSaveProject = false, hasUnsavedChanges = false, saveStatus = 'idle',
    simTime, simSpeed,
    speedMultiplier = 1.0, onSpeedChange,
    renderAddMenu,
    onUndo, onRedo, canUndo, canRedo,
    showInspector, onToggleInspector,
    showOscilloscope, onToggleOscilloscope,
}: SimulatorToolbarProps) {
    const buildDisabled = !hasOpenProject || !canCompile || isCompiling || isPlaying;
    let buildTitle = 'Build / Compile (F5)';
    if (!hasOpenProject) {
        buildTitle = 'No project open — open or create a project to build';
    } else if (!canCompile && !isCompiling) {
        buildTitle = 'No compilable sketch (.ino) in project';
    } else if (isCompiling) {
        buildTitle = 'Build in progress...';
    } else if (isPlaying) {
        buildTitle = 'Stop simulation before building';
    }

    const runDisabled = !hasOpenProject || isPlaying || isCompiling || !hex || !hasParts;
    let runTitle = 'Run simulation';
    if (!hasOpenProject) {
        runTitle = 'No project open';
    } else if (isCompiling) {
        runTitle = 'Wait for build to finish';
    } else if (!hasParts) {
        runTitle = 'Add a board to the circuit before running';
    } else if (!hex) {
        runTitle = 'Build the project first (F5) to generate firmware';
    } else if (isPlaying) {
        runTitle = 'Simulation is already running';
    }

    let saveButtonTitle = hasOpenProject ? 'No project folder — cannot save' : 'No project open';
    let saveButtonClass = 'text-vscode-border cursor-not-allowed';
    if (saveStatus === 'saving') {
        saveButtonTitle = 'Saving project...';
        saveButtonClass = 'text-blue-400 bg-blue-500/15 border border-blue-500/35 cursor-wait';
    } else if (saveStatus === 'saved') {
        saveButtonTitle = 'Project saved';
        saveButtonClass = 'text-emerald-400 bg-emerald-500/15 border border-emerald-500/35';
    } else if (saveStatus === 'error') {
        saveButtonTitle = 'Failed to save project';
        saveButtonClass = 'text-rose-400 bg-rose-500/15 border border-rose-500/35';
    } else if (canSaveProject && hasUnsavedChanges) {
        saveButtonTitle = 'Save project (Ctrl+S) — unsaved changes';
        saveButtonClass = 'text-blue-400 hover:text-blue-300 bg-blue-500/15 border border-blue-500/35';
    } else if (canSaveProject) {
        saveButtonTitle = 'Save project (Ctrl+S)';
        saveButtonClass = 'text-vscode-text hover:text-vscode-textActive hover:bg-vscode-hover border border-transparent';
    }

    let saveIcon: React.ReactNode = <Save size={14} />;
    if (saveStatus === 'saving') {
        saveIcon = <Loader2 size={14} className="animate-spin" />;
    } else if (saveStatus === 'saved') {
        saveIcon = <Check size={14} />;
    }

    return (
        <div className={
            'flex flex-wrap items-center gap-x-1 gap-y-1 px-2 py-1 min-w-0 '
            + 'bg-vscode-surface2 border-b border-vscode-border '
            + 'z-10 shrink-0 overflow-visible'
        }>

            {/* Add Component (visible in edit mode when not inside Custom View) */}
            {isEditMode && !isCustomViewActive && renderAddMenu}

            {/* Undo / Redo (edit mode only, outside Custom View) */}
            {isEditMode && !isCustomViewActive && (
                <>
                    <button
                        type="button"
                        onClick={onUndo}
                        disabled={!hasOpenProject || !canUndo}
                        title={hasOpenProject ? 'Undo (Ctrl+Z)' : 'Open a project to edit'}
                        className={[
                            'flex items-center justify-center',
                            'w-6 h-6 rounded',
                            'transition-all',
                            hasOpenProject && canUndo
                                ? 'text-vscode-text hover:text-vscode-textActive hover:bg-vscode-hover'
                                : 'text-vscode-border cursor-not-allowed',
                        ].join(' ')}
                    >
                        <Undo2 size={14} />
                    </button>
                    <button
                        type="button"
                        onClick={onRedo}
                        disabled={!hasOpenProject || !canRedo}
                        title={hasOpenProject ? 'Redo (Ctrl+Y)' : 'Open a project to edit'}
                        className={[
                            'flex items-center justify-center',
                            'w-6 h-6 rounded',
                            'transition-all',
                            hasOpenProject && canRedo
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
            {!isCustomViewActive && (
                <button
                    type="button"
                    onClick={onToggleEditMode}
                    disabled={!hasOpenProject}
                    title={!hasOpenProject
                        ? 'Open or create a project to edit the circuit'
                        : isEditMode ? 'Switch to Run Mode' : 'Switch to Edit Mode'}
                    className={[
                        'flex items-center gap-1',
                        'px-2 py-1 rounded text-[12px]',
                        'font-medium transition-all',
                        !hasOpenProject
                            ? 'text-vscode-border cursor-not-allowed'
                            : isEditMode
                                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40'
                                : 'text-vscode-text hover:text-vscode-textActive hover:bg-vscode-hover',
                    ].join(' ')}
                >
                    <MousePointer2 size={14} />
                    {isEditMode ? 'Edit' : 'View'}
                </button>
            )}

            {hasCustomView && onToggleCustomView && (
                <button
                    type="button"
                    onClick={onToggleCustomView}
                    title={isCustomViewActive ? 'Switch to Circuit View' : 'Switch to Custom View'}
                    className={[
                        'flex items-center gap-1',
                        'px-2 py-1 rounded text-[12px]',
                        'font-medium transition-all',
                        isCustomViewActive
                            ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/40'
                            : 'text-vscode-text hover:text-vscode-textActive hover:bg-vscode-hover',
                    ].join(' ')}
                >
                    {isCustomViewActive ? <CircuitBoard size={14} /> : <Box size={14} />}
                    {isCustomViewActive ? 'Circuit' : 'Custom View'}
                </button>
            )}

            {onSaveProject && (
                <button
                    type="button"
                    onClick={onSaveProject}
                    disabled={!canSaveProject || saveStatus === 'saving'}
                    title={saveButtonTitle}
                    aria-label="Save project"
                    className={[
                        'relative flex items-center justify-center w-7 h-7 rounded transition-all',
                        saveButtonClass,
                    ].join(' ')}
                >
                    {saveIcon}
                    {hasUnsavedChanges && canSaveProject && saveStatus === 'idle' && (
                        <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-amber-400 ring-1 ring-vscode-surface2" />
                    )}
                </button>
            )}

            <div className="h-4 w-px bg-vscode-divider mx-0.5" />

            {/* Build / Run / Stop */}
            <button
                type="button"
                onClick={onCompile}
                disabled={buildDisabled}
                title={buildTitle}
                className={[
                    'flex items-center gap-1',
                    'px-2 py-1 rounded text-[12px]',
                    'font-medium transition-all',
                    buildDisabled
                        ? 'text-vscode-border cursor-not-allowed'
                        : 'text-vscode-text hover:text-vscode-textActive hover:bg-vscode-hover',
                ].join(' ')}
            >
                <Wrench size={14} className={isCompiling ? 'animate-spin' : ''} />
                Build
            </button>

            <button
                type="button"
                onClick={onPlay}
                disabled={runDisabled}
                title={runTitle}
                className={[
                    'flex items-center gap-1',
                    'px-2 py-1 rounded text-[12px]',
                    'font-medium transition-all',
                    runDisabled
                        ? 'text-vscode-border cursor-not-allowed'
                        : 'text-green-500 hover:text-green-400 hover:bg-green-900/20',
                ].join(' ')}
            >
                <Play size={14} />
                Run
            </button>

            <button
                type="button"
                onClick={onStop}
                disabled={!isPlaying}
                title={!isPlaying ? 'Simulation is not running' : 'Stop simulation'}
                className={[
                    'flex items-center gap-1',
                    'px-2 py-1 rounded text-[12px]',
                    'font-medium transition-all',
                    !isPlaying
                        ? 'text-vscode-border cursor-not-allowed'
                        : 'text-red-400 hover:text-red-300 hover:bg-red-900/20',
                ].join(' ')}
            >
                <Square size={14} />
                Stop
            </button>

            {isPlaying && onRestart && (
                <button
                    type="button"
                    onClick={onRestart}
                    title="Restart simulation"
                    className={[
                        'flex items-center justify-center',
                        'p-1.5 rounded text-[12px]',
                        'text-amber-300 hover:text-amber-200 hover:bg-amber-900/20 transition-all',
                    ].join(' ')}
                >
                    <RotateCw size={13} />
                </button>
            )}

            {/* Spacer */}
            <div className="flex-1 min-w-0" />

            {/* Speed control */}
            {onSpeedChange && (
                <div className={`flex items-center gap-1 text-[11px] shrink-0 ${hasOpenProject ? '' : 'opacity-45'}`}>
                    <input
                        type="range"
                        min={0.05}
                        max={4}
                        step={0.05}
                        disabled={!hasOpenProject}
                        value={speedMultiplier}
                        onChange={e => onSpeedChange(parseFloat(e.target.value))}
                        title={hasOpenProject ? `Speed: ${speedMultiplier.toFixed(2)}×` : 'Open a project to adjust speed'}
                        className={[
                            'w-16 themed-slider',
                            hasOpenProject ? 'cursor-pointer' : 'cursor-not-allowed',
                        ].join(' ')}
                        style={{ '--pct': `${((speedMultiplier - 0.05) / (4 - 0.05) * 100).toFixed(1)}%` } as React.CSSProperties}
                    />
                    <button
                        type="button"
                        disabled={!hasOpenProject}
                        onClick={() => onSpeedChange(1)}
                        title={hasOpenProject ? 'Click to reset speed to 1.0×' : 'Open a project to adjust speed'}
                        className={[
                            'w-9 font-mono text-right tabular-nums rounded px-0.5 transition-colors',
                            !hasOpenProject
                                ? 'text-vscode-border cursor-not-allowed'
                                : Math.abs(speedMultiplier - 1) > 0.01
                                    ? 'text-blue-400 hover:bg-vscode-hover'
                                    : 'text-vscode-text hover:bg-vscode-hover',
                        ].join(' ')}
                    >
                        {speedMultiplier.toFixed(1)}×
                    </button>
                    <div className="h-4 w-px bg-vscode-divider mx-0.5" />
                </div>
            )}

            {/* Panel toggles */}
            {onToggleInspector && (
                <button
                    type="button"
                    disabled={!hasOpenProject}
                    onClick={onToggleInspector}
                    title={hasOpenProject ? 'AVR Register Inspector' : 'Open a project to inspect AVR registers'}
                    className={[
                        'px-2 py-0.5 rounded text-[11px] font-mono shrink-0',
                        'transition-colors',
                        !hasOpenProject
                            ? 'text-vscode-text opacity-35 cursor-not-allowed'
                            : showInspector
                                ? 'bg-purple-600/25 text-purple-300 border border-purple-500/40'
                                : 'text-vscode-text opacity-60 hover:opacity-100 hover:bg-vscode-hover',
                    ].join(' ')}
                >
                    CPU
                </button>
            )}
            {onToggleOscilloscope && (
                <button
                    type="button"
                    disabled={!hasOpenProject}
                    onClick={onToggleOscilloscope}
                    title={hasOpenProject ? 'Oscilloscope / Logic Analyzer' : 'Open a project to use the oscilloscope'}
                    className={[
                        'px-2 py-0.5 rounded text-[11px] font-mono ml-1 shrink-0',
                        'transition-colors',
                        !hasOpenProject
                            ? 'text-vscode-text opacity-35 cursor-not-allowed'
                            : showOscilloscope
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
