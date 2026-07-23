import type { PinInfo, WokwiDiagram } from '../types/wokwi.types';

export type PartSide = 'top' | 'right' | 'bottom' | 'left';
export type ControlOrientation = 'horizontal' | 'vertical';

export interface RotateHandlePosition {
    x: number;
    y: number;
    side: PartSide;
    effectiveSide: PartSide;
    orientation: ControlOrientation;
}

const EDGE_THRESHOLD = 0.22;
const SIDE_PRIORITY: PartSide[] = ['top', 'right', 'left', 'bottom'];
const SIDE_CLOCKWISE: PartSide[] = ['top', 'right', 'bottom', 'left'];

export function getEffectiveSide(side: PartSide, rotate = 0): PartSide {
    const steps = ((Math.round(rotate / 90) % 4) + 4) % 4;
    return SIDE_CLOCKWISE[(SIDE_CLOCKWISE.indexOf(side) + steps) % 4];
}

function rotateLocalPoint(dx: number, dy: number, angleDeg: number): { x: number; y: number } {
    if (!angleDeg) return { x: dx, y: dy };
    const rad = (angleDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return {
        x: dx * cos - dy * sin,
        y: dx * sin + dy * cos,
    };
}

/**
 * Picks the cleanest side of a component for placing floating controls (like Rotate),
 * preferring edges that contain zero pin pads.
 */
export function pickPadFreeSide(
    pins: ReadonlyArray<PinInfo>,
    width: number,
    height: number,
): PartSide {
    const counts: Record<PartSide, number> = {
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
    };

    const safeW = Math.max(1, width);
    const safeH = Math.max(1, height);

    for (const pin of pins) {
        const relX = pin.x / safeW;
        const relY = pin.y / safeH;

        if (relY < EDGE_THRESHOLD) {
            counts.top += 1;
        } else if (relY > 1 - EDGE_THRESHOLD) {
            counts.bottom += 1;
        } else if (relX < EDGE_THRESHOLD) {
            counts.left += 1;
        } else if (relX > 1 - EDGE_THRESHOLD) {
            counts.right += 1;
        }
    }

    let bestSide: PartSide = 'top';
    let bestCount = Infinity;
    for (const side of SIDE_PRIORITY) {
        if (counts[side] === 0) {
            return side;
        }
        if (counts[side] < bestCount) {
            bestCount = counts[side];
            bestSide = side;
        }
    }

    return bestSide;
}

/**
 * Computes canvas-space coordinates for the floating Rotate button along a pad-free edge,
 * accounting for component rotation around `(0, 0)` (`transformOrigin: 'top left'`).
 */
export function computePadFreeRotatePosition(params: {
    left: number;
    top: number;
    width: number;
    height: number;
    rotate?: number;
    pins: ReadonlyArray<PinInfo>;
    margin?: number;
}): RotateHandlePosition {
    const {
        left,
        top,
        width,
        height,
        rotate = 0,
        pins,
        margin = 20,
    } = params;

    const side = pickPadFreeSide(pins, width, height);
    let lx = width / 2;
    let ly = -margin;

    if (side === 'right') {
        lx = width + margin;
        ly = height / 2;
    } else if (side === 'bottom') {
        lx = width / 2;
        ly = height + margin;
    } else if (side === 'left') {
        lx = -margin;
        ly = height / 2;
    }

    const rotated = rotateLocalPoint(lx, ly, rotate);
    const effectiveSide = getEffectiveSide(side, rotate);
    const orientation: ControlOrientation = effectiveSide === 'top' || effectiveSide === 'bottom'
        ? 'horizontal'
        : 'vertical';

    return {
        x: Math.round(left + rotated.x),
        y: Math.round(top + rotated.y),
        side,
        effectiveSide,
        orientation,
    };
}

/**
 * Returns a new diagram with the given part and all connections attached to its pins removed.
 */
export function removePartFromDiagram(diagram: WokwiDiagram, partId: string): WokwiDiagram {
    const pinPrefix = `${partId}:`;
    return {
        ...diagram,
        parts: diagram.parts.filter((part) => part.id !== partId),
        connections: diagram.connections.filter(
            (conn) => !conn.from.startsWith(pinPrefix) && !conn.to.startsWith(pinPrefix),
        ),
    };
}

/**
 * Clones a component in the diagram with a collision-free ID and offset position.
 */
export function duplicatePartInDiagram(
    diagram: WokwiDiagram,
    partId: string,
    offset: { dx: number; dy: number } = { dx: 28, dy: 28 },
): { diagram: WokwiDiagram; duplicatedPartId: string } | null {
    const source = diagram.parts.find((part) => part.id === partId);
    if (!source) {
        return null;
    }

    const match = /^(.*?)(\d+)$/.exec(source.id);
    const prefix = match ? match[1] : source.id;
    let suffix = match ? Number(match[2]) + 1 : 2;
    const usedIds = new Set(diagram.parts.map((part) => part.id));
    while (usedIds.has(`${prefix}${suffix}`)) {
        suffix += 1;
    }

    const duplicatedPartId = `${prefix}${suffix}`;
    const duplicatedPart = {
        ...source,
        id: duplicatedPartId,
        left: Math.round(source.left + offset.dx),
        top: Math.round(source.top + offset.dy),
        ...(source.attrs ? { attrs: { ...source.attrs } } : {}),
    };

    return {
        diagram: {
            ...diagram,
            parts: [...diagram.parts, duplicatedPart],
        },
        duplicatedPartId,
    };
}
