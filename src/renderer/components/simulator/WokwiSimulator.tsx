/**
 * WokwiSimulator
 * Main simulator container that composes all sub-components and hooks.
 * This is the single entry point for the Wokwi visual simulator.
 */
import React, { useState, useRef, useEffect, useMemo } from 'react';
import type { WokwiSimulatorProps, WokwiDiagram } from '../../types/wokwi.types';

// Hooks
import { useCanvasInteraction } from '../../hooks/useCanvasInteraction';
import { usePinPositions } from '../../hooks/usePinPositions';
import { useWireRenderer } from '../../hooks/useWireRenderer';
import { useSimulation } from '../../hooks/useSimulation';

// Sub-components
import SimulatorToolbar from './SimulatorToolbar';
import CanvasZoomControls from './CanvasZoomControls';
import AddComponentMenu from './AddComponentMenu';
import AVRInspector from './AVRInspector';
import Oscilloscope from './Oscilloscope';


import PinOverlay from './PinOverlay';
import PartRenderer from './PartRenderer';
import PinTooltip from './PinTooltip';
import WireColorPopup from './WireColorPopup';
import ComponentPropertyEditor, { PROPERTY_CATALOG } from './ComponentPropertyEditor';
import type { ComponentProperties } from './ComponentPropertyEditor';
import { startPerfMeasure } from '../../utils/perf';
import { boardProfiles } from '../../../shared/avr/profiles';
import {
    getConnectionRouteHints,
    getPreferredWiringLegendTones,
    getWiringCandidateDescriptor,
    getWiringCandidateToneAppearance,
    getWiringLegendDescription,
    getWiringLegendHeading,
    listDiagramRouteHints,
    type WiringCandidateTone,
} from '../../utils/pin-capabilities';

type WiringLegendTone = Exclude<WiringCandidateTone, 'neutral'>;
type WiringLegendVisualMode = 'subtle' | 'blocked';

const WIRING_LEGEND_VALID_TONE_ORDER: Exclude<WiringLegendTone, 'invalid'>[] = ['pwm', 'adc', 'i2c', 'spi', 'uart', 'generic'];
const EMPTY_STATE_BOARDS = boardProfiles.map((profile) => ({
    label: profile.name,
    type: profile.wokwiType,
}));
const SHADOW_LAYOUT_STYLE_ID = 'avr8js-shadow-layout-tweaks';
const SHADOW_LAYOUT_STYLE = `
footer,
[part~="footer"],
[part~="status"],
.footer,
.status,
.status-bar,
.statusbar,
[class*="footer"],
[class*="status-bar"],
[class*="statusBar"],
[class*="statusbar"] {
    box-sizing: border-box;
    width: 100%;
    padding: 8px 12px !important;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 10px;
}

footer > *,
[part~="footer"] > *,
[part~="status"] > *,
.footer > *,
.status > *,
.status-bar > *,
.statusbar > *,
[class*="footer"] > *,
[class*="status-bar"] > *,
[class*="statusBar"] > *,
[class*="statusbar"] > * {
    margin-left: 0 !important;
    max-width: 100%;
}
`;

function applyEmbeddedLayoutTweaks(container: HTMLElement | null): void {
    if (!container) {
        return;
    }

    const elements = Array.from(container.querySelectorAll<HTMLElement>('*'));
    for (const element of elements) {
        const shadowRoot = element.shadowRoot;
        if (!shadowRoot || shadowRoot.getElementById(SHADOW_LAYOUT_STYLE_ID)) {
            continue;
        }

        const style = document.createElement('style');
        style.id = SHADOW_LAYOUT_STYLE_ID;
        style.textContent = SHADOW_LAYOUT_STYLE;
        shadowRoot.append(style);
    }
}

