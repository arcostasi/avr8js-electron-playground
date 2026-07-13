import React, { useEffect, useMemo, useRef } from 'react';
import type { WokwiPart } from '../../../types/wokwi.types';
import {
    DOT_MATRIX_BORDER,
    computeDotMatrixGeometry,
    computeDotMatrixLedAppearance,
    resolveDotMatrixConfig,
    type DotMatrixHostElement,
} from './dot-matrix-config';
import './dot-matrix.css';

function applyLedPixel(glowEl: HTMLDivElement, grb: number): void {
    const appearance = computeDotMatrixLedAppearance(grb);
    if (appearance.active) {
        glowEl.style.background = appearance.background;
        glowEl.style.boxShadow = appearance.boxShadow;
        glowEl.style.opacity = appearance.opacity;
        glowEl.classList.add('is-active');
    } else {
        glowEl.style.background = '';
        glowEl.style.boxShadow = '';
        glowEl.style.opacity = '';
        glowEl.classList.remove('is-active');
    }
}

interface DotMatrixPartProps {
    part: WokwiPart;
    isEditMode: boolean;
    isDragging: boolean;
    isSelected: boolean;
    onPartPointerDown: (e: React.PointerEvent, part: WokwiPart) => void;
    onPartClick: (partId: string) => void;
    onRotate?: (partId: string, degrees: number) => void;
}

