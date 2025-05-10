/**
 * PartRenderer
 * Renders a single Wokwi custom element with optional drag overlay in edit mode.
 * Interactive components (buttons, switches, potentiometers) receive pointer events
 * during simulation (run mode) and stop propagation to prevent canvas panning.
 *
 * In edit mode a selected part shows:
 *   - Blue selection border
 *   - A ↻ rotate button (also triggered by pressing R)
 *
 * Special type `wokwi-label` renders as an editable text annotation (no custom element).
 * Double-click the label text in edit mode to change it inline.
 */
import React, { useState, useRef, useEffect } from 'react';
import type { WokwiPart } from '../../types/wokwi.types';
import type { PinInfo } from '../../types/wokwi.types';

/** Component types that need to receive pointer events during simulation */
const INTERACTIVE_TYPES = new Set([
    'wokwi-pushbutton',
    'wokwi-pushbutton-6mm',
    'wokwi-slide-switch',
    'wokwi-tilt-switch',
    'wokwi-dip-switch-8',
    'wokwi-potentiometer',
    'wokwi-slide-potentiometer',
    'wokwi-analog-joystick',
    'wokwi-membrane-keypad',
    'wokwi-ky-040',
    'wokwi-rotary-dialer',
    'wokwi-ir-remote',
]);

interface PartRendererProps {
    part: WokwiPart;
    customChipManifest?: {
        title: string;
        pins: string[];
        framebuffer?: {
            width: number;
            height: number;
        };
    };
    isEditMode: boolean;
    isDragging: boolean;
    /** Whether this part is currently selected (shows border + rotate badge) */
    isSelected: boolean;
    onPartPointerDown: (e: React.PointerEvent, part: WokwiPart) => void;
    /** Called when the part body is clicked — used to set selectedPartId */
    onPartClick: (partId: string) => void;
    /** Called when the rotate button is clicked — new rotation in degrees */
    onRotate: (partId: string, degrees: number) => void;
    /** Called when the text of a wokwi-label annotation is changed */
    onLabelTextChange?: (partId: string, newText: string) => void;
}

export default function PartRenderer({
    part, customChipManifest, isEditMode, isDragging, isSelected,
    onPartPointerDown, onPartClick, onRotate, onLabelTextChange,
}: PartRendererProps) {
    if (part.hide) return null;

    // ── wokwi-label: rendered as an editable text annotation ──
    if (part.type === 'wokwi-label') {
        return (
            <LabelAnnotation
                part={part}
                isEditMode={isEditMode}
                isDragging={isDragging}
                isSelected={isSelected}
                onPartPointerDown={onPartPointerDown}
                onPartClick={onPartClick}
                onLabelTextChange={onLabelTextChange}
            />
        );
    }

    if (part.type.startsWith('chip-')) {
        return (
            <CustomChipPart
                part={part}
                manifest={customChipManifest}
                isEditMode={isEditMode}
                isDragging={isDragging}
                isSelected={isSelected}
                onPartPointerDown={onPartPointerDown}
                onPartClick={onPartClick}
                onRotate={onRotate}
            />
        );
    }

    const TagName = part.type as string;
    const isInteractive = INTERACTIVE_TYPES.has(part.type);

    // In run mode, interactive components get pointer-events-auto and stop propagation
    // to prevent accidental canvas panning when clicking buttons/turning knobs.
    const handleInteractivePointerDown = (e: React.PointerEvent) => {
        if (!isEditMode && isInteractive) {
            e.stopPropagation();
        }
    };

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
            onPointerDown={handleInteractivePointerDown}
        >
            {/* @ts-expect-error Wokwi custom elements are not standard HTML elements */}
            <TagName id={part.id} {...(part.attrs ?? {})} />
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
            {/* Rotate button — shown over selected parts in edit mode */}
            {isEditMode && isSelected && (
                <button
                    className={[
                        'absolute pointer-events-auto z-30',
                        '-top-8 left-1/2 -translate-x-1/2',
                        'bg-blue-600 hover:bg-blue-500 active:bg-blue-700',
                        'text-white rounded-full w-7 h-7',
                        'flex items-center justify-center',
                        'shadow-lg shadow-black/40',
                        'transition-colors',
                    ].join(' ')}
                    title="Rotate 90° (R)"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                        e.stopPropagation();
                        onRotate(part.id, ((part.rotate || 0) + 90) % 360);
                    }}
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14" height="14"
                        viewBox="0 0 24 24"
                        fill="none" stroke="currentColor"
                        strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    >
                        <path d="M21 2v6h-6" />
                        <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                        <path d="M3 22v-6h6" />
                        <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                    </svg>
                </button>
            )}
        </div>
    );
}

