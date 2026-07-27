/**
 * WokwiSimulator
 * Main simulator container that composes all sub-components and hooks.
 * This is the single entry point for the Wokwi visual simulator.
 */
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import type { PinInfo, WokwiSimulatorProps, WokwiDiagram } from '../../types/wokwi.types';
import {
    computePadFreeRotatePosition,
    duplicatePartInDiagram,
    removePartFromDiagram,
} from '../../utils/part-controls';

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
import BuildProgressOverlay from './BuildProgressOverlay';
import CustomViewFrame from './CustomViewFrame';
import { PartColorPopup } from './PartColorPopup';
import { resolveCustomViewUrl, type CustomViewBridgeHandle } from './custom-view-bridge';
import {
    getPartColorConfig,
    resolvePartColor,
    resolvePartSwatchFill,
    updatePartColorInDiagram,
} from '../../constants/part-colors';


import PinOverlay from './PinOverlay';
import PartRenderer from './PartRenderer';
import PinTooltip from './PinTooltip';
import WireColorPopup from './WireColorPopup';
import ComponentPropertyEditor, { PROPERTY_CATALOG } from './ComponentPropertyEditor';
import type { ComponentProperties } from './ComponentPropertyEditor';
import {
    DOT_MATRIX_PART_TYPE,
    DOT_MATRIX_PROPERTY_DEFS,
    resolveDotMatrixConfig,
    serializeDotMatrixConfig,
    type DotMatrixConfig,
} from './dot-matrix';
import { startPerfMeasure } from '../../utils/perf';
import { boardProfiles } from '../../../shared/avr/profiles';
import { getNeoPixelCount } from '../../services/simulation-engine';
import {
    filterWiringDiagnosticHints,
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

svg {
    shape-rendering: geometricPrecision;
    text-rendering: geometricPrecision;
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

const WokwiSimulator = React.memo(function WokwiSimulator({
    projectKey,
    diagram, hex, customChipArtifacts, customChipManifests, isCompiling,
    hasOpenProject = true, canCompile = true, onCompile,
    onSaveProject, canSaveProject, hasUnsavedChanges, saveStatus,
    onSerialOutput, onChipOutput, onAddComponent, onDiagramChange, serialWriteRef,
    stopSimulationRef,
    buildOverlay,
    onDismissBuildOverlay,
    onUndo, onRedo, canUndo, canRedo,
    defaultWireColor = 'green',
    wirePhysics,
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
    const [partColorPopup, setPartColorPopup] = useState<{ partId: string; x: number; y: number } | null>(null);
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
    diagramRef.current = diagram;

    useEffect(() => {
        if (!hasOpenProject) {
            setShowInspector(false);
            setShowOscilloscope(false);
        }
    }, [hasOpenProject]);

    useEffect(() => {
        mountMeasureRef.current?.();
        mountMeasureRef.current = null;
    }, []);

    const customViewUrl = useMemo(
        () => resolveCustomViewUrl(diagram?.customView),
        [diagram?.customView],
    );
    const [preferCustomView, setPreferCustomView] = useState(true);
    const customViewBridgeRef = useRef<CustomViewBridgeHandle | null>(null);
    const isCustomViewActive = Boolean(customViewUrl) && preferCustomView;

    const handleCustomViewNeoPixels = useCallback((_partId: string, pixels: Uint32Array) => {
        customViewBridgeRef.current?.pushNeoPixels(pixels);
    }, []);

    const customViewPixelCount = useMemo(() => {
        for (const part of diagram?.parts ?? []) {
            const count = getNeoPixelCount(part);
            if (count > 0) return count;
        }
        return 0;
    }, [diagram?.parts]);

    const handleSimulatorSerialOutput = useCallback((text: string, usartId?: string) => {
        onSerialOutput(text, usartId);
        if (
            isCustomViewActive
            && (!usartId || usartId === 'usart0')
            && !text.startsWith('[warning] ')
            && !text.startsWith('[error] ')
        ) {
            customViewBridgeRef.current?.pushSerialData?.(text);
        }
    }, [isCustomViewActive, onSerialOutput]);

    // ── Hooks ──
    const canvas = useCanvasInteraction(diagramRef, onDiagramChange, Boolean(wiringStart));
    const effectiveDiagram = useMemo(() => {
        if (!diagram || !canvas.dragPreview) return diagram;
        const { partId, left, top } = canvas.dragPreview;
        return {
            ...diagram,
            parts: diagram.parts.map((part) =>
                part.id === partId ? { ...part, left, top } : part,
            ),
        };
    }, [diagram, canvas.dragPreview]);

    const partsStructureKey = useMemo(
        () => (diagram?.parts ?? []).map((p) => `${p.id}:${p.type}`).join(','),
        [diagram?.parts],
    );

    const pinPositions = usePinPositions(effectiveDiagram, projectKey);
    const sim = useSimulation({
        projectKey,
        diagram,
        hex,
        customChipArtifacts,
        customChipManifests,
        onSerialOutput: handleSimulatorSerialOutput,
        onChipOutput,
        onNeoPixelsUpdate: handleCustomViewNeoPixels,
        setIsEditMode,
    });
    const prevProjectKeyRef = useRef<string | undefined>(projectKey);
    const { handleStop: stopSim } = sim;
    const { resetInteraction } = canvas;

    useEffect(() => {
        setPreferCustomView(true);
    }, [customViewUrl, projectKey]);

    useEffect(() => {
        const frameId = globalThis.requestAnimationFrame(() => {
            applyEmbeddedLayoutTweaks(canvas.containerRef.current);
        });

        return () => globalThis.cancelAnimationFrame(frameId);
    }, [canvas.containerRef, isEditMode, partsStructureKey]);

    let canvasCursor = 'default';
    if (canvas.isPanning) {
        canvasCursor = 'grabbing';
    } else if (wiringStart) {
        canvasCursor = 'crosshair';
    }

    const stopAndResetSimulator = useCallback(() => {
        stopSim();
        setIsEditMode(true);
    }, [stopSim]);

    useEffect(() => {
        if (stopSimulationRef) stopSimulationRef.current = stopAndResetSimulator;
        return () => { if (stopSimulationRef) stopSimulationRef.current = null; };
    }, [stopAndResetSimulator, stopSimulationRef]);

    useEffect(() => {
        if (prevProjectKeyRef.current === projectKey) return;
        prevProjectKeyRef.current = projectKey;
        stopSim();
        setIsEditMode(true);
        setHoveredPin(null);
        setWiringStart(null);
        wiringStartRef.current = null;
        setPopupState(null);
        setPartColorPopup(null);
        setSelectedWireId(null);
        setSelectedPartId(null);
        resetInteraction();
    }, [projectKey, stopSim, resetInteraction]);

    // Expose serialWrite to parent via ref
    useEffect(() => {
        if (serialWriteRef) serialWriteRef.current = sim.serialWrite;
        return () => { if (serialWriteRef) serialWriteRef.current = null; };
    }, [sim.serialWrite, serialWriteRef]);

    const handlePartAttrsChange = useCallback((partId: string, nextAttrs: Record<string, string>) => {
        if (!diagramRef.current || !onDiagramChange) return;
        const newParts = diagramRef.current.parts.map((part) =>
            part.id === partId ? { ...part, attrs: nextAttrs } : part,
        );
        onDiagramChange({ ...diagramRef.current, parts: newParts });
    }, [onDiagramChange]);

    // Build property editor data from diagram-configurable parts + runtime adjustable devices
    const editableComponents = useMemo<ComponentProperties[]>(() => {
        const diagramConfigurable: ComponentProperties[] = (diagram?.parts ?? [])
            .filter((part) => part.type === DOT_MATRIX_PART_TYPE)
            .map((part) => ({
                partId: part.id,
                partType: part.type,
                label: 'Dot Matrix RGB',
                properties: DOT_MATRIX_PROPERTY_DEFS,
                get: (key) => resolveDotMatrixConfig(part.attrs)[key as keyof DotMatrixConfig],
                set: (key, value) => {
                    const livePart = diagramRef.current?.parts.find((candidate) => candidate.id === part.id) ?? part;
                    handlePartAttrsChange(
                        part.id,
                        serializeDotMatrixConfig({ [key as keyof DotMatrixConfig]: value }, livePart.attrs),
                    );
                },
            }));

        const runtimeAdjustable = sim.adjustableDevices
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

        return [...diagramConfigurable, ...runtimeAdjustable];
    }, [diagram?.parts, handlePartAttrsChange, sim.adjustableDevices]);

    const selectedWireHints = useMemo(() => {
        if (!selectedWireId) {
            return [];
        }

        const rawHints = diagram?.connections.find((connection) => connection.id === selectedWireId)?.routeHints;
        return filterWiringDiagnosticHints(rawHints);
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
            // Keep popup (approx 172 × 125 px) inside the canvas bounds
            const POPUP_W = 180;
            const POPUP_H = 132;
            const clampedX = Math.min(Math.max(rawX, POPUP_W / 2), rect.width - POPUP_W / 2);
            const clampedY = Math.min(Math.max(rawY, POPUP_H + 12), rect.height - 8);
            setPopupState({
                id: connId,
                color: conn.color,
                x: clampedX,
                y: clampedY,
            });
            setPartColorPopup(null);
        }
    };

    /** Remove a part and all wires connected to its pins */
    const handleDeletePart = useCallback((partId: string) => {
        if (diagramRef.current && onDiagramChange) {
            onDiagramChange(removePartFromDiagram(diagramRef.current, partId));
        }
        setSelectedPartId(null);
        setSelectedWireId(null);
        setPopupState(null);
        setPartColorPopup(null);
        if (wiringStartRef.current?.startsWith(`${partId}:`)) {
            wiringStartRef.current = null;
            setWiringStart(null);
        }
    }, [diagramRef, onDiagramChange]);

    const handleDuplicatePart = useCallback((partId: string) => {
        if (!diagramRef.current || !onDiagramChange) return;
        const result = duplicatePartInDiagram(diagramRef.current, partId);
        if (!result) return;
        onDiagramChange(result.diagram);
        setSelectedPartId(result.duplicatedPartId);
        setSelectedWireId(null);
        setPopupState(null);
        setPartColorPopup(null);
    }, [diagramRef, onDiagramChange]);

    const restartTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
    useEffect(() => () => {
        if (restartTimerRef.current !== null) {
            globalThis.clearTimeout(restartTimerRef.current);
        }
    }, []);

    const handleRestartSim = useCallback(() => {
        sim.handleStop();
        if (restartTimerRef.current !== null) {
            globalThis.clearTimeout(restartTimerRef.current);
        }
        restartTimerRef.current = globalThis.setTimeout(() => {
            restartTimerRef.current = null;
            sim.handlePlay();
        }, 20);
    }, [sim]);

    // ── Keyboard handler: Delete removes selected wire or component, R rotates selected part ──
    useEffect(() => {
        if (!isEditMode) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            // Don't steal keystrokes when the user is typing
            const tag = (document.activeElement as HTMLElement)?.tagName?.toLowerCase();
            const isTyping = tag === 'input' || tag === 'textarea'
                || (document.activeElement as HTMLElement)?.isContentEditable;
            if (isTyping) return;

            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (selectedWireId) {
                    if (diagramRef.current && onDiagramChange) {
                        const newConnections = diagramRef.current.connections.filter(c => c.id !== selectedWireId);
                        onDiagramChange({ ...diagramRef.current, connections: newConnections });
                    }
                    setSelectedWireId(null);
                    setPopupState(null);
                } else if (selectedPartId) {
                    handleDeletePart(selectedPartId);
                }
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

            // D (with Ctrl/Cmd) — duplicate selected part
            if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D') && selectedPartId) {
                e.preventDefault();
                handleDuplicatePart(selectedPartId);
                return;
            }

            if (e.key === 'Escape') {
                setSelectedWireId(null);
                setSelectedPartId(null);
                setPopupState(null);
                setPartColorPopup(null);
            }
        };
        globalThis.addEventListener('keydown', handleKeyDown);
        return () => globalThis.removeEventListener('keydown', handleKeyDown);
    }, [isEditMode, selectedWireId, selectedPartId, onDiagramChange, diagramRef, handleDeletePart, handleDuplicatePart]);

    // ── Part selection + rotate + color ──
    const openPartColorPopup = useCallback((partId: string) => {
        const container = canvas.containerRef.current;
        const part = diagramRef.current?.parts.find((p) => p.id === partId);
        if (!container || !part || !getPartColorConfig(part.type)) return;

        const rect = container.getBoundingClientRect();
        const escapedId = globalThis.CSS?.escape ? globalThis.CSS.escape(partId) : partId.replace(/["\\]/g, '\\$&');
        const partEl = container.querySelector(`[id="${escapedId}"]`) as HTMLElement | null;
        const rawX = partEl
            ? partEl.getBoundingClientRect().left + partEl.getBoundingClientRect().width / 2 - rect.left
            : part.left * canvas.zoom + canvas.pan.x;
        const rawY = partEl
            ? partEl.getBoundingClientRect().top - rect.top
            : part.top * canvas.zoom + canvas.pan.y;

        const POPUP_W = 180;
        const POPUP_H = 132;
        const minX = POPUP_W / 2;
        const maxX = Math.max(minX, rect.width - POPUP_W / 2);
        const minY = POPUP_H + 12;
        const maxY = Math.max(minY, rect.height - 8);
        setPartColorPopup({
            partId,
            x: Math.min(Math.max(rawX, minX), maxX),
            y: Math.min(Math.max(rawY, minY), maxY),
        });
    }, [canvas.containerRef, canvas.pan.x, canvas.pan.y, canvas.zoom, diagramRef]);

    const handlePartColorChange = useCallback((partId: string, color: string) => {
        if (!diagramRef.current || !onDiagramChange) return;
        onDiagramChange(updatePartColorInDiagram(diagramRef.current, partId, color));
    }, [diagramRef, onDiagramChange]);

    useEffect(() => {
        if (!isEditMode || canvas.draggingPart) {
            setPartColorPopup(null);
        }
    }, [isEditMode, canvas.draggingPart]);

    /** Select a part; deselects any wire selection */
    const handlePartClick = useCallback((partId: string) => {
        if (wiringStartRef.current) return; // ignore while drawing a wire
        setSelectedPartId(partId);
        setSelectedWireId(null);
        setPopupState(null);
        if (canvas.consumeRecentPartDrag()) {
            setPartColorPopup(null);
            return;
        }
        const clickedPart = diagramRef.current?.parts.find((p) => p.id === partId);
        if (clickedPart && getPartColorConfig(clickedPart.type)) {
            openPartColorPopup(partId);
        } else {
            setPartColorPopup(null);
        }
    }, [canvas, diagramRef, openPartColorPopup]);

    /** Rotate a part by the given absolute degrees */
    const handleRotatePart = useCallback((partId: string, degrees: number) => {
        if (!diagramRef.current || !onDiagramChange) return;
        const newParts = diagramRef.current.parts.map(p =>
            p.id === partId ? { ...p, rotate: degrees } : p
        );
        onDiagramChange({ ...diagramRef.current, parts: newParts });
    }, [onDiagramChange]);

    /** Update the text attribute of a wokwi-label annotation */
    const handleLabelTextChange = useCallback((partId: string, newText: string) => {
        if (!diagramRef.current || !onDiagramChange) return;
        const newParts = diagramRef.current.parts.map(p =>
            p.id === partId
                ? { ...p, attrs: p.attrs ? { ...p.attrs, text: newText } : { text: newText } }
                : p
        );
        onDiagramChange({ ...diagramRef.current, parts: newParts });
    }, [onDiagramChange]);

    const {
        wires,
        wireEndpointHandles,
        snappedPinId,
        isInteracting: isWireInteracting,
    } = useWireRenderer({
        projectKey,
        diagram: effectiveDiagram,
        pinPositions,
        wiringStart,
        mousePos: canvas.mousePos,
        pan: canvas.pan,
        zoom: canvas.zoom,
        isEditMode,
        wireColor,
        wirePhysics,
        selectedWireId,
        diagramRef,
        containerRef: canvas.containerRef,
        onDiagramChange,
        onWireClick: handleWireClick,
    });

    const selectedPart = useMemo(
        () => effectiveDiagram?.parts.find((candidate) => candidate.id === selectedPartId) ?? null,
        [effectiveDiagram?.parts, selectedPartId],
    );

    const rotateHandlePos = useMemo(() => {
        if (
            !isEditMode
            || !selectedPart
            || wiringStart
            || isWireInteracting
            || canvas.draggingPart
        ) {
            return null;
        }

        const el = document.getElementById(selectedPart.id) as (HTMLElement & { pinInfo?: PinInfo[] }) | null;
        const width = el?.offsetWidth || 60;
        const height = el?.offsetHeight || 60;
        const pins = Array.isArray(el?.pinInfo) ? el.pinInfo : [];

        return computePadFreeRotatePosition({
            left: selectedPart.left,
            top: selectedPart.top,
            width,
            height,
            rotate: selectedPart.rotate,
            pins,
        });
    }, [canvas.draggingPart, isEditMode, isWireInteracting, pinPositions, selectedPart, wiringStart]);

    // ── Wiring Handlers ──
    const handleWiringStart = useCallback((pinId: string) => {
        wiringStartRef.current = pinId;
        setWiringStart(pinId);
    }, []);

    const handleWiringEnd = useCallback((pinId: string) => {
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
    }, [onDiagramChange, wireColor]);

    const handlePointerUp = () => {
        canvas.handlePointerUp();
        if (wiringStart) {
            if (snappedPinId && snappedPinId !== wiringStart) {
                handleWiringEnd(snappedPinId);
            } else {
                setWiringStart(null);
                wiringStartRef.current = null;
            }
        }
    };

    /** Clicking on the empty canvas background deselects wires and parts */
    const handleCanvasPointerDown = (e: React.PointerEvent) => {
        if (isWireInteracting) return;
        canvas.handlePointerDown(e);
        // Only deselect on direct background clicks (not bubbled from wires/parts/popup)
        if (e.target === e.currentTarget || (e.target as HTMLElement).closest?.('svg') === null) {
            if (selectedWireId || selectedPartId || popupState || partColorPopup) {
                setSelectedWireId(null);
                setSelectedPartId(null);
                setPopupState(null);
                setPartColorPopup(null);
            }
        }
    };

    return (
        <div className="flex flex-col h-full bg-vscode-surface w-full relative">
            {/* ── Toolbar ── */}
            <SimulatorToolbar
                isEditMode={isEditMode}
                onToggleEditMode={() => setIsEditMode(!isEditMode)}
                hasOpenProject={hasOpenProject}
                canCompile={canCompile}
                hasParts={hasParts}
                hasCustomView={Boolean(customViewUrl)}
                isCustomViewActive={isCustomViewActive}
                onToggleCustomView={() => setPreferCustomView((v) => !v)}
                isPlaying={sim.isPlaying}
                isCompiling={isCompiling}
                hex={hex}
                onCompile={onCompile}
                onPlay={sim.handlePlay}
                onStop={sim.handleStop}
                onRestart={handleRestartSim}
                onSaveProject={onSaveProject}
                canSaveProject={canSaveProject}
                hasUnsavedChanges={hasUnsavedChanges}
                saveStatus={saveStatus}
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
                        disabled={!hasOpenProject}
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
                <div className="flex flex-col flex-1 overflow-hidden relative">
                    {isCustomViewActive && customViewUrl ? (
                        <CustomViewFrame
                            url={customViewUrl}
                            isPlaying={sim.isPlaying}
                            initialPixelCount={customViewPixelCount}
                            bridgeRef={customViewBridgeRef}
                        />
                    ) : (
                        <>
                            {/* ── Component Property Editor ── */}
                    <ComponentPropertyEditor
                        components={editableComponents}
                        isPlaying={sim.isPlaying}
                        hidden={Boolean(wiringStart)}
                    />

                    {wiringDiagnostics.length > 0 && (
                        <div className="mx-3 mt-2 shrink-0 rounded border border-amber-500/30 bg-amber-500/10 text-[11px] text-amber-100 overflow-hidden">
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
                                <div className="max-h-40 overflow-y-auto border-t border-amber-500/20 px-2 py-2 space-y-1.5">
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
                                backgroundPosition: `${Math.round(canvas.pan.x)}px ${Math.round(canvas.pan.y)}px`,
                                cursor: canvasCursor,
                            }}
                            onWheel={canvas.handleWheel}
                            onPointerDown={handleCanvasPointerDown}
                            onPointerMove={canvas.handlePointerMove}
                            onPointerUp={handlePointerUp}
                            onContextMenu={(e) => e.preventDefault()}
                        >
                            {/* ── Canvas Zoom Controls ── */}
                            <CanvasZoomControls
                                zoom={canvas.zoom}
                                onZoomIn={() => canvas.setZoom(z => Math.min(5, Math.round((z + 0.1) * 100) / 100))}
                                onZoomOut={() => canvas.setZoom(z => Math.max(0.1, Math.round((z - 0.1) * 100) / 100))}
                                onReset={() => { canvas.setZoom(1); canvas.setPan({ x: 0, y: 0 }); }}
                            />
                            {!hasOpenProject && (
                                <div className="absolute inset-0 z-30 flex items-center justify-center p-6 pointer-events-none">
                                    <div className="pointer-events-auto max-w-md rounded-xl border border-vscode-border bg-vscode-panel/94 px-6 py-5 text-center shadow-2xl backdrop-blur-sm">
                                        <div className="text-[11px] uppercase tracking-[0.18em] text-vscode-text opacity-60">
                                            Simulator Idle
                                        </div>
                                        <div className="mt-2 text-[18px] font-semibold text-vscode-textActive">
                                            No project open
                                        </div>
                                        <p className="mt-2 text-[12px] leading-relaxed text-vscode-text opacity-75">
                                            Select an example in the Explorer sidebar, create a new project, or import an existing one to build and simulate circuits.
                                        </p>
                                    </div>
                                </div>
                            )}
                            {hasOpenProject && !hasParts && (
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
                                className="absolute w-full h-full pointer-events-none"
                                style={{
                                    left: `${Math.round(canvas.pan.x)}px`,
                                    top: `${Math.round(canvas.pan.y)}px`,
                                    transform: canvas.zoom !== 1 ? `scale(${canvas.zoom})` : undefined,
                                    transformOrigin: '0 0',
                                }}
                            >
                                {/* Parts */}
                                {effectiveDiagram?.parts.map((part) => (
                                    <PartRenderer
                                        key={`${projectKey ?? 'default'}:${part.id}`}
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
                                            snappedPinId={snappedPinId}
                                            pinDescriptors={wiringCandidateDescriptors}
                                            onHoverPin={setHoveredPin}
                                            onWiringStart={handleWiringStart}
                                            onWiringEnd={handleWiringEnd}
                                            setDraggingPart={canvas.setDraggingPart}
                                        />
                                    )}
                                    {wireEndpointHandles}
                                </svg>

                                {/* Floating pad-free component actions — rendered above z-30 wires layer */}
                                {rotateHandlePos && selectedPart && (
                                    <div
                                        className={[
                                            'absolute z-40 pointer-events-auto flex items-center gap-1.5',
                                            rotateHandlePos.orientation === 'vertical' ? 'flex-col' : 'flex-row',
                                        ].join(' ')}
                                        style={{
                                            left: `${rotateHandlePos.x}px`,
                                            top: `${rotateHandlePos.y}px`,
                                            transform: 'translate(-50%, -50%)',
                                        }}
                                    >
                                        {selectedPart.type !== 'wokwi-label' && (
                                            <button
                                                type="button"
                                                className={[
                                                    'bg-blue-600 hover:bg-blue-500 active:bg-blue-700',
                                                    'text-white rounded-full w-7 h-7 border border-blue-300/40',
                                                    'flex items-center justify-center',
                                                    'shadow-lg shadow-black/50 transition-colors',
                                                ].join(' ')}
                                                title={`Rotate 90° (R) · ${rotateHandlePos.side}`}
                                                aria-label="Rotate component 90 degrees"
                                                onPointerDown={(e) => e.stopPropagation()}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleRotatePart(selectedPart.id, ((selectedPart.rotate || 0) + 90) % 360);
                                                }}
                                            >
                                                <svg
                                                    xmlns="http://www.w3.org/2000/svg"
                                                    width="14"
                                                    height="14"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth="2.5"
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    aria-hidden="true"
                                                >
                                                    <path d="M21 2v6h-6" />
                                                    <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                                                    <path d="M3 22v-6h6" />
                                                    <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                                                </svg>
                                            </button>
                                        )}
                                        {(() => {
                                            const partColorCfg = getPartColorConfig(selectedPart.type);
                                            if (!partColorCfg) return null;
                                            const swatchFill = resolvePartSwatchFill(selectedPart);
                                            const currentColor = resolvePartColor(selectedPart);
                                            return (
                                                <button
                                                    type="button"
                                                    className={[
                                                        'bg-neutral-800/95 hover:bg-neutral-700 active:bg-neutral-900',
                                                        'rounded-full w-7 h-7 border border-neutral-500/70',
                                                        'flex items-center justify-center',
                                                        'shadow-lg shadow-black/50 transition-colors cursor-pointer',
                                                    ].join(' ')}
                                                    title={`${partColorCfg.title} (${currentColor})`}
                                                    aria-label={partColorCfg.title}
                                                    onPointerDown={(e) => e.stopPropagation()}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        openPartColorPopup(selectedPart.id);
                                                    }}
                                                >
                                                    <span
                                                        className="w-4 h-4 rounded-full border border-white/70 shadow-inner"
                                                        style={{ background: swatchFill }}
                                                    />
                                                </button>
                                            );
                                        })()}
                                        {!selectedPart.type.startsWith('wokwi-arduino-') && (
                                            <button
                                                type="button"
                                                className={[
                                                    'bg-emerald-600/95 hover:bg-emerald-500 active:bg-emerald-700',
                                                    'text-white rounded-full w-7 h-7 border border-emerald-300/40',
                                                    'flex items-center justify-center',
                                                    'shadow-lg shadow-black/50 transition-colors cursor-pointer',
                                                ].join(' ')}
                                                title="Duplicate component (Ctrl+D)"
                                                aria-label="Duplicate component"
                                                onPointerDown={(e) => e.stopPropagation()}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDuplicatePart(selectedPart.id);
                                                }}
                                            >
                                                <svg
                                                    xmlns="http://www.w3.org/2000/svg"
                                                    width="13"
                                                    height="13"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth="2.2"
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    aria-hidden="true"
                                                >
                                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                                </svg>
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            className={[
                                                'bg-rose-600 hover:bg-rose-500 active:bg-rose-700',
                                                'text-white rounded-full w-7 h-7 border border-rose-300/40',
                                                'flex items-center justify-center',
                                                'shadow-lg shadow-black/50 transition-colors',
                                            ].join(' ')}
                                            title="Delete component (Del)"
                                            aria-label="Delete component"
                                            onPointerDown={(e) => e.stopPropagation()}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeletePart(selectedPart.id);
                                            }}
                                        >
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                width="14"
                                                height="14"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="2.2"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                aria-hidden="true"
                                            >
                                                <path d="M3 6h18" />
                                                <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
                                                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                                <line x1="10" y1="11" x2="10" y2="17" />
                                                <line x1="14" y1="11" x2="14" y2="17" />
                                            </svg>
                                        </button>
                                    </div>
                                )}
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
                                    onDelete={() => {
                                        if (diagramRef.current && onDiagramChange) {
                                            const updatedConnections = diagramRef.current.connections.filter(
                                                (c) => c.id !== popupState.id,
                                            );
                                            onDiagramChange({
                                                ...diagramRef.current,
                                                connections: updatedConnections,
                                            });
                                        }
                                        setSelectedWireId(null);
                                        setPopupState(null);
                                    }}
                                />
                            )}

                            {/* ── Component Color Popup ── */}
                            {(() => {
                                if (!partColorPopup || !isEditMode) return null;
                                const activePopupPart = diagram?.parts.find((p) => p.id === partColorPopup.partId);
                                if (!activePopupPart) return null;
                                const activePartColorConfig = getPartColorConfig(activePopupPart.type);
                                if (!activePartColorConfig) return null;
                                return (
                                    <PartColorPopup
                                        x={partColorPopup.x}
                                        y={partColorPopup.y}
                                        title={activePartColorConfig.title}
                                        currentColor={resolvePartColor(activePopupPart)}
                                        swatches={activePartColorConfig.swatches}
                                        onClose={() => setPartColorPopup(null)}
                                        onSelectColor={(color) => {
                                            handlePartColorChange(activePopupPart.id, color);
                                            setPartColorPopup(null);
                                        }}
                                        onDelete={() => handleDeletePart(activePopupPart.id)}
                                    />
                                );
                            })()}

                        </div>
                    </div>
                        </>
                    )}

                    {/* ── Oscilloscope ── */}
                    {showOscilloscope && (
                        <div style={{ height: 220 }} className="border-t border-vscode-border shrink-0">
                            <Oscilloscope
                                isPlaying={sim.isPlaying}
                                getCpuSnapshot={sim.getCpuSnapshot}
                            />
                        </div>
                    )}

                    {/* ── Centered Live Build Progress / Error HUD ── */}
                    <BuildProgressOverlay
                        state={buildOverlay}
                        onClose={onDismissBuildOverlay}
                        onRetry={onCompile}
                    />
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
});

export default WokwiSimulator;
