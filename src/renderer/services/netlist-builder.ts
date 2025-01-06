/**
 * Netlist Builder
 * Transforms a WokwiDiagram into a flat list of resolved logical connections
 * that can be consumed by avr8js simulation services.
 */
import type { WokwiDiagram, WokwiConnection } from '../types/wokwi.types';

export interface NetlistEntry {
    arduinoPin: string;
    componentId: string;
    componentType: string;
    componentPin: string;
    connectionId: string;
}

/**
 * Builds a netlist from a V2 diagram.
 * Each entry maps an Arduino pin to a component pin with full traceability.
 */
export function buildNetlist(diagram: WokwiDiagram): NetlistEntry[] {
    const netlist: NetlistEntry[] = [];

    // Identify the Arduino part (uno, mega, nano)
    const arduinoPart = diagram.parts.find(p =>
        p.type.startsWith('wokwi-arduino-')
    );
    if (!arduinoPart) return netlist;
    const arduinoId = arduinoPart.id;

    // Part type lookup
    const partTypeMap = new Map(diagram.parts.map(p => [p.id, p.type]));

    for (const conn of diagram.connections) {
        const resolved = resolveConnection(conn, arduinoId, partTypeMap);
        if (resolved) {
            netlist.push(resolved);
        }
    }

    return netlist;
}

/**
 * Resolves a single connection into a NetlistEntry, determining
 * which side is the Arduino and which is the component.
 */
function resolveConnection(
    conn: WokwiConnection,
    arduinoId: string,
    partTypeMap: Map<string, string>,
): NetlistEntry | null {
    const [fromPartId, fromPin] = conn.from.split(':');
    const [toPartId, toPin] = conn.to.split(':');

    let arduinoPin: string | null = null;
    let componentId: string | null = null;
    let componentPin: string | null = null;

    if (fromPartId === arduinoId) {
        arduinoPin = fromPin;
        componentId = toPartId;
        componentPin = toPin;
    } else if (toPartId === arduinoId) {
        arduinoPin = toPin;
        componentId = fromPartId;
        componentPin = fromPin;
    }

    if (!arduinoPin || !componentId || !componentPin) return null;

    const componentType = partTypeMap.get(componentId);
    if (!componentType) return null;

    return {
        arduinoPin,
        componentId,
        componentType,
        componentPin,
        connectionId: conn.id,
    };
}
