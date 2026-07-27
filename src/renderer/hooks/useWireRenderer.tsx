/**
 * useWireRenderer
 * Builds interactive jumper wires using an isolated sub-stepped Verlet WirePhysicsEngine,
 * crisp multi-layer Reason Rack / Netoun vector rendering, magnetic pin snapping, and 0%-CPU idle/sim suspension.
 */
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { WokwiDiagram, PinPosition } from '../types/wokwi.types';
import { buildTempCatenaryPath } from '../utils/catenary';
import { getConnectionRouteHints } from '../utils/pin-capabilities';
import { resolveWireAppearance } from '../constants/wire-colors';
import {
    clampWirePhysicsSettings,
    computeStaticWireGeometry,
    DEFAULT_WIRE_PHYSICS_SETTINGS,
    findMagneticSnapPin,
    WirePhysicsEngine,
    type WireGeometry,
    type WirePhysicsSettings,
    type WirePoint,
} from '../services/wire-physics-engine';

interface UseWireRendererParams {
    projectKey?: string;
    diagram?: WokwiDiagram;
    pinPositions: Record<string, PinPosition>;
    wiringStart: string | null;
    mousePos: { x: number; y: number };
    pan: { x: number; y: number };
    zoom: number;
    isEditMode: boolean;
    wireColor: string;
    wirePhysics?: WirePhysicsSettings;
    selectedWireId?: string | null;
    diagramRef: React.RefObject<WokwiDiagram | undefined>;
    containerRef: React.RefObject<HTMLDivElement | null>;
    onDiagramChange?: (newDiagram: WokwiDiagram) => void;
    onWireClick?: (e: React.MouseEvent, connId: string) => void;
}

export interface UseWireRendererReturn {
    wires: React.ReactNode[];
    wireEndpointHandles: React.ReactNode[];
    snappedPinId: string | null;
    isInteracting: boolean;
}

interface CachedWireDomNodes {
    paths: SVGPathElement[];
    boots: Array<{ endKind: 'start' | 'end'; el: SVGGElement }>;
}

type ActiveWireDrag =
    | {
        kind: 'body';
        wireId: string;
        startClientX: number;
        startClientY: number;
        hasDragged: boolean;
    }
    | {
        kind: 'endpoint';
        wireId: string;
        end: 'start' | 'end';
        oppositePinId: string;
        originPoint: WirePoint;
        startClientX: number;
        startClientY: number;
        hasDragged: boolean;
    };

const MAGNETIC_SNAP_RADIUS = 16;
const DISCONNECT_DRAG_THRESHOLD = 24;
const DRAG_ACTIVATION_PX = 4;

function buildWaypointPath(
    start: PinPosition,
    end: PinPosition,
    waypoints: Array<{ x: number; y: number }>,
): string {
    let path = `M ${start.x} ${start.y}`;
    for (const waypoint of waypoints) {
        path += ` L ${waypoint.x} ${waypoint.y}`;
    }
    path += ` L ${end.x} ${end.y}`;
    return path;
}

function removeWire(diagram: WokwiDiagram, wireId: string): WokwiDiagram {
    return {
        ...diagram,
        connections: diagram.connections.filter((connection) => connection.id !== wireId),
    };
}

function applyGeometryToElements(
    wireGroup: SVGGElement | undefined,
    handleGroup: SVGGElement | undefined,
    domCache: Map<string, CachedWireDomNodes>,
    wireId: string,
    geom: WireGeometry,
): void {
    if (!wireGroup) return;

    let cached = domCache.get(wireId);
    const cacheInvalid = !cached
        || cached.paths.length === 0
        || !cached.paths[0].isConnected
        || (Boolean(handleGroup) && cached.boots.length < 4);

    if (cacheInvalid) {
        const paths = Array.from(wireGroup.querySelectorAll<SVGPathElement>('path[data-wire-path]'));
        const boots: Array<{ endKind: 'start' | 'end'; el: SVGGElement }> = [];
        for (const root of [wireGroup, handleGroup]) {
            if (!root) continue;
            const found = root.querySelectorAll<SVGGElement>('[data-wire-boot]');
            found.forEach((el) => {
                const endKind = el.dataset.wireBoot === 'start' ? 'start' : 'end';
                boots.push({ endKind, el });
            });
        }
        if (paths.length === 0) return;
        cached = { paths, boots };
        domCache.set(wireId, cached);
    }

    if (!cached) return;

    for (const pathEl of cached.paths) {
        pathEl.setAttribute('d', geom.path);
    }

    for (const boot of cached.boots) {
        const pt = boot.endKind === 'start' ? geom.start : geom.end;
        const angle = boot.endKind === 'start' ? geom.startAngle : geom.endAngle;
        boot.el.setAttribute('transform', `translate(${pt.x}, ${pt.y}) rotate(${angle})`);
    }
}

