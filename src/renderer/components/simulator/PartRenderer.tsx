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
    part, isEditMode, isDragging, isSelected,
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