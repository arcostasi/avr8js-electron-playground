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
            onDiagramChange({
                ...diagramRef.current,
                connections: [
                    ...diagramRef.current.connections,
                    { id: nextId, from: startPin, to: pinId, color: wireColor }
                ],
            });
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

                    {/* ── Hovered Pin Label ── */}
                    {showPinTooltips && (
                        <PinTooltip
                            hoveredPin={hoveredPin}
                            pinPositions={pinPositions}
                            isEditMode={isEditMode}
                            zoom={canvas.zoom}
                            pan={canvas.pan}
                        />
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