export default function DotMatrixPart({
    part,
    isEditMode,
    isDragging,
    isSelected,
    onPartPointerDown,
    onPartClick,
}: Readonly<DotMatrixPartProps>) {
    const hostRef = useRef<HTMLDivElement>(null);
    const ledGlowRefs = useRef<Array<HTMLDivElement | null>>([]);
    const lastPixelsRef = useRef<Uint32Array>(new Uint32Array(0));

    const config = useMemo(() => resolveDotMatrixConfig(part.attrs), [part.attrs]);
    const geometry = useMemo(() => computeDotMatrixGeometry(config), [config]);
    const totalPixels = config.cols * config.rows;

    const rowIndices = useMemo(() => Array.from({ length: config.rows }, (_, i) => i), [config.rows]);
    const colIndices = useMemo(() => Array.from({ length: config.cols }, (_, i) => i), [config.cols]);

    useEffect(() => {
        ledGlowRefs.current.length = totalPixels;
        const previous = lastPixelsRef.current;
        const nextBuffer = new Uint32Array(totalPixels);
        if (previous.length > 0) {
            nextBuffer.set(previous.subarray(0, Math.min(previous.length, totalPixels)));
        }
        lastPixelsRef.current = nextBuffer;

        for (let i = 0; i < totalPixels; i++) {
            const glowEl = ledGlowRefs.current[i];
            if (!glowEl) continue;
            applyLedPixel(glowEl, nextBuffer[i]);
        }
    }, [totalPixels]);

    useEffect(() => {
        const host = hostRef.current as DotMatrixHostElement | null;
        if (!host) return;

        host.pinInfo = geometry.pinInfo;
        host.getPixelCount = () => totalPixels;

        host.setPixels = (pixels: Uint32Array) => {
            const last = lastPixelsRef.current;
            const limit = Math.min(totalPixels, pixels.length);

            for (let i = 0; i < limit; i++) {
                const nextGrb = pixels[i];
                if (last[i] === nextGrb) continue;
                last[i] = nextGrb;

                const glowEl = ledGlowRefs.current[i];
                if (!glowEl) continue;

                applyLedPixel(glowEl, nextGrb);
            }

            for (let i = limit; i < totalPixels; i++) {
                if (last[i] === 0) continue;
                last[i] = 0;
                const glowEl = ledGlowRefs.current[i];
                if (!glowEl) continue;
                applyLedPixel(glowEl, 0);
            }
        };

        host.clearPixels = () => {
            lastPixelsRef.current.fill(0);
            for (let i = 0; i < totalPixels; i++) {
                const glowEl = ledGlowRefs.current[i];
                if (!glowEl) continue;
                applyLedPixel(glowEl, 0);
            }
        };

        return () => {
            delete host.getPixelCount;
            delete host.setPixels;
            delete host.clearPixels;
        };
    }, [geometry.pinInfo, totalPixels]);

    const hostStyle = {
        width: `${geometry.width}px`,
        height: `${geometry.height}px`,
        '--dot-size': `${config.dotSize}px`,
        '--dot-gap': `${config.dotGap}px`,
        '--dot-glow-blur': `${geometry.glowBlur}px`,
        '--dot-glow-spread': `${geometry.glowSpread}px`,
        '--dot-glow-inner': `${geometry.glowInnerBlur}px`,
        '--dot-glow-outer-spread': `${geometry.glowOuterSpread}px`,
    } as React.CSSProperties;

    return (
        <div
            className={`absolute ${isDragging ? 'z-50 opacity-80' : 'z-10'} ${isEditMode ? '' : 'pointer-events-auto'}`}
            style={{
                top: `${part.top}px`,
                left: `${part.left}px`,
                transform: part.rotate ? `rotate(${part.rotate}deg)` : undefined,
                transformOrigin: 'top left',
                filter: isDragging ? 'drop-shadow(0 4px 12px rgba(59,130,246,0.4))' : undefined,
            }}
        >
            <div
                id={part.id}
                ref={hostRef}
                className="avr8js-dot-matrix"
                style={hostStyle}
                title={`Dot Matrix RGB (${config.cols}×${config.rows})`}
            >
                <div className="avr8js-dot-matrix-grid">
                    {rowIndices.map((row) => (
                        <div key={row} className="avr8js-dot-matrix-row">
                            {colIndices.map((col) => {
                                const index = row * config.cols + col;
                                return (
                                    <div key={col} className="avr8js-dot-matrix-led">
                                        <div
                                            ref={(node) => {
                                                ledGlowRefs.current[index] = node;
                                            }}
                                            className="avr8js-dot-matrix-glow"
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>

                <div className="avr8js-dot-matrix-pin-bar">
                    {geometry.pinInfo.map((pin) => (
                        <span
                            key={pin.name}
                            className="avr8js-dot-matrix-pin-label"
                            style={{ left: `${pin.x - DOT_MATRIX_BORDER - 5}px` }}
                        >
                            {pin.name}
                        </span>
                    ))}
                </div>

                {geometry.pinInfo.map((pin) => (
                    <div
                        key={pin.name}
                        className="avr8js-dot-matrix-pin-pad"
                        style={{
                            left: `${pin.x - DOT_MATRIX_BORDER - 4}px`,
                            top: `${geometry.height - DOT_MATRIX_BORDER - 4}px`,
                        }}
                    />
                ))}
            </div>

            {isEditMode && isSelected && (
                <div
                    className={[
                        'absolute pointer-events-none z-25 -bottom-6 left-1/2 -translate-x-1/2',
                        'rounded bg-black/80 border border-blue-500/40 px-1.5 py-0.5',
                        'text-[10px] font-mono text-blue-200 whitespace-nowrap',
                    ].join(' ')}
                >
                    {config.cols}×{config.rows} · {config.dotSize}px
                </div>
            )}

            {isEditMode && (
                <div
                    className="absolute inset-0 z-20 pointer-events-auto rounded"
                    style={{
                        cursor: isDragging ? 'grabbing' : 'grab',
                        outline: isSelected
                            ? '2px solid rgba(59,130,246,0.85)'
                            : isDragging
                                ? '2px solid rgba(59,130,246,0.5)'
                                : 'none',
                        boxShadow: isSelected ? '0 0 0 3px rgba(59,130,246,0.2)' : 'none',
                    }}
                    onPointerDown={(e) => onPartPointerDown(e, part)}
                    onClick={(e) => {
                        e.stopPropagation();
                        onPartClick(part.id);
                    }}
                />
            )}
        </div>
    );
}