export default function WokwiSimulator({
    diagram, hex, customChipArtifacts, customChipManifests, isCompiling, onCompile,
    onSerialOutput, onChipOutput, onAddComponent, onDiagramChange, serialWriteRef,
    onUndo, onRedo, canUndo, canRedo,
    defaultWireColor = 'green',
    showPinTooltips = true,
}: Readonly<WokwiSimulatorProps>) {
    const mountMeasureRef = useRef<null | (() => number)>(null);
    if (!mountMeasureRef.current) {
        const partCount = diagram?.parts.length ?? 0;
        const connectionCount = diagram?.connections.length ?? 0;
        mountMeasureRef.current = startPerfMeasure(
            'simulator-component-mount',
            `parts=${partCount},conns=${connectionCount}`,
        );
    }

    // ── Local UI State ──
    const [isEditMode, setIsEditMode] = useState(true);
    const wireColor = defaultWireColor;
    const [hoveredPin, setHoveredPin] = useState<string | null>(null);
    const [wiringStart, setWiringStart] = useState<string | null>(null);
    const [popupState, setPopupState] = useState<{ id: string, color: string, x: number, y: number } | null>(null);
    /** ID of the currently selected wire — used for keyboard delete and visual highlight */
    const [selectedWireId, setSelectedWireId] = useState<string | null>(null);
    /** ID of the currently selected part — shows border + rotate button */
    const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
    /** Show/hide AVR Inspector panel */
    const [showInspector, setShowInspector] = useState(false);
    /** Show/hide Oscilloscope panel */
    const [showOscilloscope, setShowOscilloscope] = useState(false);
    /** Show/hide persistent wiring diagnostics panel */
    const [showWiringDiagnostics, setShowWiringDiagnostics] = useState(true);


    const wiringStartRef = useRef<string | null>(null);
    const diagramRef = useRef<WokwiDiagram | undefined>(diagram);

    useEffect(() => {
        diagramRef.current = diagram;
    }, [diagram]);

    useEffect(() => {
        mountMeasureRef.current?.();
        mountMeasureRef.current = null;
    }, []);

    // ── Hooks ──
    const canvas = useCanvasInteraction(diagramRef, onDiagramChange);
    const pinPositions = usePinPositions(diagram);
    const sim = useSimulation({
        diagram,
        hex,
        customChipArtifacts,
        customChipManifests,
        onSerialOutput,
        onChipOutput,
        setIsEditMode,
    });

    useEffect(() => {
        const frameId = globalThis.requestAnimationFrame(() => {
            applyEmbeddedLayoutTweaks(canvas.containerRef.current);
        });

        return () => globalThis.cancelAnimationFrame(frameId);
    }, [canvas.containerRef, diagram, isEditMode]);

    let canvasCursor = 'default';
    if (canvas.isPanning) {
        canvasCursor = 'grabbing';
    } else if (wiringStart) {
        canvasCursor = 'crosshair';
    }


    // Expose serialWrite to parent via ref
    useEffect(() => {
        if (serialWriteRef) serialWriteRef.current = sim.serialWrite;
        return () => { if (serialWriteRef) serialWriteRef.current = null; };
    }, [sim.serialWrite, serialWriteRef]);

    // Build property editor data from adjustable devices
    const editableComponents = useMemo<ComponentProperties[]>(() => {
        return sim.adjustableDevices
            .filter((d) => {
                const hasCustomProps = Boolean(d.properties?.length);
                const hasCatalogProps = Boolean(PROPERTY_CATALOG[d.partType]?.props?.length);
                return hasCustomProps || hasCatalogProps;
            })
            .map(d => {
                const cat = PROPERTY_CATALOG[d.partType];
                const properties = d.properties ?? cat?.props ?? [];
                return {
                    partId: d.partId,
                    partType: d.partType,
                    label: d.label ?? cat?.label ?? d.partType,
                    properties,
                    get: d.get,
                    set: d.set,
                };
            })
            .filter((c) => c.properties.length > 0);
    }, [sim.adjustableDevices]);

    const selectedWireHints = useMemo(() => {
        if (!selectedWireId) {
            return [];
        }

        return diagram?.connections.find((connection) => connection.id === selectedWireId)?.routeHints ?? [];
    }, [diagram?.connections, selectedWireId]);

    const wiringDiagnostics = useMemo(() => listDiagramRouteHints(diagram), [diagram]);
    const wiringCandidateDescriptors = useMemo(() => {
        if (!diagram || !wiringStart) {
            return {};
        }

        return Object.fromEntries(
            Object.keys(pinPositions).map((pinId) => [pinId, getWiringCandidateDescriptor(diagram, wiringStart, pinId)]),
        );
    }, [diagram, pinPositions, wiringStart]);
    const wiringLegendState = useMemo(() => {
        if (!wiringStart) {
            return {
                description: 'Showing compatible board targets',
                heading: 'Wiring key',
                validTones: [] as Exclude<WiringLegendTone, 'invalid'>[],
                hasInvalid: false,
                visualMode: 'subtle' as WiringLegendVisualMode,
            };
        }

        const preferredTones = getPreferredWiringLegendTones(diagram, wiringStart);

        const presentTones = new Set(
            Object.values(wiringCandidateDescriptors)
                .map((descriptor) => descriptor.tone)
                .filter((tone) => tone !== 'neutral'),
        );

        const presentValidTones = WIRING_LEGEND_VALID_TONE_ORDER.filter((tone) => presentTones.has(tone));
        const focusedValidTones = preferredTones.filter((tone) => presentTones.has(tone));
        const validTones = focusedValidTones.length > 0 ? focusedValidTones : presentValidTones;
        const hasInvalid = presentTones.has('invalid');

        return {
            description: getWiringLegendDescription(diagram, wiringStart, {
                hasValidTargets: validTones.length > 0,
                hasInvalidTargets: hasInvalid,
            }),
            heading: getWiringLegendHeading(diagram, wiringStart),
            validTones,
            hasInvalid,
            visualMode: validTones.length === 0 && hasInvalid ? 'blocked' : 'subtle',
        };
    }, [diagram, wiringCandidateDescriptors, wiringStart]);
    const hasParts = (diagram?.parts.length ?? 0) > 0;

    const handleAddEmptyStateBoard = (boardType: string) => {
        if (!onAddComponent) {
            return;
        }

        const shortName = boardType.replace('wokwi-', '').split('-').join('');
        const existingCount = (diagram?.parts ?? []).filter((part) => part.type === boardType).length;

        onAddComponent({
            type: boardType,
            id: `${shortName}${existingCount + 1}`,
            top: Math.round((-canvas.pan.y) / canvas.zoom + 150 + Math.random() * 50),
            left: Math.round((-canvas.pan.x) / canvas.zoom + 150 + Math.random() * 50),
            rotate: 0,
            attrs: {},
        });
    };

    const handleWireClick = (e: React.MouseEvent, connId: string) => {
        e.stopPropagation();
        const conn = diagram?.connections.find(c => c.id === connId);
        if (conn && canvas.containerRef.current) {
            // Select the wire for keyboard operations
            setSelectedWireId(connId);
            // Compute popup position constrained within the canvas container
            const rect = canvas.containerRef.current.getBoundingClientRect();
            const rawX = e.clientX - rect.left;
            const rawY = e.clientY - rect.top;
            // Keep popup (approx 140 × 95 px) inside the canvas bounds
            const POPUP_W = 148;
            const POPUP_H = 105;
            const clampedX = Math.min(Math.max(rawX, POPUP_W / 2), rect.width - POPUP_W / 2);
            const clampedY = Math.min(Math.max(rawY, POPUP_H + 12), rect.height - 8);
            setPopupState({
                id: connId,
                color: conn.color,
                x: clampedX,
                y: clampedY,
            });
        }
    };

    // ── Keyboard handler: Delete removes selected wire, R rotates selected part ──
    useEffect(() => {
        if (!isEditMode) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            // Don't steal keystrokes when the user is typing
            const tag = (document.activeElement as HTMLElement)?.tagName?.toLowerCase();
            const isTyping = tag === 'input' || tag === 'textarea'
                || (document.activeElement as HTMLElement)?.isContentEditable;
            if (isTyping) return;

            if ((e.key === 'Delete' || e.key === 'Backspace') && selectedWireId) {
                if (diagramRef.current && onDiagramChange) {
                    const newConnections = diagramRef.current.connections.filter(c => c.id !== selectedWireId);
                    onDiagramChange({ ...diagramRef.current, connections: newConnections });
                }
                setSelectedWireId(null);
                setPopupState(null);
            }

            // R — rotate selected part by 90°
            if ((e.key === 'r' || e.key === 'R') && selectedPartId) {
                if (diagramRef.current && onDiagramChange) {
                    const newParts = diagramRef.current.parts.map(p =>
                        p.id === selectedPartId
                            ? { ...p, rotate: ((p.rotate || 0) + 90) % 360 }
                            : p
                    );
                    onDiagramChange({ ...diagramRef.current, parts: newParts });
                }
            }

            if (e.key === 'Escape') {
                setSelectedWireId(null);
                setSelectedPartId(null);
                setPopupState(null);
            }
        };
        globalThis.addEventListener('keydown', handleKeyDown);
        return () => globalThis.removeEventListener('keydown', handleKeyDown);
    }, [isEditMode, selectedWireId, selectedPartId, onDiagramChange, diagramRef]);

    // ── Part selection + rotate ──
    /** Select a part; deselects any wire selection */
    const handlePartClick = (partId: string) => {
        if (wiringStart) return; // ignore while drawing a wire
        setSelectedPartId(partId);
        setSelectedWireId(null);
        setPopupState(null);
    };

    /** Rotate a part by the given absolute degrees */
    const handleRotatePart = (partId: string, degrees: number) => {
        if (!diagramRef.current || !onDiagramChange) return;
        const newParts = diagramRef.current.parts.map(p =>
            p.id === partId ? { ...p, rotate: degrees } : p
        );
        onDiagramChange({ ...diagramRef.current, parts: newParts });
    };

    /** Update the text attribute of a wokwi-label annotation */
    const handleLabelTextChange = (partId: string, newText: string) => {
        if (!diagramRef.current || !onDiagramChange) return;
        const newParts = diagramRef.current.parts.map(p =>
            p.id === partId
                ? { ...p, attrs: p.attrs ? { ...p.attrs, text: newText } : { text: newText } }
                : p
        );
        onDiagramChange({ ...diagramRef.current, parts: newParts });
    };

    const wires = useWireRenderer({
        diagram, pinPositions, wiringStart,
        mousePos: canvas.mousePos, pan: canvas.pan, zoom: canvas.zoom,
        isEditMode, wireColor: 'green', selectedWireId, diagramRef, onDiagramChange,
        onWireClick: handleWireClick,
    });

    // ── Wiring Handlers ──
    const handleWiringStart = (pinId: string) => {
        wiringStartRef.current = pinId;
        setWiringStart(pinId);
    };

    const handleWiringEnd = (pinId: string) => {
        const startPin = wiringStartRef.current;
        if (startPin && startPin !== pinId && diagramRef.current && onDiagramChange) {
            const nextId = `conn-${diagramRef.current.connections.length}-${Date.now()}`;
            const routeHints = getConnectionRouteHints(diagramRef.current, startPin, pinId);
            onDiagramChange({
                ...diagramRef.current,
                connections: [
                    ...diagramRef.current.connections,
                    {
                        id: nextId,
                        from: startPin,
                        to: pinId,
                        color: wireColor,
                        ...(routeHints.length > 0 ? { routeHints } : {}),
                    }
                ],
            });
            setSelectedWireId(nextId);
            setSelectedPartId(null);
            setPopupState(null);
        }
        wiringStartRef.current = null;
        setWiringStart(null);
    };

    const handlePointerUp = () => {
        canvas.handlePointerUp();
        if (wiringStart) {
            setWiringStart(null);
            wiringStartRef.current = null;
        }
    };

    /** Clicking on the empty canvas background deselects wires and parts */
    const handleCanvasPointerDown = (e: React.PointerEvent) => {
        canvas.handlePointerDown(e);
        // Only deselect on direct background clicks (not bubbled from wires/parts/popup)
        if (e.target === e.currentTarget || (e.target as HTMLElement).closest?.('svg') === null) {
            if (selectedWireId || selectedPartId) {
                setSelectedWireId(null);
                setSelectedPartId(null);
                setPopupState(null);
            }
        }
    };

    return (
        <div className="flex flex-col h-full bg-vscode-surface w-full relative">
            {/* ── Toolbar ── */}
            <SimulatorToolbar
                isEditMode={isEditMode}
                onToggleEditMode={() => setIsEditMode(!isEditMode)}
                isPlaying={sim.isPlaying}
                isCompiling={isCompiling}
                hex={hex}
                onCompile={onCompile}
                onPlay={sim.handlePlay}
                onStop={sim.handleStop}
                simTime={sim.simTime}
                simSpeed={sim.simSpeed}
                speedMultiplier={sim.speedMultiplier}
                onSpeedChange={sim.setSpeedMultiplier}
                renderAddMenu={
                    <AddComponentMenu
                        diagram={diagram}
                        customChipManifests={customChipManifests}
                        pan={canvas.pan}
                        zoom={canvas.zoom}
                        onAddComponent={onAddComponent}
                    />
                }
                onUndo={onUndo}
                onRedo={onRedo}
                canUndo={canUndo}
                canRedo={canRedo}
                showInspector={showInspector}
                onToggleInspector={() => setShowInspector(v => !v)}
                showOscilloscope={showOscilloscope}
                onToggleOscilloscope={() => setShowOscilloscope(v => !v)}
            />

            {/* ── Main area split row ── */}
            <div className="flex flex-1 overflow-hidden">
                {/* Canvas column (takes remaining space) */}
                <div className="flex flex-col flex-1 overflow-hidden">
                    {/* ── Canvas Zoom Controls ── */}
                    <CanvasZoomControls
                        zoom={canvas.zoom}
                        onZoomIn={() => canvas.setZoom(z => Math.min(5, z + 0.1))}
                        onZoomOut={() => canvas.setZoom(z => Math.max(0.1, z - 0.1))}
                        onReset={() => { canvas.setZoom(1); canvas.setPan({ x: 0, y: 0 }); }}
                    />

                    {/* ── Component Property Editor ── */}
                    <ComponentPropertyEditor
                        components={editableComponents}
                        isPlaying={sim.isPlaying}
                    />

                    {wiringDiagnostics.length > 0 && (
                        <div className="mx-3 mt-2 rounded border border-amber-500/30 bg-amber-500/10 text-[11px] text-amber-100 overflow-hidden">
                            <button
                                type="button"
                                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-amber-500/10"
                                onClick={() => setShowWiringDiagnostics((current) => !current)}
                            >
                                <span className="text-[10px] uppercase tracking-widest text-amber-300/80">
                                    Wiring Diagnostics
                                </span>
                                <span className="rounded border border-amber-400/20 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-100/90">
                                    {wiringDiagnostics.length}
                                </span>
                                <div className="flex-1" />
                                <span className="text-[10px] text-amber-200/70">
                                    {showWiringDiagnostics ? 'Hide' : 'Show'}
                                </span>
                            </button>
                            {showWiringDiagnostics && (
                                <div className="border-t border-amber-500/20 px-2 py-2 space-y-1.5">
                                    {wiringDiagnostics.map((diagnostic, index) => {
                                        const isSelected = diagnostic.connectionId === selectedWireId;
                                        return (
                                            <button
                                                key={`${diagnostic.connectionId}:${index}`}
                                                type="button"
                                                className={[
                                                    'block w-full rounded px-2 py-1.5 text-left',
                                                    isSelected
                                                        ? 'bg-amber-400/15 ring-1 ring-amber-300/30'
                                                        : 'hover:bg-amber-400/10',
                                                ].join(' ')}
                                                onClick={() => {
                                                    setSelectedWireId(diagnostic.connectionId);
                                                    setSelectedPartId(null);
                                                    setPopupState(null);
                                                }}
                                            >
                                                <div className="text-[10px] font-mono text-amber-200/80">
                                                    {diagnostic.connectionLabel}
                                                </div>
                                                <div className="mt-0.5 text-[11px] text-amber-50/95">
                                                    {diagnostic.message}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Hovered Pin Label ── */}
                    {showPinTooltips && (
                        <PinTooltip
                            hoveredPin={hoveredPin}
                            wiringStart={wiringStart}
                            pinPositions={pinPositions}
                            diagram={diagram}
                            isEditMode={isEditMode}
                            zoom={canvas.zoom}
                            pan={canvas.pan}
                        />
                    )}

                    {selectedWireHints.length > 0 && (
                        <div className="mx-3 mt-2 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100">
                            <div className="text-[10px] uppercase tracking-widest text-amber-300/80">
                                Wiring Hint
                            </div>
                            <div className="mt-1 space-y-1">
                                {selectedWireHints.map((hint) => (
                                    <div key={hint}>{hint}</div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Canvas + oscilloscope column */}
                    <div className="flex flex-col flex-1 overflow-hidden">
                        {/* ── Drawing Canvas ── */}
                        <div
                            ref={canvas.containerRef}
                            className="flex-1 relative overflow-hidden outline-none"
                            role="application"
                            style={{
                                backgroundColor: 'var(--vsc-surface)',
                                backgroundImage: isEditMode
                                    ? 'radial-gradient(circle, var(--vsc-canvas-dot) 1px, transparent 1px)'
                                    : 'none',
                                backgroundSize: `${20 * canvas.zoom}px ${20 * canvas.zoom}px`,
                                backgroundPosition: `${canvas.pan.x}px ${canvas.pan.y}px`,
                                cursor: canvasCursor,
                            }}
                            onWheel={canvas.handleWheel}
                            onPointerDown={handleCanvasPointerDown}
                            onPointerMove={canvas.handlePointerMove}
                            onPointerUp={handlePointerUp}
                            onPointerLeave={handlePointerUp}
                            onContextMenu={(e) => e.preventDefault()}
                        >
                            {!hasParts && (
                                <div className="absolute inset-0 z-30 flex items-center justify-center p-6 pointer-events-none">
                                    <div className="pointer-events-auto max-w-md rounded-xl border border-vscode-border bg-vscode-panel/94 px-5 py-5 text-center shadow-2xl backdrop-blur-sm">
                                        <div className="text-[11px] uppercase tracking-[0.18em] text-vscode-text opacity-60">
                                            Empty Simulator
                                        </div>
                                        <div className="mt-2 text-[18px] font-semibold text-vscode-textActive">
                                            No board has been added yet
                                        </div>
                                        <p className="mt-2 text-[12px] leading-relaxed text-vscode-text opacity-75">
                                            Start by choosing an Arduino board for your circuit.
                                        </p>
                                        <div className="mt-4 grid gap-2 text-left">
                                            {EMPTY_STATE_BOARDS.map((board) => (
                                                <button
                                                    key={board.type}
                                                    type="button"
                                                    className={[
                                                        'rounded-lg border border-vscode-border bg-vscode-input/70 px-3 py-2',
                                                        'text-sm text-vscode-text transition-colors',
                                                        'hover:border-blue-500 hover:bg-vscode-hover hover:text-vscode-textActive',
                                                    ].join(' ')}
                                                    onClick={() => handleAddEmptyStateBoard(board.type)}
                                                >
                                                    {board.label}
                                                </button>
                                            ))}
                                        </div>
                                        <div className="mt-3 text-[12px] text-vscode-text opacity-70">
                                            Use the toolbar + button to add sensors and other components
                                            {' '}
                                            after selecting a board.
                                        </div>
                                    </div>
                                </div>
                            )}

                            {(wiringLegendState.validTones.length > 0 || wiringLegendState.hasInvalid) && (
                                <div
                                    className={[
                                        'absolute right-3 top-3 z-40 pointer-events-none rounded px-2.5 py-2 text-[10px] shadow-lg backdrop-blur-sm transition-colors',
                                        wiringLegendState.visualMode === 'blocked'
                                            ? 'border border-rose-300/30 bg-rose-950/78 text-rose-50 shadow-rose-950/30'
                                            : 'border border-slate-300/10 bg-black/52 text-slate-100 shadow-black/20',
                                    ].join(' ')}
                                >
                                    <div className={[
                                        'uppercase tracking-widest text-[8px]',
                                        wiringLegendState.visualMode === 'blocked'
                                            ? 'text-rose-200/85'
                                            : 'text-slate-300/65',
                                    ].join(' ')}>
                                        {wiringLegendState.heading}
                                    </div>
                                    <div className={[
                                        'mt-1 text-[10px]',
                                        wiringLegendState.visualMode === 'blocked'
                                            ? 'text-rose-100/90'
                                            : 'text-slate-200/58',
                                    ].join(' ')}>
                                        {wiringLegendState.description}
                                    </div>
                                    {wiringLegendState.validTones.length > 0 && (
                                        <div className="mt-1.5 flex flex-wrap gap-1.5 max-w-[240px]">
                                            {wiringLegendState.validTones.map((tone) => {
                                                const appearance = getWiringCandidateToneAppearance(tone);
                                                return (
                                                    <div
                                                        key={tone}
                                                        className={[
                                                            'flex items-center gap-1.5 rounded px-1.5 py-1',
                                                            wiringLegendState.visualMode === 'blocked'
                                                                ? 'border border-white/10 bg-white/8'
                                                                : 'border border-white/6 bg-white/4',
                                                        ].join(' ')}
                                                    >
                                                        <span
                                                            className="block h-2.5 w-2.5 rounded-full border"
                                                            style={{
                                                                backgroundColor: appearance.fill,
                                                                borderColor: appearance.stroke,
                                                                boxShadow: `0 0 0 2px ${appearance.ring}`,
                                                            }}
                                                        />
                                                        <span className={[
                                                            'text-[10px]',
                                                            wiringLegendState.visualMode === 'blocked'
                                                                ? 'text-rose-50/95'
                                                                : 'text-slate-100/82',
                                                        ].join(' ')}>
                                                            {appearance.label}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                    {wiringLegendState.hasInvalid && (() => {
                                        const invalidAppearance = getWiringCandidateToneAppearance('invalid');
                                        return (
                                            <div className={[
                                                'mt-1.5 flex items-center gap-1.5 rounded px-1.5 py-1 text-[10px]',
                                                wiringLegendState.visualMode === 'blocked'
                                                    ? 'border border-rose-300/30 bg-rose-400/16 text-rose-50'
                                                    : 'border border-rose-400/15 bg-rose-500/10 text-rose-50/95',
                                            ].join(' ')}>
                                                <span
                                                    className="block h-2.5 w-2.5 rounded-full border"
                                                    style={{
                                                        backgroundColor: invalidAppearance.fill,
                                                        borderColor: invalidAppearance.stroke,
                                                        boxShadow: `0 0 0 2px ${invalidAppearance.ring}`,
                                                    }}
                                                />
                                                <span>
                                                    {invalidAppearance.label} targets visible
                                                </span>
                                            </div>
                                        );
                                    })()}
                                </div>
                            )}

                            <div
                                className="absolute top-0 left-0 transform-gpu w-full h-full pointer-events-none"
                                style={{
                                    transform: `translate(${canvas.pan.x}px, ${canvas.pan.y}px) scale(${canvas.zoom})`,
                                    transformOrigin: '0 0',
                                }}
                            >
                                {/* Parts */}
                                {diagram?.parts.map((part) => (
                                    <PartRenderer
                                        key={part.id}
                                        part={part}
                                        customChipManifest={
                                            part.type.startsWith('chip-')
                                                ? customChipManifests?.[part.type.slice('chip-'.length)]
                                                : undefined
                                        }
                                        isEditMode={isEditMode}
                                        isDragging={canvas.draggingPart === part.id}
                                        isSelected={selectedPartId === part.id}
                                        onPartPointerDown={canvas.handlePartPointerDown}
                                        onPartClick={handlePartClick}
                                        onRotate={handleRotatePart}
                                        onLabelTextChange={handleLabelTextChange}
                                    />
                                ))}

                                {/* SVG Wires & Pin Pads */}
                                <svg
                                    className="absolute inset-0 pointer-events-none z-30"
                                    style={{ minWidth: '100%', minHeight: '100%', overflow: 'visible' }}
                                >
                                    {wires}
                                    {isEditMode && (
                                        <PinOverlay
                                            pinPositions={pinPositions}
                                            wiringStart={wiringStart}
                                            hoveredPin={hoveredPin}
                                            pinDescriptors={wiringCandidateDescriptors}
                                            onHoverPin={setHoveredPin}
                                            onWiringStart={handleWiringStart}
                                            onWiringEnd={handleWiringEnd}
                                            setDraggingPart={canvas.setDraggingPart}
                                        />
                                    )}
                                </svg>
                            </div>

                            {/* ── Wire Color Popup ── */}
                            {popupState && isEditMode && (
                                <WireColorPopup
                                    x={popupState.x}
                                    y={popupState.y}
                                    currentColor={popupState.color}
                                    onClose={() => setPopupState(null)}
                                    onSelectColor={(color) => {
                                        if (diagramRef.current && onDiagramChange) {
                                            const updatedConnections = diagramRef.current.connections.map(c =>
                                                c.id === popupState.id ? { ...c, color } : c
                                            );
                                            onDiagramChange({
                                                ...diagramRef.current,
                                                connections: updatedConnections
                                            });
                                        }
                                        setPopupState(null);
                                    }}
                                />
                            )}


                        </div>

                        {/* ── Oscilloscope ── */}
                        {showOscilloscope && (
                            <div style={{ height: 220 }} className="border-t border-vscode-border shrink-0">
                                <Oscilloscope
                                    isPlaying={sim.isPlaying}
                                    getCpuSnapshot={sim.getCpuSnapshot}
                                />
                            </div>
                        )}
                    </div>
                </div>

                {/* ── AVR Inspector side panel ── */}
                {showInspector && (
                    <div
                        className="border-l border-vscode-border shrink-0 overflow-hidden bg-vscode-panel"
                        style={{ width: 300 }}
                    >
                        <AVRInspector
                            isPlaying={sim.isPlaying}
                            getCpuSnapshot={sim.getCpuSnapshot}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
