/**
 * useWireRenderer
 * Builds SVG wire elements from diagram connections using catenary physics or waypoints.
 */
import React, { useMemo } from 'react';
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
    diagramRef: React.RefObject<WokwiDiagram | undefined>;
    onDiagramChange?: (newDiagram: WokwiDiagram) => void;
    onWireClick?: (e: React.MouseEvent, connId: string) => void;
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
    diagramRef,
    onDiagramChange,
    onWireClick,
}: UseWireRendererParams): React.ReactNode[] {
    return useMemo(() => {
        if (!diagram) return [];

        const drawnWires = diagram.connections.map((conn) => {
            const { id, from, to, color, waypoints } = conn;
            const start = pinPositions[from];
            const end = pinPositions[to];

            if (!start || !end) return null;

            let path = '';
            if (waypoints && waypoints.length > 0) {
                path = `M ${start.x} ${start.y}`;
                waypoints.forEach(wp => {
                    path += ` L ${wp.x} ${wp.y}`;
                });
                path += ` L ${end.x} ${end.y}`;
            } else {
                path = buildCatenaryPath(start, end);
            }

            const handleDeleteWire = (e: React.MouseEvent) => {
                e.stopPropagation();
                if (isEditMode && onDiagramChange && diagramRef.current) {
                    const newConnections = diagramRef.current.connections.filter(c => c.id !== id);
                    onDiagramChange({ ...diagramRef.current, connections: newConnections });
                }
            };

            const handleWireClick = (e: React.MouseEvent) => {
                if (isEditMode && onWireClick) {
                    onWireClick(e, id);
                }
            };

            return (
                <g key={id}>
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
                        stroke={color || 'green'}
                        strokeWidth="3"
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={isEditMode ? 'cursor-pointer' : ''}
                        style={{
                            pointerEvents: isEditMode ? 'stroke' : 'none',
                            filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.2))',
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
                    <circle cx={start.x} cy={start.y} r={3} fill={color || 'green'} opacity={0.8} />
                    <circle cx={end.x} cy={end.y} r={3} fill={color || 'green'} opacity={0.8} />
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

        return drawnWires;
    }, [diagram, pinPositions, wiringStart, mousePos, pan, zoom, isEditMode, onDiagramChange, wireColor, diagramRef]);
}