interface CustomChipPartProps {
    part: WokwiPart;
    manifest?: {
        title: string;
        pins: string[];
        framebuffer?: {
            width: number;
            height: number;
        };
    };
    isEditMode: boolean;
    isDragging: boolean;
    isSelected: boolean;
    onPartPointerDown: (e: React.PointerEvent, part: WokwiPart) => void;
    onPartClick: (partId: string) => void;
    onRotate: (partId: string, degrees: number) => void;
}

function CustomChipPart({
    part,
    manifest,
    isEditMode,
    isDragging,
    isSelected,
    onPartPointerDown,
    onPartClick,
    onRotate,
}: CustomChipPartProps) {
    const elementRef = useRef<HTMLDivElement>(null);
    const screenCanvasRef = useRef<HTMLCanvasElement>(null);
    const pins = manifest?.pins && manifest.pins.length > 0 ? manifest.pins : ['P1', 'P2'];
    const framebuffer = manifest?.framebuffer;
    const rawScale = Number.parseFloat(part.attrs?.framebufferScale ?? part.attrs?.screenScale ?? '2');
    const framebufferScale = Number.isFinite(rawScale) ? Math.max(1, Math.min(8, rawScale)) : 2;
    const screenWidth = framebuffer ? Math.max(32, Math.floor(framebuffer.width * framebufferScale)) : 0;
    const screenHeight = framebuffer ? Math.max(24, Math.floor(framebuffer.height * framebufferScale)) : 0;
    const half = Math.ceil(pins.length / 2);
    const leftPins = pins.slice(0, half);
    const rightPins = pins.slice(half);
    const rows = Math.max(leftPins.length, rightPins.length, 2);
    const boardWidth = Math.max(130, screenWidth > 0 ? screenWidth + 16 : 130);
    const boardHeight = Math.max(
        68,
        Math.max(rows * 22 + 16, screenHeight > 0 ? screenHeight + 40 : 0),
    );
    const chipTitle = manifest?.title || part.type.slice('chip-'.length);

    const pinInfo: PinInfo[] = [];
    const leftGap = boardHeight / (leftPins.length + 1);
    leftPins.forEach((name, index) => {
        pinInfo.push({ name, x: 0, y: Math.round(leftGap * (index + 1)) });
    });
    const rightGap = boardHeight / (rightPins.length + 1);
    rightPins.forEach((name, index) => {
        pinInfo.push({ name, x: boardWidth, y: Math.round(rightGap * (index + 1)) });
    });

    useEffect(() => {
        if (!elementRef.current) return;
        const host = elementRef.current as HTMLDivElement & {
            pinInfo?: PinInfo[];
            __avr8jsFramebufferUpdate?: (next: { width: number; height: number; pixels: Uint8Array }) => void;
        };
        host.pinInfo = pinInfo;
        host.__avr8jsFramebufferUpdate = (next) => {
            const canvas = screenCanvasRef.current;
            if (!canvas) return;
            const width = Math.max(1, next.width);
            const height = Math.max(1, next.height);

            if (canvas.width !== width || canvas.height !== height) {
                canvas.width = width;
                canvas.height = height;
            }

            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            const imageData = new ImageData(new Uint8ClampedArray(next.pixels), width, height);
            ctx.putImageData(imageData, 0, 0);
        };

        return () => {
            delete host.__avr8jsFramebufferUpdate;
        };
    }, [part.id, pins.join('|'), boardWidth, boardHeight]);

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
                ref={elementRef}
                className="relative rounded-md border border-green-300/70"
                style={{
                    width: boardWidth,
                    height: boardHeight,
                    background: 'linear-gradient(180deg, #2f7f56 0%, #1f5a3d 100%)',
                    boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)',
                }}
                title={chipTitle}
            >
                <div className="absolute top-1.5 left-2 right-2 text-[10px] font-semibold text-green-100 opacity-90 truncate">
                    {chipTitle}
                </div>

                {framebuffer && (
                    <div
                        className="absolute rounded-sm overflow-hidden"
                        style={{
                            left: 8,
                            right: 8,
                            top: 34,
                            height: screenHeight,
                            background: '#000',
                            border: '1px solid rgba(255,255,255,0.08)',
                            boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.4)',
                        }}
                    >
                        <canvas
                            ref={screenCanvasRef}
                            width={framebuffer.width}
                            height={framebuffer.height}
                            style={{
                                width: '100%',
                                height: '100%',
                                display: 'block',
                                imageRendering: 'pixelated',
                                background: '#000',
                            }}
                        />
                    </div>
                )}

                {leftPins.map((name, index) => (
                    <div
                        key={`l-${name}-${index}`}
                        className="absolute"
                        style={{
                            left: -4,
                            top: leftGap * (index + 1) - 4,
                        }}
                    >
                        <div className="w-2 h-2 rounded-full bg-[#d9d9d9] border border-[#4f4f4f]" />
                        <span
                            className="absolute left-3 -top-1 text-[9px] leading-none text-green-50/90 font-mono"
                            title={name}
                        >
                            {name}
                        </span>
                    </div>
                ))}

                {rightPins.map((name, index) => (
                    <div
                        key={`r-${name}-${index}`}
                        className="absolute"
                        style={{
                            right: -4,
                            top: rightGap * (index + 1) - 4,
                        }}
                    >
                        <div className="w-2 h-2 rounded-full bg-[#d9d9d9] border border-[#4f4f4f]" />
                        <span
                            className="absolute right-3 -top-1 text-[9px] leading-none text-green-50/90 font-mono"
                            title={name}
                        >
                            {name}
                        </span>
                    </div>
                ))}
            </div>

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

            {isEditMode && isSelected && (
                <button
                    className={[
                        'absolute pointer-events-auto z-30',
                        '-top-8 left-1/2 -translate-x-1/2',
                        'bg-blue-600 hover:bg-blue-500 active:bg-blue-700',
                        'text-white rounded-full w-7 h-7',
                        'flex items-center justify-center',
                        'shadow-lg shadow-black/40',
                        'transition-colors',
                    ].join(' ')}
                    title="Rotate 90° (R)"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                        e.stopPropagation();
                        onRotate(part.id, ((part.rotate || 0) + 90) % 360);
                    }}
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14" height="14"
                        viewBox="0 0 24 24"
                        fill="none" stroke="currentColor"
                        strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    >
                        <path d="M21 2v6h-6" />
                        <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                        <path d="M3 22v-6h6" />
                        <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                    </svg>
                </button>
            )}
        </div>
    );
}
// ─────────────────────────────────────────────────────────────────────────────
// LabelAnnotation — text overlay used for canvas annotations (wokwi-label)
// ─────────────────────────────────────────────────────────────────────────────