export function useWireRenderer({
    projectKey,
    diagram,
    pinPositions,
    wiringStart,
    mousePos,
    pan,
    zoom,
    isEditMode,
    wireColor,
    wirePhysics,
    selectedWireId,
    diagramRef,
    containerRef,
    onDiagramChange,
    onWireClick,
}: UseWireRendererParams): UseWireRendererReturn {
    const physics = useMemo(
        () => clampWirePhysicsSettings(wirePhysics ?? DEFAULT_WIRE_PHYSICS_SETTINGS),
        [wirePhysics],
    );

    const engineRef = useRef<WirePhysicsEngine | null>(null);
    engineRef.current ??= new WirePhysicsEngine(physics);

    const wireGroupElsRef = useRef<Map<string, SVGGElement>>(new Map());
    const handleGroupElsRef = useRef<Map<string, SVGGElement>>(new Map());
    const domQueryCacheRef = useRef<Map<string, CachedWireDomNodes>>(new Map());

    const rafIdRef = useRef<number | null>(null);
    const activeDragRef = useRef<ActiveWireDrag | null>(null);
    const suppressClickWireIdRef = useRef<string | null>(null);
    const suppressTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
    const prevProjectKeyRef = useRef<string | undefined>(projectKey);

    const panRef = useRef(pan);
    const zoomRef = useRef(zoom);
    const pinPositionsRef = useRef(pinPositions);
    const onDiagramChangeRef = useRef(onDiagramChange);
    const onWireClickRef = useRef(onWireClick);
    const isEditModeRef = useRef(isEditMode);
    panRef.current = pan;
    zoomRef.current = zoom;
    pinPositionsRef.current = pinPositions;
    onDiagramChangeRef.current = onDiagramChange;
    onWireClickRef.current = onWireClick;
    isEditModeRef.current = isEditMode;

    const [snappedPinId, setSnappedPinId] = useState<string | null>(null);
    const [disconnectTarget, setDisconnectTarget] = useState<{ wireId: string; end: 'start' | 'end' } | null>(null);
    const [isInteracting, setIsInteracting] = useState(false);

    const registerWireGroup = useCallback((el: SVGGElement | null) => {
        if (!el) return;
        const wireId = el.dataset.wireId;
        if (!wireId) return;
        wireGroupElsRef.current.set(wireId, el);
        domQueryCacheRef.current.delete(wireId);
    }, []);

    const registerHandleGroup = useCallback((el: SVGGElement | null) => {
        if (!el) return;
        const wireId = el.dataset.wireHandleId;
        if (!wireId) return;
        handleGroupElsRef.current.set(wireId, el);
        domQueryCacheRef.current.delete(wireId);
    }, []);

    const stopPhysicsLoop = useCallback(() => {
        if (rafIdRef.current !== null) {
            globalThis.cancelAnimationFrame(rafIdRef.current);
            rafIdRef.current = null;
        }
    }, []);

    const ensurePhysicsLoop = useCallback(() => {
        const engine = engineRef.current;
        if (!isEditModeRef.current || !engine || !engine.hasAwakeWires() || rafIdRef.current !== null) {
            return;
        }

        let lastTs = performance.now();
        const tick = (ts: number) => {
            const currentEngine = engineRef.current;
            if (!isEditModeRef.current || !currentEngine) {
                rafIdRef.current = null;
                return;
            }

            const dtScale = Math.min(1.8, Math.max(0.4, (ts - lastTs) / 16.67));
            lastTs = ts;
            const steppedIds = currentEngine.step(dtScale);

            for (const wireId of steppedIds) {
                const geom = currentEngine.getWireGeometry(wireId);
                if (geom) {
                    applyGeometryToElements(
                        wireGroupElsRef.current.get(wireId),
                        handleGroupElsRef.current.get(wireId),
                        domQueryCacheRef.current,
                        wireId,
                        geom,
                    );
                }
            }

            if (currentEngine.hasAwakeWires()) {
                rafIdRef.current = globalThis.requestAnimationFrame(tick);
            } else {
                rafIdRef.current = null;
            }
        };

        rafIdRef.current = globalThis.requestAnimationFrame(tick);
    }, []);

    const scheduleClearSuppressClick = useCallback((wireId: string) => {
        suppressClickWireIdRef.current = wireId;
        if (suppressTimerRef.current !== null) {
            globalThis.clearTimeout(suppressTimerRef.current);
        }
        suppressTimerRef.current = globalThis.setTimeout(() => {
            if (suppressClickWireIdRef.current === wireId) {
                suppressClickWireIdRef.current = null;
            }
            suppressTimerRef.current = null;
        }, 160);
    }, []);

    const effectProjectKeyRef = useRef<string | undefined>(projectKey);

    if (prevProjectKeyRef.current !== projectKey) {
        prevProjectKeyRef.current = projectKey;
        stopPhysicsLoop();
        engineRef.current?.clear();
        domQueryCacheRef.current.clear();
        activeDragRef.current = null;
        suppressClickWireIdRef.current = null;
    }

    useEffect(() => {
        return () => {
            stopPhysicsLoop();
            if (suppressTimerRef.current !== null) {
                globalThis.clearTimeout(suppressTimerRef.current);
            }
        };
    }, [stopPhysicsLoop]);

    useEffect(() => {
        if (effectProjectKeyRef.current === projectKey) return;
        effectProjectKeyRef.current = projectKey;
        setSnappedPinId(null);
        setDisconnectTarget(null);
        setIsInteracting(false);
    }, [projectKey]);

    // Pause physics completely while simulation is running (!isEditMode)
    useEffect(() => {
        if (!isEditMode) {
            stopPhysicsLoop();
            if (activeDragRef.current) {
                const drag = activeDragRef.current;
                if (drag.kind === 'body') {
                    engineRef.current?.releaseGrab(drag.wireId);
                } else {
                    engineRef.current?.reattachEndpoint(drag.wireId);
                }
                activeDragRef.current = null;
                setSnappedPinId(null);
                setDisconnectTarget(null);
                setIsInteracting(false);
            }
            return;
        }
        if (engineRef.current?.hasAwakeWires()) {
            ensurePhysicsLoop();
        }
    }, [ensurePhysicsLoop, isEditMode, stopPhysicsLoop]);

    // Sync physics settings (gravity / slack) and wake loop smoothly in edit mode
    useEffect(() => {
        const engine = engineRef.current;
        if (!engine) return;
        engine.updateSettings(physics);
        if (isEditMode && engine.hasAwakeWires()) {
            ensurePhysicsLoop();
        }
    }, [ensurePhysicsLoop, isEditMode, physics]);

    const connectionIdsKey = useMemo(
        () => (diagram?.connections ?? []).map((c) => c.id).join(','),
        [diagram?.connections],
    );

    // Clear DOM element cache only on structural wire changes (never per drag frame)
    useLayoutEffect(() => {
        domQueryCacheRef.current.clear();
    }, [
        connectionIdsKey,
        disconnectTarget,
        isEditMode,
        physics.realisticRendering,
        projectKey,
        selectedWireId,
        wiringStart,
    ]);

    // Clean stale ropes, push moved endpoints to DOM, and kick physics loop smoothly
    useLayoutEffect(() => {
        const engine = engineRef.current;
        if (!engine) return;

        if (!diagram) {
            engine.clear();
            stopPhysicsLoop();
            return;
        }

        const activeIds = new Set<string>();
        for (const conn of diagram.connections) {
            const start = pinPositions[conn.from];
            const end = pinPositions[conn.to];
            if (!start || !end) continue;

            if (conn.waypoints && conn.waypoints.length > 0 && activeDragRef.current?.wireId !== conn.id) {
                applyGeometryToElements(
                    wireGroupElsRef.current.get(conn.id),
                    handleGroupElsRef.current.get(conn.id),
                    domQueryCacheRef.current,
                    conn.id,
                    {
                        path: buildWaypointPath(start, end, conn.waypoints),
                        start,
                        end,
                        startAngle: 0,
                        endAngle: 180,
                        sleeping: true,
                    },
                );
                continue;
            }

            activeIds.add(conn.id);
            engine.syncWire(conn.id, start, end);
            const geom = engine.getWireGeometry(conn.id);
            if (geom) {
                applyGeometryToElements(
                    wireGroupElsRef.current.get(conn.id),
                    handleGroupElsRef.current.get(conn.id),
                    domQueryCacheRef.current,
                    conn.id,
                    geom,
                );
            }
        }

        engine.removeStaleWires(activeIds);
        for (const cachedId of wireGroupElsRef.current.keys()) {
            if (!activeIds.has(cachedId)) {
                wireGroupElsRef.current.delete(cachedId);
                handleGroupElsRef.current.delete(cachedId);
            }
        }

        if (isEditMode && engine.hasAwakeWires()) {
            ensurePhysicsLoop();
        }
    }, [
        diagram,
        ensurePhysicsLoop,
        isEditMode,
        pinPositions,
        stopPhysicsLoop,
    ]);

    // Cancel wire drag cleanly when pin-to-pin wiring begins
    useEffect(() => {
        if (!wiringStart || !activeDragRef.current) return;
        const drag = activeDragRef.current;
        if (drag.kind === 'body') {
            engineRef.current?.releaseGrab(drag.wireId);
        } else {
            engineRef.current?.reattachEndpoint(drag.wireId);
        }
        activeDragRef.current = null;
        setSnappedPinId(null);
        setDisconnectTarget(null);
        setIsInteracting(false);
    }, [wiringStart]);

    // Global pointer move / up / cancel handler for smooth wire pulling & endpoint replugging
    useEffect(() => {
        if (!isInteracting) return undefined;

        const clientToCanvas = (clientX: number, clientY: number): WirePoint | null => {
            const container = containerRef.current;
            if (!container) return null;
            const rect = container.getBoundingClientRect();
            return {
                x: (clientX - rect.left - panRef.current.x) / zoomRef.current,
                y: (clientY - rect.top - panRef.current.y) / zoomRef.current,
            };
        };

        const cancelActiveDrag = () => {
            const drag = activeDragRef.current;
            const engine = engineRef.current;
            activeDragRef.current = null;
            setIsInteracting(false);
            setSnappedPinId(null);
            setDisconnectTarget(null);
            if (!drag || !engine) return;
            if (drag.kind === 'body') {
                engine.releaseGrab(drag.wireId);
            } else {
                engine.reattachEndpoint(drag.wireId);
            }
            ensurePhysicsLoop();
        };

        const handlePointerMove = (event: PointerEvent) => {
            const drag = activeDragRef.current;
            const engine = engineRef.current;
            if (!drag || !engine) return;

            const distMoved = Math.hypot(
                event.clientX - drag.startClientX,
                event.clientY - drag.startClientY,
            );
            const canvasPt = clientToCanvas(event.clientX, event.clientY);
            if (!canvasPt) return;

            if (drag.kind === 'body') {
                if (!drag.hasDragged) {
                    if (distMoved < DRAG_ACTIVATION_PX) return;
                    drag.hasDragged = true;
                    engine.grabMidSpan(drag.wireId, canvasPt);
                } else {
                    engine.moveGrab(drag.wireId, canvasPt);
                }
                ensurePhysicsLoop();
                return;
            }

            if (!drag.hasDragged) {
                if (distMoved < DRAG_ACTIVATION_PX) return;
                drag.hasDragged = true;
                engine.detachEndpoint(drag.wireId, drag.end, canvasPt);
            }

            const snapCandidate = findMagneticSnapPin(
                canvasPt,
                pinPositionsRef.current,
                drag.oppositePinId,
                MAGNETIC_SNAP_RADIUS,
            );
            const snapPos = snapCandidate ? pinPositionsRef.current[snapCandidate] : null;
            engine.moveDetachedEndpoint(drag.wireId, snapPos ?? canvasPt);
            setSnappedPinId(snapCandidate);

            const originDist = Math.hypot(canvasPt.x - drag.originPoint.x, canvasPt.y - drag.originPoint.y);
            if (!snapCandidate && originDist > DISCONNECT_DRAG_THRESHOLD) {
                setDisconnectTarget({ wireId: drag.wireId, end: drag.end });
            } else {
                setDisconnectTarget(null);
            }
            ensurePhysicsLoop();
        };

        const handlePointerUp = (event: PointerEvent) => {
            const drag = activeDragRef.current;
            const engine = engineRef.current;
            activeDragRef.current = null;
            setIsInteracting(false);
            setSnappedPinId(null);
            setDisconnectTarget(null);

            if (!drag || !engine) return;

            if (drag.kind === 'body') {
                if (drag.hasDragged) {
                    scheduleClearSuppressClick(drag.wireId);
                    engine.releaseGrab(drag.wireId);
                    ensurePhysicsLoop();
                }
                return;
            }

            if (!drag.hasDragged) {
                return;
            }

            scheduleClearSuppressClick(drag.wireId);
            const canvasPt = clientToCanvas(event.clientX, event.clientY);
            const snapCandidate = canvasPt
                ? findMagneticSnapPin(
                    canvasPt,
                    pinPositionsRef.current,
                    drag.oppositePinId,
                    MAGNETIC_SNAP_RADIUS,
                )
                : null;

            const currentDiagram = diagramRef.current;
            const changeHandler = onDiagramChangeRef.current;

            if (snapCandidate && currentDiagram && changeHandler) {
                const updatedConnections = currentDiagram.connections.map((conn) => {
                    if (conn.id !== drag.wireId) return conn;
                    const nextFrom = drag.end === 'start' ? snapCandidate : conn.from;
                    const nextTo = drag.end === 'end' ? snapCandidate : conn.to;
                    const routeHints = getConnectionRouteHints(currentDiagram, nextFrom, nextTo);
                    return {
                        ...conn,
                        from: nextFrom,
                        to: nextTo,
                        waypoints: undefined,
                        routeHints: routeHints.length > 0 ? routeHints : undefined,
                    };
                });
                engine.reattachEndpoint(drag.wireId);
                changeHandler({ ...currentDiagram, connections: updatedConnections });
                ensurePhysicsLoop();
                return;
            }

            if (
                canvasPt
                && Math.hypot(canvasPt.x - drag.originPoint.x, canvasPt.y - drag.originPoint.y) > DISCONNECT_DRAG_THRESHOLD
                && currentDiagram
                && changeHandler
            ) {
                changeHandler(removeWire(currentDiagram, drag.wireId));
                return;
            }

            engine.reattachEndpoint(drag.wireId);
            ensurePhysicsLoop();
        };

        globalThis.addEventListener('pointermove', handlePointerMove);
        globalThis.addEventListener('pointerup', handlePointerUp);
        globalThis.addEventListener('pointercancel', cancelActiveDrag);
        return () => {
            globalThis.removeEventListener('pointermove', handlePointerMove);
            globalThis.removeEventListener('pointerup', handlePointerUp);
            globalThis.removeEventListener('pointercancel', cancelActiveDrag);
        };
    }, [containerRef, diagramRef, ensurePhysicsLoop, isInteracting, scheduleClearSuppressClick]);

    // Compute magnetic snap candidate for live in-progress pin wiring
    const newWireSnapPinId = useMemo(() => {
        if (!wiringStart || !pinPositions[wiringStart]) return null;
        const pointerCanvas: WirePoint = {
            x: (mousePos.x - pan.x) / zoom,
            y: (mousePos.y - pan.y) / zoom,
        };
        return findMagneticSnapPin(pointerCanvas, pinPositions, wiringStart, MAGNETIC_SNAP_RADIUS);
    }, [mousePos.x, mousePos.y, pan.x, pan.y, pinPositions, wiringStart, zoom]);

    const readyConnectionsKey = useMemo(
        () => (diagram?.connections ?? [])
            .filter((c) => Boolean(pinPositions[c.from] && pinPositions[c.to]))
            .map((c) => `${c.id}:${c.from}:${c.to}:${c.color}:${c.waypoints?.length ?? 0}`)
            .join('|'),
        [diagram?.connections, pinPositions],
    );

    const { staticWires, wireEndpointHandles } = useMemo(() => {
        const connections = diagram?.connections;
        if (!connections) {
            return { staticWires: [] as React.ReactNode[], wireEndpointHandles: [] as React.ReactNode[] };
        }
        const livePins = pinPositionsRef.current;
        const engine = engineRef.current;
        const wireElements: React.ReactNode[] = [];
        const handleElements: React.ReactNode[] = [];

        for (const conn of connections) {
            const { id, from, to, color, waypoints } = conn;
            const start = livePins[from];
            const end = livePins[to];
            if (!start || !end) continue;

            const hasWaypoints = Boolean(waypoints && waypoints.length > 0);
            let geom: WireGeometry;
            if (hasWaypoints && waypoints) {
                geom = {
                    path: buildWaypointPath(start, end, waypoints),
                    start,
                    end,
                    startAngle: 0,
                    endAngle: 180,
                    sleeping: true,
                };
            } else {
                engine?.syncWire(id, start, end);
                geom = engine?.getWireGeometry(id) ?? computeStaticWireGeometry(start, end, physics);
            }

            const isSelected = id === selectedWireId;
            const isDisconnecting = disconnectTarget?.wireId === id;
            const appearance = resolveWireAppearance(isDisconnecting ? '#f43f5e' : color);
            const baseWidth = isSelected ? physics.thickness + 0.8 : physics.thickness;
            const specularOffset = -Math.max(0.6, baseWidth * 0.22);
            const canEditWires = isEditMode && !wiringStart;

            const handleDeleteWire = (e: React.MouseEvent) => {
                e.stopPropagation();
                if (isEditMode && onDiagramChangeRef.current && diagramRef.current) {
                    onDiagramChangeRef.current(removeWire(diagramRef.current, id));
                }
            };

            const handleWireClick = (e: React.MouseEvent) => {
                if (suppressClickWireIdRef.current === id) {
                    suppressClickWireIdRef.current = null;
                    e.stopPropagation();
                    return;
                }
                if (isEditMode && onWireClickRef.current) {
                    onWireClickRef.current(e, id);
                }
            };

            const handleBodyPointerDown = (e: React.PointerEvent) => {
                if (!canEditWires || hasWaypoints || e.button !== 0) return;
                e.stopPropagation();
                const currentStart = pinPositionsRef.current[from];
                const currentEnd = pinPositionsRef.current[to];
                if (engine && !engine.hasWire(id) && currentStart && currentEnd) {
                    engine.syncWire(id, currentStart, currentEnd);
                }
                activeDragRef.current = {
                    kind: 'body',
                    wireId: id,
                    startClientX: e.clientX,
                    startClientY: e.clientY,
                    hasDragged: false,
                };
                setIsInteracting(true);
            };

            const handleEndpointPointerDown = (
                e: React.PointerEvent,
                endKind: 'start' | 'end',
            ) => {
                if (!canEditWires || e.button !== 0) return;
                e.stopPropagation();
                const currentStart = pinPositionsRef.current[from] ?? start;
                const currentEnd = pinPositionsRef.current[to] ?? end;
                if (engine && !engine.hasWire(id)) {
                    engine.syncWire(id, currentStart, currentEnd);
                }
                activeDragRef.current = {
                    kind: 'endpoint',
                    wireId: id,
                    end: endKind,
                    oppositePinId: endKind === 'start' ? to : from,
                    originPoint: endKind === 'start'
                        ? { x: currentStart.x, y: currentStart.y }
                        : { x: currentEnd.x, y: currentEnd.y },
                    startClientX: e.clientX,
                    startClientY: e.clientY,
                    hasDragged: false,
                };
                setIsInteracting(true);
            };

            const bodyInteractionProps = canEditWires
                ? {
                    style: { pointerEvents: 'stroke' as const },
                    className: 'cursor-grab active:cursor-grabbing',
                    onPointerDown: handleBodyPointerDown,
                    onClick: handleWireClick,
                    onDoubleClick: handleDeleteWire,
                }
                : { style: { pointerEvents: 'none' as const } };

            const scopedKeyPrefix = projectKey ?? 'default';

            wireElements.push(
                <g key={`${scopedKeyPrefix}:${id}`} data-wire-id={id} ref={registerWireGroup} opacity={physics.opacity}>
                    {isSelected && (
                        <path
                            data-wire-path="halo"
                            d={geom.path}
                            stroke={appearance.collar}
                            strokeOpacity={0.38}
                            strokeWidth={baseWidth + 5.2}
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    )}

                    {physics.realisticRendering ? (
                        <>
                            <path
                                data-wire-path="drop-shadow"
                                d={geom.path}
                                transform="translate(0, 3.2)"
                                stroke="rgba(0,0,0,0.32)"
                                strokeWidth={baseWidth + 2.2}
                                fill="none"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                            <path
                                data-wire-path="casing"
                                d={geom.path}
                                stroke={appearance.outline}
                                strokeWidth={baseWidth + 1.8}
                                fill="none"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                            <path
                                data-wire-path="core"
                                d={geom.path}
                                stroke={appearance.jacket}
                                strokeWidth={baseWidth}
                                strokeDasharray={isDisconnecting ? '6,4' : undefined}
                                fill="none"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                {...bodyInteractionProps}
                            />
                            <path
                                data-wire-path="specular"
                                d={geom.path}
                                transform={`translate(0, ${specularOffset})`}
                                stroke={appearance.highlight}
                                strokeWidth={Math.max(0.95, baseWidth * 0.26)}
                                fill="none"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                style={{ pointerEvents: 'none' }}
                            />
                        </>
                    ) : (
                        <>
                            <path
                                data-wire-path="shadow"
                                d={geom.path}
                                stroke="rgba(0,0,0,0.3)"
                                strokeWidth={baseWidth + 1.8}
                                fill="none"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                            <path
                                data-wire-path="core"
                                d={geom.path}
                                stroke={appearance.jacket}
                                strokeWidth={baseWidth}
                                strokeDasharray={isDisconnecting ? '6,4' : undefined}
                                fill="none"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                {...bodyInteractionProps}
                            />
                        </>
                    )}

                    {/* Invisible wide hitbox — only mounted in edit mode */}
                    {canEditWires && (
                        <path
                            data-wire-path="hitbox"
                            d={geom.path}
                            stroke="transparent"
                            strokeWidth={Math.max(11, baseWidth + 7)}
                            fill="none"
                            strokeLinecap="round"
                            {...bodyInteractionProps}
                        />
                    )}

                    {/* Detailed jumper connector boots rendered cleanly under PinOverlay */}
                    {(['start', 'end'] as const).map((endKind) => {
                        const pt = endKind === 'start' ? geom.start : geom.end;
                        const angle = endKind === 'start' ? geom.startAngle : geom.endAngle;
                        const isDanglingDisconnect = isDisconnecting && disconnectTarget?.end === endKind;
                        return (
                            <g
                                key={endKind}
                                data-wire-boot={endKind}
                                transform={`translate(${pt.x}, ${pt.y}) rotate(${angle})`}
                                style={{ pointerEvents: 'none' }}
                            >
                                {physics.realisticRendering ? (
                                    <>
                                        {/* Metallic header socket seat */}
                                        <circle
                                            cx={0}
                                            cy={0}
                                            r={4.1}
                                            fill={isDanglingDisconnect ? '#f43f5e' : '#111827'}
                                            stroke="rgba(255,255,255,0.28)"
                                            strokeWidth={0.85}
                                        />
                                        <circle cx={0} cy={0} r={1.6} fill="#d4d4d8" />
                                        {/* Matte dark molded jumper housing */}
                                        <rect
                                            x={-1}
                                            y={-3.1}
                                            width={9.8}
                                            height={6.2}
                                            rx={1.6}
                                            fill={isDanglingDisconnect ? '#881337' : '#18181b'}
                                            stroke="#09090b"
                                            strokeWidth={0.9}
                                        />
                                        {/* Top housing edge highlight */}
                                        <line
                                            x1={0.5}
                                            y1={-2.1}
                                            x2={5.5}
                                            y2={-2.1}
                                            stroke="rgba(255,255,255,0.22)"
                                            strokeWidth={0.8}
                                            strokeLinecap="round"
                                        />
                                        {/* Color-coded strain relief collar */}
                                        <rect
                                            x={5.8}
                                            y={-2.4}
                                            width={2.8}
                                            height={4.8}
                                            rx={0.8}
                                            fill={appearance.collar}
                                        />
                                    </>
                                ) : (
                                    <circle
                                        cx={0}
                                        cy={0}
                                        r={isSelected ? 4 : 3.2}
                                        fill={appearance.jacket}
                                        opacity={0.9}
                                    />
                                )}
                                {isDanglingDisconnect && (
                                    <g transform={`rotate(${-angle}) translate(0, -14)`}>
                                        <circle r={7} fill="#f43f5e" stroke="#fff1f2" strokeWidth={1.2} />
                                        <path
                                            d="M -2.5 -2.5 L 2.5 2.5 M 2.5 -2.5 L -2.5 2.5"
                                            stroke="#ffffff"
                                            strokeWidth={1.5}
                                            strokeLinecap="round"
                                        />
                                    </g>
                                )}
                            </g>
                        );
                    })}
                </g>,
            );

            // Interactive endpoint grip handles — rendered AFTER PinOverlay so they never fight pin hitboxes
            if (canEditWires) {
                handleElements.push(
                    <g key={`handle-${scopedKeyPrefix}-${id}`} data-wire-handle-id={id} ref={registerHandleGroup}>
                        {(['start', 'end'] as const).map((endKind) => {
                            const pt = endKind === 'start' ? geom.start : geom.end;
                            const angle = endKind === 'start' ? geom.startAngle : geom.endAngle;
                            return (
                                <g
                                    key={endKind}
                                    data-wire-boot={endKind}
                                    transform={`translate(${pt.x}, ${pt.y}) rotate(${angle})`}
                                    className="cursor-grab active:cursor-grabbing"
                                    style={{ pointerEvents: 'all' }}
                                    onPointerDown={(e) => handleEndpointPointerDown(e, endKind)}
                                >
                                    <circle
                                        cx={isSelected ? 5 : 9}
                                        cy={0}
                                        r={isSelected ? 8.5 : 7}
                                        fill="transparent"
                                    />
                                </g>
                            );
                        })}
                    </g>,
                );
            }
        }

        return { staticWires: wireElements, wireEndpointHandles: handleElements };
    }, [
        diagram?.connections,
        diagramRef,
        disconnectTarget,
        isEditMode,
        physics,
        projectKey,
        readyConnectionsKey,
        registerHandleGroup,
        registerWireGroup,
        selectedWireId,
        wiringStart,
    ]);

    // Temporary follow wire while drawing a new connection (isolated from main wire list)
    const tempWire = useMemo(() => {
        if (!wiringStart || !pinPositions[wiringStart]) return null;
        const start = pinPositions[wiringStart];
        const rawEnd: PinPosition = {
            x: (mousePos.x - pan.x) / zoom,
            y: (mousePos.y - pan.y) / zoom,
        };
        const snappedPos = newWireSnapPinId ? pinPositions[newWireSnapPinId] : null;
        const previewEnd = snappedPos ?? rawEnd;
        const tempPath = buildTempCatenaryPath(start, previewEnd);
        const tempAppearance = resolveWireAppearance(wireColor);

        return (
            <g key="temp-wire" opacity={physics.opacity}>
                <path
                    d={tempPath}
                    stroke={tempAppearance.outline}
                    strokeWidth={physics.thickness + 1.8}
                    fill="none"
                    strokeLinecap="round"
                />
                <path
                    d={tempPath}
                    stroke={tempAppearance.jacket}
                    strokeWidth={physics.thickness}
                    strokeDasharray={snappedPos ? undefined : '8,4'}
                    fill="none"
                    strokeLinecap="round"
                    opacity={snappedPos ? 0.98 : 0.85}
                />
                <circle
                    cx={start.x}
                    cy={start.y}
                    r={4.2}
                    fill={tempAppearance.collar}
                    stroke="#09090b"
                    strokeWidth={1}
                />
                <circle
                    cx={previewEnd.x}
                    cy={previewEnd.y}
                    r={snappedPos ? 5.2 : 3.5}
                    fill={snappedPos ? tempAppearance.collar : 'white'}
                    stroke={snappedPos ? '#e0f2fe' : undefined}
                    strokeWidth={snappedPos ? 1.5 : 0}
                    opacity={snappedPos ? 1 : 0.65}
                />
            </g>
        );
    }, [mousePos.x, mousePos.y, newWireSnapPinId, pan.x, pan.y, physics, pinPositions, wireColor, wiringStart, zoom]);

    const wires = useMemo(
        () => (tempWire ? [...staticWires, tempWire] : staticWires),
        [staticWires, tempWire],
    );

    return {
        wires,
        wireEndpointHandles,
        snappedPinId: newWireSnapPinId ?? snappedPinId,
        isInteracting,
    };
}
