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

import PinOverlay from './PinOverlay';
import PartRenderer from './PartRenderer';
import PinTooltip from './PinTooltip';
import WireColorPopup from './WireColorPopup';
import ComponentPropertyEditor, { PROPERTY_CATALOG } from './ComponentPropertyEditor';
import type { ComponentProperties } from './ComponentPropertyEditor';

export default function WokwiSimulator({
    diagram, hex, isCompiling, onCompile,
    onSerialOutput, onAddComponent, onDiagramChange, serialWriteRef,
}: WokwiSimulatorProps) {
    // ── Local UI State ──
    const [isEditMode, setIsEditMode] = useState(true);
    const wireColor = 'green';
    const [hoveredPin, setHoveredPin] = useState<string | null>(null);
    const [wiringStart, setWiringStart] = useState<string | null>(null);
    const [popupState, setPopupState] = useState<{ id: string, color: string, x: number, y: number } | null>(null);

    const wiringStartRef = useRef<string | null>(null);
    const diagramRef = useRef<WokwiDiagram | undefined>(diagram);

    useEffect(() => {
        diagramRef.current = diagram;
    }, [diagram]);

    // ── Hooks ──
    const canvas = useCanvasInteraction(diagramRef, onDiagramChange);
    const pinPositions = usePinPositions(diagram);
    const sim = useSimulation({ diagram, hex, onSerialOutput, setIsEditMode });

    // Expose serialWrite to parent via ref
    useEffect(() => {
        if (serialWriteRef) serialWriteRef.current = sim.serialWrite;
        return () => { if (serialWriteRef) serialWriteRef.current = null; };
    }, [sim.serialWrite, serialWriteRef]);

    // Build property editor data from adjustable devices
    const editableComponents = useMemo<ComponentProperties[]>(() => {
        return sim.adjustableDevices
            .filter(d => PROPERTY_CATALOG[d.partType])
            .map(d => {
                const cat = PROPERTY_CATALOG[d.partType];
                return {
                    partId: d.partId,
                    partType: d.partType,
                    label: cat.label,
                    properties: cat.props,
                    get: d.get,
                    set: d.set,
                };
            });
    }, [sim.adjustableDevices]);

    const handleWireClick = (e: React.MouseEvent, connId: string) => {
        e.stopPropagation();
        const conn = diagram?.connections.find(c => c.id === connId);
        if (conn && canvas.containerRef.current) {
            const rect = canvas.containerRef.current.getBoundingClientRect();
            setPopupState({
                id: connId,
                color: conn.color,
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
            });
        }
    };

    const wires = useWireRenderer({
        diagram, pinPositions, wiringStart,
        mousePos: canvas.mousePos, pan: canvas.pan, zoom: canvas.zoom,
        isEditMode, wireColor: 'green', diagramRef, onDiagramChange,
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

    return (
        <div className="flex flex-col h-full bg-[#1a1a1a] w-full relative">
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
                renderAddMenu={
                    <AddComponentMenu
                        diagram={diagram}
                        pan={canvas.pan}
                        zoom={canvas.zoom}
                        onAddComponent={onAddComponent}
                    />
                }
            />

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
            <PinTooltip
                hoveredPin={hoveredPin}
                pinPositions={pinPositions}
                isEditMode={isEditMode}
                zoom={canvas.zoom}
                pan={canvas.pan}
            />

            {/* ── Drawing Canvas ── */}
            <div
                ref={canvas.containerRef}
                className="flex-1 relative overflow-hidden outline-none"
                style={{
                    backgroundColor: '#1a1a1a',
                    backgroundImage: isEditMode
                        ? 'radial-gradient(circle, #2a2a2a 1px, transparent 1px)'
                        : 'none',
                    backgroundSize: `${20 * canvas.zoom}px ${20 * canvas.zoom}px`,
                    backgroundPosition: `${canvas.pan.x}px ${canvas.pan.y}px`,
                    cursor: canvas.isPanning ? 'grabbing' : (wiringStart ? 'crosshair' : 'default'),
                }}
                onWheel={canvas.handleWheel}
                onPointerDown={canvas.handlePointerDown}
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
                            isEditMode={isEditMode}
                            isDragging={canvas.draggingPart === part.id}
                            onPartPointerDown={canvas.handlePartPointerDown}
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
        </div>
    );
}
