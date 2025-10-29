/**
 * PinTooltip
 * Floating label that shows the hovered pin name in edit mode.
 */
import React from 'react';
import type { PinPosition, WokwiDiagram } from '../../types/wokwi.types';
import {
    formatBoardPinPwmLabel,
    formatSimulatorPinReference,
    getConnectionRouteHints,
    getBoardPinFunctionBadges,
    getWiringCandidateSummary,
    getWiringCandidateStatus,
    resolveSimulatorPinMetadata,
} from '../../utils/pin-capabilities';

interface PinTooltipProps {
    hoveredPin: string | null;
    wiringStart: string | null;
    pinPositions: Record<string, PinPosition>;
    diagram?: WokwiDiagram;
    isEditMode: boolean;
    zoom: number;
    pan: { x: number; y: number };
}

export default function PinTooltip({
    hoveredPin, wiringStart, pinPositions, diagram, isEditMode, zoom, pan,
}: Readonly<PinTooltipProps>) {
    if (!hoveredPin || !pinPositions[hoveredPin] || !isEditMode) {
        return null;
    }

    const pos = pinPositions[hoveredPin];
    const metadata = resolveSimulatorPinMetadata(diagram, hoveredPin);
    const portLabel = metadata?.boardPin?.portId !== undefined && metadata.boardPin.bit !== undefined
        ? `PORT${metadata.boardPin.portId}${metadata.boardPin.bit}`
        : null;
    const pwmLabel = metadata?.boardPin ? formatBoardPinPwmLabel(metadata.boardPin) : null;
    const functionBadges = metadata?.boardPin ? getBoardPinFunctionBadges(metadata.boardPin) : [];
    const adcLabel = typeof metadata?.boardPin?.adcChannel === 'number'
        ? `ADC${metadata.boardPin.adcChannel}`
        : null;
    const wiringStatus = hoveredPin && wiringStart
        ? getWiringCandidateStatus(diagram, wiringStart, hoveredPin)
        : 'neutral';
    const wiringHints = hoveredPin && wiringStart && wiringStatus === 'invalid'
        ? getConnectionRouteHints(diagram, wiringStart, hoveredPin)
        : [];
    const wiringSummary = hoveredPin && wiringStart && wiringStatus === 'valid'
        ? getWiringCandidateSummary(diagram, wiringStart, hoveredPin)
        : null;
    const wiringStartLabel = wiringStart
        ? formatSimulatorPinReference(diagram, wiringStart)
        : null;

    return (
        <div
            className={[
                'absolute z-40 pointer-events-none',
                'px-2.5 py-1.5 rounded bg-black/85',
                'text-[10px] font-mono text-blue-300',
                'border border-blue-500/30 shadow-lg',
                'whitespace-nowrap max-w-[240px]',
            ].join(' ')}
            style={{
                left: pos.x * zoom + pan.x + 14,
                top: pos.y * zoom + pan.y - 6,
            }}
        >
            <div className="text-blue-200">{metadata?.displayName ?? hoveredPin}</div>
            {metadata?.kind === 'board' && metadata.boardProfile && (
                <div className="mt-1 text-[9px] text-blue-100/70">
                    {metadata.boardProfile.name}
                </div>
            )}
            {(portLabel || adcLabel || pwmLabel) && (
                <div className="mt-1 flex flex-wrap gap-1 text-[9px]">
                    {portLabel && (
                        <span className="rounded border border-blue-400/20 bg-blue-500/10 px-1.5 py-0.5 text-blue-100/85">
                            {portLabel}
                        </span>
                    )}
                    {adcLabel && (
                        <span className="rounded border border-emerald-400/20 bg-emerald-500/10 px-1.5 py-0.5 text-emerald-100/85">
                            {adcLabel}
                        </span>
                    )}
                    {pwmLabel && (
                        <span className="rounded border border-amber-400/20 bg-amber-500/10 px-1.5 py-0.5 text-amber-100/90">
                            PWM {pwmLabel}
                        </span>
                    )}
                    {functionBadges.map((badge) => (
                        <span
                            key={badge}
                            className="rounded border border-fuchsia-400/20 bg-fuchsia-500/10 px-1.5 py-0.5 text-fuchsia-100/90"
                        >
                            {badge}
                        </span>
                    ))}
                </div>
            )}
            {wiringHints.length > 0 && wiringStartLabel && (
                <div className="mt-2 max-w-[280px] rounded border border-rose-400/30 bg-rose-500/12 px-2 py-1.5 text-[9px] text-rose-50/95 whitespace-normal">
                    <div className="uppercase tracking-widest text-[8px] text-rose-200/80">
                        Invalid target from {wiringStartLabel}
                    </div>
                    <div className="mt-1 space-y-1">
                        {wiringHints.map((hint) => (
                            <div key={hint}>{hint}</div>
                        ))}
                    </div>
                </div>
            )}
            {wiringSummary && wiringStartLabel && (
                <div className="mt-2 max-w-[280px] rounded border border-emerald-400/30 bg-emerald-500/12 px-2 py-1.5 text-[9px] text-emerald-50/95 whitespace-normal">
                    <div className="uppercase tracking-widest text-[8px] text-emerald-200/80">
                        {wiringSummary.title} from {wiringStartLabel}
                    </div>
                    <div className="mt-1 text-emerald-50/95">
                        {wiringSummary.detail}
                    </div>
                </div>
            )}
        </div>
    );
}
