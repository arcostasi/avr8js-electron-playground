import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertTriangle,
    Check,
    CheckCircle2,
    Copy,
    Loader2,
    RotateCw,
    Terminal,
    X,
} from 'lucide-react';
import {
    classifyBuildLogLine,
    extractArduinoMemorySummary,
    getBuildStageProgress,
    type BuildLogLine,
    type BuildLogTone,
    type BuildOverlayStage,
    type BuildOverlayState,
} from './build-overlay-utils';

interface BuildProgressOverlayProps {
    state?: BuildOverlayState | null;
    onClose?: () => void;
    onRetry?: () => void;
}

const LOG_TONE_CLASSES: Record<BuildLogTone, string> = {
    error: 'text-rose-300 font-medium',
    warning: 'text-amber-300',
    memory: 'text-emerald-300',
    status: 'text-sky-300/95',
    normal: 'text-slate-200/85',
};

function formatElapsed(elapsedMs: number): string {
    const safeMs = Math.max(0, elapsedMs);
    if (safeMs < 1000) {
        return `${Math.round(safeMs)}ms`;
    }
    return `${(safeMs / 1000).toFixed(1)}s`;
}

function getPipelineStepState(
    stepIndex: number,
    stage: BuildOverlayStage,
    status: BuildOverlayState['status'],
): 'done' | 'active' | 'error' | 'pending' {
    const stageStepIndex: Record<BuildOverlayStage, number> = {
        prepare: 0,
        chips: 1,
        compile: 1,
        save: 2,
        done: 3,
        error: 1,
    };

    if (status === 'success') return 'done';

    const currentStep = stageStepIndex[stage];
    if (status === 'error') {
        if (stepIndex < currentStep) return 'done';
        if (stepIndex === currentStep) return 'error';
        return 'pending';
    }

    if (stepIndex < currentStep) return 'done';
    if (stepIndex === currentStep) return 'active';
    return 'pending';
}

function renderStatusIcon(status: BuildOverlayState['status']) {
    if (status === 'building') {
        return (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-sky-400/35 bg-sky-500/15 text-sky-300">
                <Loader2 className="h-4 w-4 animate-spin" />
            </div>
        );
    }
    if (status === 'success') {
        return (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-emerald-400/35 bg-emerald-500/15 text-emerald-300">
                <CheckCircle2 className="h-4 w-4" />
            </div>
        );
    }
    return (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-rose-400/40 bg-rose-500/20 text-rose-300">
            <AlertTriangle className="h-4 w-4" />
        </div>
    );
}

function BuildLogRow({ line }: Readonly<{ line: BuildLogLine }>) {
    const tone = classifyBuildLogLine(line);
    const prefix = line.stream === 'status' ? '›' : ' ';
    return (
        <div className={`flex gap-2 whitespace-pre-wrap break-words ${LOG_TONE_CLASSES[tone]}`}>
            <span className="select-none opacity-45">{prefix}</span>
            <span className="flex-1">{line.text}</span>
        </div>
    );
}

