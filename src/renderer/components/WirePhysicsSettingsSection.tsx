import React, { useEffect, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { resolveWireAppearance } from '../constants/wire-colors';
import {
    computeEndpointAngle,
    DEFAULT_WIRE_PHYSICS_SETTINGS,
    DEFAULT_WIRE_SEGMENTS,
    WirePhysicsEngine,
    type WirePhysicsSettings,
    type WirePoint,
} from '../services/wire-physics-engine';

interface WirePhysicsSettingsSectionProps {
    value: WirePhysicsSettings;
    wireColor: string;
    onChange: (next: WirePhysicsSettings) => void;
}

const PREVIEW_LEFT_ANCHOR = { x: 56, y: 42, ex: 0, ey: 1 };
const DEFAULT_RIGHT_ANCHOR = { x: 320, y: 58, ex: 0, ey: -1 };
const PREVIEW_WIRE_ID = 'settings-preview-wire';

interface SliderControlProps {
    label: string;
    valueLabel: string;
    min: number;
    max: number;
    step: number;
    value: number;
    onChange: (next: number) => void;
}

function SliderControl({
    label,
    valueLabel,
    min,
    max,
    step,
    value,
    onChange,
}: Readonly<SliderControlProps>) {
    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[12px]">
                <span className="text-vscode-text opacity-85">{label}</span>
                <span className="font-mono text-[11px] text-vscode-textActive bg-vscode-input border border-vscode-border px-2 py-0.5 rounded">
                    {valueLabel}
                </span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                className="w-full accent-blue-500 cursor-pointer"
            />
        </div>
    );
}

