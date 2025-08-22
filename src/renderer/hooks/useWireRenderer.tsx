/**
 * useWireRenderer
 * Builds SVG wire elements from diagram connections using catenary physics or waypoints.
 */
import React, { useMemo, useRef } from 'react';
import type { WokwiDiagram, PinPosition } from '../types/wokwi.types';
import { buildCatenaryPath, buildTempCatenaryPath } from '../utils/catenary';

interface UseWireRendererParams {
    diagram?: WokwiDiagram;
    pinPositions: Record<string, PinPosition>;
    wiringStart: string | null;
    mousePos: { x: number; y: number };
    pan: { x: number; y: number };
    zoom: number;
    isEditMode: boolean;
    wireColor: string;
    /** ID of the currently selected wire — renders a highlight ring around it */
    selectedWireId?: string | null;
    diagramRef: React.RefObject<WokwiDiagram | undefined>;
    onDiagramChange?: (newDiagram: WokwiDiagram) => void;
    onWireClick?: (e: React.MouseEvent, connId: string) => void;
}

function buildWirePath(
    start: PinPosition,
    end: PinPosition,
    waypoints?: Array<{ x: number; y: number }>,
): string {
    if (!waypoints || waypoints.length === 0) {
        return buildCatenaryPath(start, end);
    }

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

export function useWireRenderer({
    diagram,
    pinPositions,
    wiringStart,
    mousePos,
    pan,
    zoom,
    isEditMode,
    wireColor,
    selectedWireId,
    diagramRef,
    onDiagramChange,
    onWireClick,
}: UseWireRendererParams): React.ReactNode[] {
    const pathCacheRef = useRef<Record<string, { signature: string; path: string }>>({});

    return useMemo(() => {
        if (!diagram) return [];
        const nextCache: Record<string, { signature: string; path: string }> = {};

        const drawnWires = diagram.connections.map((conn) => {
            const { id, from, to, color, waypoints } = conn;
            const start = pinPositions[from];
            const end = pinPositions[to];

            if (!start || !end) return null;

            const signature = JSON.stringify({
                startX: start.x,
                startY: start.y,
                endX: end.x,
                endY: end.y,
                waypoints: waypoints ?? [],
            });
            const cached = pathCacheRef.current[id];
            const path = cached?.signature === signature
                ? cached.path
                : buildWirePath(start, end, waypoints);
            nextCache[id] = { signature, path };

            const isSelected = id === selectedWireId;

            const handleDeleteWire = (e: React.MouseEvent) => {
                e.stopPropagation();
                if (isEditMode && onDiagramChange && diagramRef.current) {
                    onDiagramChange(removeWire(diagramRef.current, id));
                }
            };

            const handleWireClick = (e: React.MouseEvent) => {
                if (isEditMode && onWireClick) {
                    onWireClick(e, id);
                }
            };

            const wireStrokeColor = color || 'green';

            return (
                <g key={id}>
                    {/* Selection glow — rendered below the wire when selected */}
                    {isSelected && (
                        <path
                            d={path}
                            stroke="rgba(255,255,255,0.55)"
                            strokeWidth="9"
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={{ filter: 'blur(2px)' }}
                        />
                    )}
                    {/* Shadow / thickness illusion */}
                    <path
                        d={path}
                        stroke="rgba(0,0,0,0.3)"
                        strokeWidth="5"
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                    {/* Main cable */}
                    <path
                        d={path}
                        stroke={wireStrokeColor}
                        strokeWidth={isSelected ? 4 : 3}
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={isEditMode ? 'cursor-pointer' : ''}
                        style={{
                            pointerEvents: isEditMode ? 'stroke' : 'none',
                            filter: isSelected
                                ? `drop-shadow(0 0 4px ${wireStrokeColor})`
                                : 'drop-shadow(0 1px 1px rgba(0,0,0,0.2))',
                        }}
                        onClick={handleWireClick}
                        onDoubleClick={handleDeleteWire}
                    />
                    {/* Highlight on hover (thicker invisible hitbox) */}
                    <path
                        d={path}
                        stroke="transparent"
                        strokeWidth="12"
                        fill="none"
                        strokeLinecap="round"
                        style={{ pointerEvents: isEditMode ? 'stroke' : 'none', cursor: 'pointer' }}
                        onClick={handleWireClick}
                        onDoubleClick={handleDeleteWire}
                    />
                    {/* Connector jack dots at endpoints */}
                    <circle cx={start.x} cy={start.y} r={isSelected ? 4 : 3} fill={wireStrokeColor} opacity={0.8} />
                    <circle cx={end.x} cy={end.y} r={isSelected ? 4 : 3} fill={wireStrokeColor} opacity={0.8} />
                </g>
            );
        });

        // Add temporary follow wire while drawing
        if (wiringStart && pinPositions[wiringStart]) {
            const start = pinPositions[wiringStart];
            const end = { x: (mousePos.x - pan.x) / zoom, y: (mousePos.y - pan.y) / zoom };

            const tempPath = buildTempCatenaryPath(start, end);

            drawnWires.push(
                <g key="temp-wire">
                    <path
                        d={tempPath}
                        stroke="rgba(255,255,255,0.15)"
                        strokeWidth="5"
                        fill="none"
                        strokeLinecap="round"
                    />
                    <path
                        d={tempPath}
                        stroke={wireColor}
                        strokeWidth="3"
                        strokeDasharray="8,4"
                        fill="none"
                        strokeLinecap="round"
                        opacity={0.8}
                    />
                    <circle cx={start.x} cy={start.y} r={4} fill={wireColor} />
                    <circle cx={end.x} cy={end.y} r={3} fill="white" opacity={0.5} />
                </g>
            );
        }

        pathCacheRef.current = nextCache;

        return drawnWires;
    }, [diagram, pinPositions, wiringStart, mousePos, pan, zoom, isEditMode, onDiagramChange, wireColor, selectedWireId, diagramRef]);
}