interface LabelAnnotationProps {
    part: WokwiPart;
    isEditMode: boolean;
    isDragging: boolean;
    isSelected: boolean;
    onPartPointerDown: (e: React.PointerEvent, part: WokwiPart) => void;
    onPartClick: (partId: string) => void;
    onLabelTextChange?: (partId: string, newText: string) => void;
}

function LabelAnnotation({
    part, isEditMode, isDragging, isSelected,
    onPartPointerDown, onPartClick, onLabelTextChange,
}: LabelAnnotationProps) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    const text = part.attrs?.text ?? 'Label';
    const color = part.attrs?.color ?? '#ffffff';
    const fontSize = Number(part.attrs?.['font-size'] ?? 14);
    const bgColor = part.attrs?.['bg-color'] ?? 'transparent';

    const startEdit = () => {
        if (!isEditMode || !onLabelTextChange) return;
        setDraft(text);
        setEditing(true);
    };

    useEffect(() => {
        if (editing) inputRef.current?.focus();
    }, [editing]);

    const commitEdit = () => {
        if (onLabelTextChange) {
            const trimmed = draft.trim();
            if (trimmed) onLabelTextChange(part.id, trimmed);
        }
        setEditing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
        if (e.key === 'Escape') { setEditing(false); }
        e.stopPropagation();
    };

    return (
        <div
            className={`absolute select-none ${isDragging ? 'z-50 opacity-80' : 'z-10'}`}
            style={{
                top: `${part.top}px`,
                left: `${part.left}px`,
                transform: part.rotate ? `rotate(${part.rotate}deg)` : undefined,
            }}
        >
            {editing ? (
                <input
                    ref={inputRef}
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={handleKeyDown}
                    className="bg-black/70 border border-blue-400 rounded px-1 outline-none text-white"
                    style={{ fontSize, color, minWidth: 60 }}
                />
            ) : (
                <span
                    className={[
                        'px-1 py-0.5 rounded cursor-default whitespace-pre',
                        isEditMode ? 'pointer-events-auto' : 'pointer-events-none',
                        isSelected ? 'outline outline-1 outline-blue-400' : '',
                    ].join(' ')}
                    style={{ fontSize, color, background: bgColor }}
                    onPointerDown={isEditMode ? (e) => onPartPointerDown(e, part) : undefined}
                    onClick={isEditMode ? (e) => { e.stopPropagation(); onPartClick(part.id); } : undefined}
                    onDoubleClick={(e) => { e.stopPropagation(); startEdit(); }}
                >
                    {text}
                </span>
            )}
        </div>
    );
}