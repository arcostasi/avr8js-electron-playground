/**
 * Wokwi Types
 * Shared type definitions for the Wokwi simulator components.
 *
 * Schema V2: connections are typed objects (not tuples).
 * V1 compatibility is maintained via migrateV1toV2().
 */

// ── Diagram Model (V1 — legacy) ──

export interface WokwiPartV1 {
    id: string;
    type: string;
    top: number;
    left: number;
    rotate?: number;
    attrs?: Record<string, string>;
    hide?: boolean;
}

export interface WokwiDiagramV1 {
    version: number;
    author?: string;
    editor?: string;
    parts: WokwiPartV1[];
    connections: [string, string, string, string[]][];
}

// ── Diagram Model (V2 — current) ──

export interface WokwiPart {
    id: string;
    type: string;
    top: number;
    left: number;
    rotate: number;
    attrs?: Record<string, string>;
    hide?: boolean;
}

export interface WireWaypoint {
    x: number;
    y: number;
}

export interface WokwiConnection {
    id: string;
    from: string;
    to: string;
    color: string;
    waypoints?: WireWaypoint[];
    routeHints?: string[];
}

export interface WokwiDiagram {
    version: 2;
    author?: string;
    editor: string;
    parts: WokwiPart[];
    connections: WokwiConnection[];
}

// ── V1 → V2 Migration ──

/**
 * Transparently migrates a V1 diagram to V2.
 * Called by the project loader when reading old diagram.json files.
 */
export function migrateV1toV2(diagram: WokwiDiagramV1): WokwiDiagram {
    return {
        version: 2,
        author: diagram.author,
        editor: diagram.editor ?? 'avr8js-electron-playground',
        parts: diagram.parts.map(p => ({
            ...p,
            rotate: p.rotate ?? 0,
        })),
        connections: diagram.connections.map((conn, idx) => ({
            id: `conn-${idx}`,
            from: conn[0],
            to: conn[1],
            color: conn[2],
            routeHints: conn[3]?.length > 0 ? conn[3] : undefined,
        })),
    };
}

/**
 * Parses a raw JSON object into a WokwiDiagram (V2).
 * Automatically handles V1 migration.
 */
export function parseDiagram(raw: Record<string, unknown>): WokwiDiagram {
    if (raw.version === 2) {
        return raw as unknown as WokwiDiagram;
    }
    return migrateV1toV2(raw as unknown as WokwiDiagramV1);
}

// ── Component Catalog ──

export interface WokwiComponentDef {
    type: string;
    label: string;
    attrs?: Record<string, string>;
}

// ── Pin Positions ──

export interface PinPosition {
    x: number;
    y: number;
    /** Canvas-space exit unit vector (away from the component face). */
    ex?: number;
    ey?: number;
}

export interface PinInfo {
    name: string;
    x: number;
    y: number;
}

// ── Hardware Controllers ──

export interface HardwareController {
    element: HTMLElement;
    update: () => unknown;
    type: string;
}

// ── Component Props ──

export interface WokwiSimulatorProps {
    diagram?: WokwiDiagram;
    hex?: string | null;
    customChipArtifacts?: Record<string, string>;
    customChipManifests?: Record<string, {
        chipName: string;
        title: string;
        pins: string[];
        controls: Array<{
            key: string;
            label: string;
            min: number;
            max: number;
            step: number;
            unit: string;
            defaultValue: number;
        }>;
    }>;
    isCompiling: boolean;
    onCompile: () => void;
    onSerialOutput: (text: string, usartId?: string) => void;
    onChipOutput?: (text: string) => void;
    onAddComponent?: (part: WokwiPart) => void;
    onDiagramChange?: (newDiagram: WokwiDiagram) => void;
    serialWriteRef?: { current: ((text: string, usartId?: string) => void) | null };
    /** Undo/redo passthrough from the parent diagram state manager */
    onUndo?: () => void;
    onRedo?: () => void;
    canUndo?: boolean;
    canRedo?: boolean;
    /** Default colour of new wires (from settings) */
    defaultWireColor?: string;
    /** Whether to show pin-name tooltip on hover in edit mode */
    showPinTooltips?: boolean;
}