export default function BuildProgressOverlay({
    state,
    onClose,
    onRetry,
}: Readonly<BuildProgressOverlayProps>) {
    const [nowMs, setNowMs] = useState(() => Date.now());
    const [copied, setCopied] = useState(false);
    const logEndRef = useRef<HTMLDivElement | null>(null);
    const copiedTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);

    const status = state?.status;
    const isBuilding = status === 'building';
    const lastLogId = state && state.logs.length > 0 ? state.logs[state.logs.length - 1].id : null;
    const logContainerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!isBuilding) return undefined;
        setNowMs(Date.now());
        const intervalId = globalThis.setInterval(() => {
            setNowMs(Date.now());
        }, 100);
        return () => globalThis.clearInterval(intervalId);
    }, [isBuilding, state?.buildId]);

    useEffect(() => {
        if (lastLogId === null) return;
        const container = logContainerRef.current;
        if (container) {
            const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
            if (distanceFromBottom > 40) return;
            container.scrollTop = container.scrollHeight;
            return;
        }
        logEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, [lastLogId]);

    useEffect(() => {
        if (!state || isBuilding) return undefined;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose?.();
            }
        };
        globalThis.addEventListener('keydown', onKeyDown);
        return () => globalThis.removeEventListener('keydown', onKeyDown);
    }, [isBuilding, onClose, state]);

    useEffect(() => {
        setCopied(false);
        return () => {
            if (copiedTimerRef.current !== null) {
                globalThis.clearTimeout(copiedTimerRef.current);
            }
        };
    }, [state?.buildId]);

    const memorySummary = useMemo(
        () => (state ? extractArduinoMemorySummary(state.logs) : []),
        [state],
    );

    if (!state) return null;

    const progressPercent = getBuildStageProgress(state.stage, state.status);
    const elapsedLabel = formatElapsed((state.finishedAt ?? nowMs) - state.startedAt);
    const backendLabel = state.backend === 'local' ? 'arduino-cli' : 'Hexi Cloud';
    const pipelineSteps = ['1. Prepare', '2. Compile', '3. Save build/'];

    let cardToneClass = 'border-sky-400/30 shadow-sky-950/35';
    let barGradientClass = 'from-sky-400 via-cyan-300 to-blue-500 animate-pulse';
    if (state.status === 'success') {
        cardToneClass = 'border-emerald-400/35 shadow-emerald-950/35';
        barGradientClass = 'from-emerald-400 via-teal-300 to-emerald-500';
    } else if (state.status === 'error') {
        cardToneClass = 'border-rose-400/45 shadow-rose-950/45';
        barGradientClass = 'from-rose-500 via-red-400 to-amber-500';
    }

    const handleCopyError = () => {
        const fullText = [
            state.headline,
            state.errorSummary ?? '',
            ...state.logs.map((entry) => entry.text),
        ]
            .filter(Boolean)
            .join('\n');

        void navigator.clipboard?.writeText(fullText).then(() => {
            setCopied(true);
            if (copiedTimerRef.current !== null) {
                globalThis.clearTimeout(copiedTimerRef.current);
            }
            copiedTimerRef.current = globalThis.setTimeout(() => {
                setCopied(false);
            }, 1800);
        });
    };

    return (
        <div
            onClick={(event) => {
                if (event.target === event.currentTarget && state.status === 'error') {
                    onClose?.();
                }
            }}
            className={[
                'absolute inset-0 z-50 flex items-center justify-center p-5',
                'bg-black/22 backdrop-blur-[2px] transition-opacity',
                state.status === 'error' ? 'pointer-events-auto' : 'pointer-events-none',
            ].join(' ')}
            role="dialog"
            aria-modal={state.status === 'error'}
            aria-label={state.headline}
        >
            <div
                onPointerDown={(event) => event.stopPropagation()}
                onWheel={(event) => event.stopPropagation()}
                className={[
                    'pointer-events-auto w-full max-w-[540px] overflow-hidden rounded-2xl border',
                    'bg-vscode-panel/86 text-vscode-text shadow-2xl backdrop-blur-md',
                    cardToneClass,
                ].join(' ')}
            >
                {/* Top animated progress bar */}
                <div className="h-[3px] w-full bg-white/8 overflow-hidden">
                    <div
                        className={`h-full bg-gradient-to-r transition-all duration-300 ${barGradientClass}`}
                        style={{ width: `${progressPercent}%` }}
                    />
                </div>

                {/* Header */}
                <div className="flex items-start gap-3 px-4 pt-3.5 pb-3 border-b border-vscode-border/60">
                    {renderStatusIcon(state.status)}

                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                            <h3 className="truncate text-[13px] font-semibold text-vscode-textActive">
                                {state.headline}
                            </h3>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px]">
                            <span className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/6 px-2 py-0.5 font-mono text-vscode-text/90">
                                <Terminal className="h-3 w-3 opacity-75" />
                                {backendLabel}
                            </span>
                            {state.fqbn ? (
                                <span className="rounded-md border border-white/10 bg-white/6 px-2 py-0.5 font-mono text-vscode-text/80">
                                    {state.fqbn}
                                </span>
                            ) : (
                                <span className="rounded-md border border-white/10 bg-white/6 px-2 py-0.5 font-mono text-vscode-text/80">
                                    {state.board}
                                </span>
                            )}
                            <span className="rounded-md border border-white/10 bg-white/6 px-2 py-0.5 font-mono text-vscode-text/75">
                                {elapsedLabel}
                            </span>
                        </div>
                    </div>

                    {state.status !== 'building' && (
                        <button
                            type="button"
                            onClick={onClose}
                            title="Close (Esc)"
                            aria-label="Close build dialog"
                            className="rounded-lg p-1.5 text-vscode-text/70 hover:bg-white/10 hover:text-vscode-textActive transition-colors"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>

                {/* 3-step pipeline strip */}
                <div className="grid grid-cols-3 gap-2 px-4 py-2.5 border-b border-vscode-border/45 bg-black/15 text-[10px]">
                    {pipelineSteps.map((label, index) => {
                        const stepState = getPipelineStepState(index, state.stage, state.status);
                        let badgeClass = 'border-white/10 bg-white/4 text-vscode-text/55';
                        if (stepState === 'active') {
                            badgeClass = 'border-sky-400/40 bg-sky-500/18 text-sky-200 font-medium';
                        } else if (stepState === 'done') {
                            badgeClass = 'border-emerald-400/30 bg-emerald-500/12 text-emerald-200';
                        } else if (stepState === 'error') {
                            badgeClass = 'border-rose-400/45 bg-rose-500/20 text-rose-200 font-medium';
                        }

                        return (
                            <div
                                key={label}
                                className={`flex items-center justify-center rounded-lg border px-2 py-1 text-center ${badgeClass}`}
                            >
                                {label}
                            </div>
                        );
                    })}
                </div>

                {/* Real-time output console */}
                <div className="p-4 space-y-3">
                    <div
                        ref={logContainerRef}
                        className="max-h-56 overflow-y-auto rounded-xl border border-white/10 bg-black/55 px-3.5 py-2.5 font-mono text-[11px] leading-relaxed selectable"
                    >
                        {state.logs.length === 0 ? (
                            <div className="text-slate-400/75">Waiting for compiler output...</div>
                        ) : (
                            state.logs.map((line) => <BuildLogRow key={line.id} line={line} />)
                        )}

                        {state.status === 'building' && (
                            <div className="mt-1 flex items-center gap-1.5 text-sky-300/80">
                                <span className="inline-block h-2 w-1.5 animate-pulse rounded-xs bg-sky-400" />
                                <span className="text-[10px]">Streaming live build output...</span>
                            </div>
                        )}
                        <div ref={logEndRef} />
                    </div>

                    {state.status === 'success' && memorySummary.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                            {memorySummary.map((line) => (
                                <span
                                    key={line}
                                    className="rounded-lg border border-emerald-400/25 bg-emerald-500/12 px-2.5 py-1 font-mono text-[10px] text-emerald-200"
                                >
                                    {line}
                                </span>
                            ))}
                        </div>
                    )}

                    {state.status === 'error' && (
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                            <span
                                title={state.errorSummary || 'Compilation failed. Inspect the output above.'}
                                className="min-w-0 flex-1 line-clamp-2 break-words text-[11px] text-rose-200/85"
                            >
                                {state.errorSummary || 'Compilation failed. Inspect the output above.'}
                            </span>

                            <div className="flex shrink-0 items-center gap-2">
                                <button
                                    type="button"
                                    onClick={handleCopyError}
                                    className={[
                                        'inline-flex items-center gap-1.5 rounded-lg border border-white/15',
                                        'bg-white/8 px-2.5 py-1.5 text-[11px] text-vscode-text',
                                        'hover:bg-white/14 hover:text-vscode-textActive transition-colors',
                                    ].join(' ')}
                                >
                                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
                                    {copied ? 'Copied' : 'Copy Error'}
                                </button>

                                {onRetry && (
                                    <button
                                        type="button"
                                        onClick={onRetry}
                                        className={[
                                            'inline-flex items-center gap-1.5 rounded-lg border border-sky-400/35',
                                            'bg-sky-500/20 px-2.5 py-1.5 text-[11px] font-medium text-sky-100',
                                            'hover:bg-sky-500/30 transition-colors',
                                        ].join(' ')}
                                    >
                                        <RotateCw className="h-3.5 w-3.5" />
                                        Retry
                                    </button>
                                )}

                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-rose-400/45 bg-rose-500/25 px-3 py-1.5 text-[11px] font-medium text-rose-50 hover:bg-rose-500/38 transition-colors"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
