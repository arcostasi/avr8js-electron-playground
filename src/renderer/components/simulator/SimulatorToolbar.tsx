/**
 * SimulatorToolbar
 * Top toolbar with mode toggle, build/run/stop controls, simulation info,
 * wire color picker, and add component trigger.
 */
import React from 'react';
import { Play, Square, Wrench, MousePointer2 } from 'lucide-react';

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
    renderAddMenu: React.ReactNode;
}

export default function SimulatorToolbar({
    isEditMode, onToggleEditMode,
    isPlaying, isCompiling, hex,
    onCompile, onPlay, onStop,
    simTime, simSpeed,
    renderAddMenu,
}: SimulatorToolbarProps) {
    return (
        <div className={
            'flex items-center gap-1.5 px-2 py-1.5 '
            + 'bg-[#222222] border-b border-[#333] '
            + 'z-10 shrink-0'
        }>

            {/* Add Component (always visible in edit mode) */}
            {isEditMode && renderAddMenu}

            {/* Group 1: Mode Toggle */}
            <button
                onClick={onToggleEditMode}
                title={
                    isEditMode
                        ? 'Switch to Run Mode'
                        : 'Switch to Edit Mode'
                }
                className={[
                    'flex items-center gap-1.5',
                    'px-3 py-1.5 rounded text-[13px]',
                    'font-medium transition-all',
                    isEditMode
                        ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40'
                        : 'text-gray-400 hover:text-gray-200 hover:bg-[#333]',
                ].join(' ')}
            >
                <MousePointer2 size={15} />
                {isEditMode ? 'Editing' : 'View'}
            </button>

            <div className="h-5 w-px bg-[#444] mx-1" />

            {/* Group 2: Build & Run */}
            <button
                onClick={onCompile}
                disabled={isCompiling || isPlaying}
                title="Compile"
                className={[
                    'flex items-center gap-1.5',
                    'px-3 py-1.5 rounded text-[13px]',
                    'font-medium transition-all',
                    isCompiling || isPlaying
                        ? 'text-gray-600 cursor-not-allowed'
                        : 'text-gray-300 hover:text-white hover:bg-[#333]',
                ].join(' ')}
            >
                <Wrench size={14} className={isCompiling ? 'animate-spin' : ''} />
                Build
            </button>

            <button
                onClick={onPlay}
                disabled={isPlaying || !hex}
                title="Run"
                className={[
                    'flex items-center gap-1.5',
                    'px-3 py-1.5 rounded text-[13px]',
                    'font-medium transition-all',
                    isPlaying || !hex
                        ? 'text-gray-600 cursor-not-allowed'
                        : 'text-green-400 hover:text-green-300 hover:bg-green-900/30',
                ].join(' ')}
            >
                <Play size={14} />
                Run
            </button>

            <button
                onClick={onStop}
                disabled={!isPlaying}
                title="Stop"
                className={[
                    'flex items-center gap-1.5',
                    'px-3 py-1.5 rounded text-[13px]',
                    'font-medium transition-all',
                    !isPlaying
                        ? 'text-gray-600 cursor-not-allowed'
                        : 'text-red-400 hover:text-red-300 hover:bg-red-900/30',
                ].join(' ')}
            >
                <Square size={14} />
                Stop
            </button>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Group 3: Sim info */}
            <div className="flex items-center gap-2 text-[13px] font-mono tracking-wide">
                <span className="text-gray-500">{simTime}</span>
                <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${Number.parseInt(simSpeed) >= 100
                    ? 'bg-green-900/40 text-green-400'
                    : 'bg-yellow-900/40 text-yellow-400'
                    }`}>{simSpeed}</span>
            </div>

            <>
                <div className="h-5 w-px bg-[#444] mx-1" />
                {/* Wire Color logic moved to WireColorPopup. Render add component instead. */}
            </>
        </div>
    );
}