export default function WirePhysicsSettingsSection({
    value,
    wireColor,
    onChange,
}: Readonly<WirePhysicsSettingsSectionProps>) {
    const svgRef = useRef<SVGSVGElement | null>(null);
    const engineRef = useRef<WirePhysicsEngine | null>(null);
    const [rightAnchor, setRightAnchor] = useState<WirePoint>({
        x: DEFAULT_RIGHT_ANCHOR.x,
        y: DEFAULT_RIGHT_ANCHOR.y,
    });
    const [dragMode, setDragMode] = useState<'socket' | 'cable' | null>(null);

    engineRef.current ??= new WirePhysicsEngine(value, DEFAULT_WIRE_SEGMENTS);

    const [previewGeom, setPreviewGeom] = useState(() => {
        const engine = engineRef.current!;
        engine.syncWire(PREVIEW_WIRE_ID, PREVIEW_LEFT_ANCHOR, DEFAULT_RIGHT_ANCHOR);
        return engine.getWireGeometry(PREVIEW_WIRE_ID) ?? {
            path: `M ${PREVIEW_LEFT_ANCHOR.x} ${PREVIEW_LEFT_ANCHOR.y} L ${DEFAULT_RIGHT_ANCHOR.x} ${DEFAULT_RIGHT_ANCHOR.y}`,
            start: PREVIEW_LEFT_ANCHOR,
            end: DEFAULT_RIGHT_ANCHOR,
            startAngle: 90,
            endAngle: -90,
            sleeping: true,
        };
    });

    useEffect(() => {
        const engine = engineRef.current;
        if (!engine) return;
        engine.updateSettings(value);
        engine.syncWire(PREVIEW_WIRE_ID, PREVIEW_LEFT_ANCHOR, {
            x: rightAnchor.x,
            y: rightAnchor.y,
            ex: 0,
            ey: -1,
        });
        const nextGeom = engine.getWireGeometry(PREVIEW_WIRE_ID);
        if (nextGeom) {
            setPreviewGeom(nextGeom);
        }
    }, [rightAnchor.x, rightAnchor.y, value]);

    useEffect(() => {
        const engine = engineRef.current;
        if (!engine) return undefined;

        let rafId = 0;
        let lastTs = performance.now();

        const tick = (ts: number) => {
            const dtScale = Math.min(1.8, Math.max(0.4, (ts - lastTs) / 16.67));
            lastTs = ts;
            if (engine.hasAwakeWires()) {
                engine.step(dtScale);
                const next = engine.getWireGeometry(PREVIEW_WIRE_ID);
                if (next) {
                    setPreviewGeom(next);
                }
            }
            rafId = globalThis.requestAnimationFrame(tick);
        };

        rafId = globalThis.requestAnimationFrame(tick);
        return () => globalThis.cancelAnimationFrame(rafId);
    }, []);

    const getSvgPoint = (clientX: number, clientY: number): WirePoint | null => {
        const svg = svgRef.current;
        if (!svg) return null;
        const rect = svg.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return null;
        return {
            x: Math.max(24, Math.min(356, ((clientX - rect.left) / rect.width) * 380)),
            y: Math.max(24, Math.min(130, ((clientY - rect.top) / rect.height) * 144)),
        };
    };

    useEffect(() => {
        if (!dragMode) return undefined;

        const handlePointerMove = (event: PointerEvent) => {
            const pt = getSvgPoint(event.clientX, event.clientY);
            if (!pt || !engineRef.current) return;

            if (dragMode === 'socket') {
                setRightAnchor(pt);
            } else {
                engineRef.current.moveGrab(PREVIEW_WIRE_ID, pt);
            }
        };

        const handlePointerUp = () => {
            if (dragMode === 'cable') {
                engineRef.current?.releaseGrab(PREVIEW_WIRE_ID);
            }
            setDragMode(null);
        };

        globalThis.addEventListener('pointermove', handlePointerMove);
        globalThis.addEventListener('pointerup', handlePointerUp);
        globalThis.addEventListener('pointercancel', handlePointerUp);
        return () => {
            globalThis.removeEventListener('pointermove', handlePointerMove);
            globalThis.removeEventListener('pointerup', handlePointerUp);
            globalThis.removeEventListener('pointercancel', handlePointerUp);
        };
    }, [dragMode]);

    const appearance = resolveWireAppearance(wireColor);
    const specularOffset = -Math.max(0.6, value.thickness * 0.22);
    const startAngle = previewGeom.startAngle || computeEndpointAngle(PREVIEW_LEFT_ANCHOR, previewGeom.end);
    const endAngle = previewGeom.endAngle || computeEndpointAngle(previewGeom.end, PREVIEW_LEFT_ANCHOR);

    return (
        <div className="space-y-4">
            <div className="rounded-lg border border-vscode-border bg-vscode-surface/70 p-3 space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold uppercase tracking-wider text-vscode-text opacity-75">
                        Live preview
                    </span>
                    <span className="text-vscode-text opacity-55">
                        Drag the right socket or pluck the cable
                    </span>
                </div>

                <svg
                    ref={svgRef}
                    viewBox="0 0 380 144"
                    shapeRendering="geometricPrecision"
                    className="w-full h-36 rounded-md border border-vscode-border/70 bg-black/35 select-none"
                >
                    <defs>
                        <pattern id="wire-preview-grid" width="16" height="16" patternUnits="userSpaceOnUse">
                            <circle cx="1" cy="1" r="0.8" fill="rgba(255,255,255,0.08)" />
                        </pattern>
                    </defs>
                    <rect width="380" height="144" fill="url(#wire-preview-grid)" />

                    {/* Left socket (D13) */}
                    <g transform={`translate(${PREVIEW_LEFT_ANCHOR.x}, ${PREVIEW_LEFT_ANCHOR.y})`}>
                        <rect x="-24" y="-14" width="48" height="24" rx="4" fill="#27272a" stroke="#52525b" />
                        <text x="0" y="-18" textAnchor="middle" fill="#a1a1aa" fontSize="9" fontFamily="monospace">
                            D13
                        </text>
                        <circle cx="0" cy="0" r="4.5" fill="#18181b" stroke="#fbbf24" strokeWidth="1.4" />
                    </g>

                    {/* Right draggable socket (LED) */}
                    <g
                        transform={`translate(${rightAnchor.x}, ${rightAnchor.y})`}
                        className="cursor-grab active:cursor-grabbing"
                        onPointerDown={(e) => {
                            e.stopPropagation();
                            setDragMode('socket');
                        }}
                    >
                        <rect x="-24" y="-10" width="48" height="24" rx="4" fill="#27272a" stroke="#52525b" />
                        <text x="0" y="24" textAnchor="middle" fill="#a1a1aa" fontSize="9" fontFamily="monospace">
                            LED (drag)
                        </text>
                        <circle cx="0" cy="0" r="4.5" fill="#18181b" stroke="#38bdf8" strokeWidth="1.4" />
                    </g>

                    {/* Jumper cable preview */}
                    <g opacity={value.opacity}>
                        {value.realisticRendering ? (
                            <>
                                <path
                                    d={previewGeom.path}
                                    transform="translate(0, 5.2)"
                                    stroke="rgba(0,0,0,0.20)"
                                    strokeWidth={value.thickness + 2.6}
                                    fill="none"
                                    strokeLinecap="round"
                                />
                                <path
                                    d={previewGeom.path}
                                    transform="translate(0, 2.0)"
                                    stroke="rgba(0,0,0,0.30)"
                                    strokeWidth={value.thickness + 0.9}
                                    fill="none"
                                    strokeLinecap="round"
                                />
                                <path
                                    d={previewGeom.path}
                                    stroke={appearance.outline}
                                    strokeWidth={value.thickness + 1.8}
                                    fill="none"
                                    strokeLinecap="round"
                                />
                                <path
                                    d={previewGeom.path}
                                    stroke={appearance.jacket}
                                    strokeWidth={value.thickness}
                                    fill="none"
                                    strokeLinecap="round"
                                />
                                <path
                                    d={previewGeom.path}
                                    transform={`translate(0, ${specularOffset})`}
                                    stroke={appearance.highlight}
                                    strokeWidth={Math.max(0.95, value.thickness * 0.26)}
                                    fill="none"
                                    strokeLinecap="round"
                                />
                                {[
                                    { pt: previewGeom.start, angle: startAngle },
                                    { pt: previewGeom.end, angle: endAngle },
                                ].map((boot, idx) => (
                                    <g
                                        key={idx}
                                        transform={`translate(${boot.pt.x}, ${boot.pt.y}) rotate(${boot.angle})`}
                                    >
                                        <circle
                                            cx={0}
                                            cy={0}
                                            r={4.1}
                                            fill="#111827"
                                            stroke="rgba(255,255,255,0.28)"
                                            strokeWidth={0.85}
                                        />
                                        <circle cx={0} cy={0} r={1.6} fill="#d4d4d8" />
                                        <rect
                                            x={-1}
                                            y={-3.1}
                                            width={9.8}
                                            height={6.2}
                                            rx={1.6}
                                            fill="#18181b"
                                            stroke="#09090b"
                                            strokeWidth={0.9}
                                        />
                                        <line
                                            x1={0.5}
                                            y1={-2.1}
                                            x2={5.5}
                                            y2={-2.1}
                                            stroke="rgba(255,255,255,0.22)"
                                            strokeWidth={0.8}
                                            strokeLinecap="round"
                                        />
                                        <rect x={5.8} y={-2.4} width={2.8} height={4.8} rx={0.8} fill={appearance.collar} />
                                    </g>
                                ))}
                            </>
                        ) : (
                            <>
                                <path
                                    d={previewGeom.path}
                                    stroke="rgba(0,0,0,0.3)"
                                    strokeWidth={value.thickness + 1.8}
                                    fill="none"
                                    strokeLinecap="round"
                                />
                                <path
                                    d={previewGeom.path}
                                    stroke={appearance.jacket}
                                    strokeWidth={value.thickness}
                                    fill="none"
                                    strokeLinecap="round"
                                />
                                <circle cx={previewGeom.start.x} cy={previewGeom.start.y} r={3.5} fill={appearance.jacket} />
                                <circle cx={previewGeom.end.x} cy={previewGeom.end.y} r={3.5} fill={appearance.jacket} />
                            </>
                        )}

                        {/* Hitbox to pluck/pull cable directly */}
                        <path
                            d={previewGeom.path}
                            stroke="transparent"
                            strokeWidth={14}
                            fill="none"
                            strokeLinecap="round"
                            className="cursor-grab active:cursor-grabbing"
                            onPointerDown={(e) => {
                                e.stopPropagation();
                                const pt = getSvgPoint(e.clientX, e.clientY);
                                if (!pt) return;
                                engineRef.current?.grabMidSpan(PREVIEW_WIRE_ID, pt);
                                setDragMode('cable');
                            }}
                        />
                    </g>
                </svg>
            </div>

            <div className="grid grid-cols-2 gap-x-5 gap-y-3">
                <SliderControl
                    label="Gravity"
                    valueLabel={value.gravity.toFixed(2)}
                    min={0}
                    max={1.5}
                    step={0.05}
                    value={value.gravity}
                    onChange={(gravity) => onChange({ ...value, gravity })}
                />
                <SliderControl
                    label="Cable slack"
                    valueLabel={`${Math.round(value.slack * 100)}%`}
                    min={1.0}
                    max={1.75}
                    step={0.05}
                    value={value.slack}
                    onChange={(slack) => onChange({ ...value, slack })}
                />
                <SliderControl
                    label="Wire thickness"
                    valueLabel={`${value.thickness.toFixed(1)} px`}
                    min={2.0}
                    max={6.5}
                    step={0.2}
                    value={value.thickness}
                    onChange={(thickness) => onChange({ ...value, thickness })}
                />
                <SliderControl
                    label="Wire opacity"
                    valueLabel={`${Math.round(value.opacity * 100)}%`}
                    min={0.25}
                    max={1.0}
                    step={0.05}
                    value={value.opacity}
                    onChange={(opacity) => onChange({ ...value, opacity })}
                />
            </div>

            <div className="flex items-center justify-between pt-1">
                <button
                    type="button"
                    onClick={() => onChange({ ...value, realisticRendering: !value.realisticRendering })}
                    className="flex items-center gap-3 group"
                >
                    <div
                        className={[
                            'relative w-10 h-5 rounded-full transition-colors duration-200',
                            value.realisticRendering ? 'bg-blue-600' : 'bg-vscode-input',
                        ].join(' ')}
                    >
                        <div
                            className={[
                                'absolute top-0.5 left-0.5 w-4 h-4 rounded-full',
                                'bg-white shadow transition-transform duration-200',
                                value.realisticRendering ? 'translate-x-5' : 'translate-x-0',
                            ].join(' ')}
                        />
                    </div>
                    <span className="text-[13px] text-vscode-text group-hover:text-vscode-textActive transition-colors">
                        Realistic wire rendering
                    </span>
                </button>

                <button
                    type="button"
                    onClick={() => onChange({ ...DEFAULT_WIRE_PHYSICS_SETTINGS })}
                    className={[
                        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px]',
                        'border border-vscode-border bg-vscode-input/60 text-vscode-text',
                        'hover:bg-vscode-hover hover:text-vscode-textActive transition-colors',
                    ].join(' ')}
                >
                    <RotateCcw size={12} />
                    Restore defaults
                </button>
            </div>
        </div>
    );
}
