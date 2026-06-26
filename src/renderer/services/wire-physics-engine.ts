import type { PinPosition } from '../types/wokwi.types';

export interface WirePhysicsSettings {
    /** Downward gravity strength (0.0 – 1.5). Default: 0.65 */
    gravity: number;
    /** Cable slack factor (1.0 – 1.75, displayed as 100% – 175%). Default: 1.20 */
    slack: number;
    /** Base wire thickness in px (2.0 – 6.5). Default: 3.6 */
    thickness: number;
    /** Wire opacity (0.25 – 1.0, displayed as 25% – 100%). Default: 1.0 */
    opacity: number;
    /** Enable multi-layer shadows, dark casing outline, glossy highlight, and jumper boots */
    realisticRendering: boolean;
}

export const DEFAULT_WIRE_PHYSICS_SETTINGS: WirePhysicsSettings = {
    gravity: 0.65,
    slack: 1.20,
    thickness: 3.6,
    opacity: 1.0,
    realisticRendering: true,
};

export interface WirePoint {
    x: number;
    y: number;
}

export interface WireEndpoint extends WirePoint {
    ex?: number;
    ey?: number;
}

export interface WireGeometry {
    path: string;
    start: WirePoint;
    end: WirePoint;
    startAngle: number;
    endAngle: number;
    sleeping: boolean;
}

interface VerletNode {
    x: number;
    y: number;
    oldX: number;
    oldY: number;
}

interface WireRopeState {
    id: string;
    start: WireEndpoint;
    end: WireEndpoint;
    nodes: VerletNode[];
    segmentLength: number;
    sleeping: boolean;
    idleFrames: number;
    activeFrames: number;
    grab: { nodeIndex: number; target: WirePoint } | null;
    detached: { end: 'start' | 'end'; target: WirePoint } | null;
}

export const DEFAULT_WIRE_SEGMENTS = 10;
const SUBSTEPS = 2;
const CONSTRAINT_ITERATIONS = 6;
const SUBSTEP_DAMPING = 0.962;
const SETTLE_SUBSTEP_DAMPING = 0.91;
const GRAVITY_SCALE = 1.35;
const MAX_SYNC_VELOCITY = 18;
const SLEEP_EPSILON = 0.08;
const SLEEP_FRAMES_REQUIRED = 10;
const MAX_FREE_ACTIVE_FRAMES = 100;
const DEFAULT_SNAP_RADIUS = 16;

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function roundCoord(value: number): number {
    return Math.round(value * 10) / 10;
}

function sameEndpoint(a: WireEndpoint, b: WireEndpoint): boolean {
    return Math.abs(a.x - b.x) < 0.05
        && Math.abs(a.y - b.y) < 0.05
        && (a.ex ?? 0) === (b.ex ?? 0)
        && (a.ey ?? 0) === (b.ey ?? 0);
}

/**
 * Clamps user-provided wire physics values to safe interactive bounds.
 */
export function clampWirePhysicsSettings(
    raw?: Partial<WirePhysicsSettings> | null,
): WirePhysicsSettings {
    const src = raw ?? {};
    return {
        gravity: typeof src.gravity === 'number' && Number.isFinite(src.gravity)
            ? Math.round(clamp(src.gravity, 0, 1.5) * 20) / 20
            : DEFAULT_WIRE_PHYSICS_SETTINGS.gravity,
        slack: typeof src.slack === 'number' && Number.isFinite(src.slack)
            ? Math.round(clamp(src.slack, 1, 1.75) * 100) / 100
            : DEFAULT_WIRE_PHYSICS_SETTINGS.slack,
        thickness: typeof src.thickness === 'number' && Number.isFinite(src.thickness)
            ? Math.round(clamp(src.thickness, 2, 6.5) * 10) / 10
            : DEFAULT_WIRE_PHYSICS_SETTINGS.thickness,
        opacity: typeof src.opacity === 'number' && Number.isFinite(src.opacity)
            ? Math.round(clamp(src.opacity, 0.25, 1) * 100) / 100
            : DEFAULT_WIRE_PHYSICS_SETTINGS.opacity,
        realisticRendering: typeof src.realisticRendering === 'boolean'
            ? src.realisticRendering
            : DEFAULT_WIRE_PHYSICS_SETTINGS.realisticRendering,
    };
}

function computeRestSegmentLength(
    start: WirePoint,
    end: WirePoint,
    segments: number,
    gravity: number,
    slack: number,
): number {
    const chord = Math.hypot(end.x - start.x, end.y - start.y);
    if (chord < 1) return 2;
    const effectiveSlack = 1 + (slack - 1) * clamp(chord / 75, 0.35, 1);
    const minArc = Math.max(chord * 1.02, chord * effectiveSlack + Math.min(18, gravity * chord * 0.1));
    return minArc / segments;
}

/**
 * Computes a calm, gravity-draped initial curve honoring pin exit tangents.
 * Short spans stay neat while longer spans drape smoothly with realistic weight.
 */
export function computeInitialCatenaryPoints(
    start: WireEndpoint,
    end: WireEndpoint,
    segments = DEFAULT_WIRE_SEGMENTS,
    gravity = DEFAULT_WIRE_PHYSICS_SETTINGS.gravity,
    slack = DEFAULT_WIRE_PHYSICS_SETTINGS.slack,
): WirePoint[] {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dist = Math.hypot(dx, dy);

    if (dist < 1) {
        return Array.from({ length: segments + 1 }, () => ({ x: start.x, y: start.y }));
    }

    const ux = dx / dist;
    const uy = dy / dist;
    const spanFactor = clamp(dist / 100, 0.25, 1);
    const arm = clamp(dist * (0.24 + (slack - 1) * 0.35), 14, 130);
    const droop = clamp((dist * (0.08 + (slack - 1) * 0.55) + gravity * 32) * spanFactor, 0, 150);

    const sx = start.ex ?? ux;
    const sy = start.ey ?? uy;
    const ex = end.ex ?? -ux;
    const ey = end.ey ?? -uy;

    const cp1x = start.x + sx * arm;
    const cp1y = start.y + sy * arm + droop * 0.55;
    const cp2x = end.x + ex * arm;
    const cp2y = end.y + ey * arm + droop * 0.55;

    const points: WirePoint[] = [];
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const inv = 1 - t;
        const bx = inv ** 3 * start.x
            + 3 * inv ** 2 * t * cp1x
            + 3 * inv * t ** 2 * cp2x
            + t ** 3 * end.x;
        const by = inv ** 3 * start.y
            + 3 * inv ** 2 * t * cp1y
            + 3 * inv * t ** 2 * cp2y
            + t ** 3 * end.y
            + Math.sin(Math.PI * t) * droop * 0.3;
        points.push({ x: bx, y: by });
    }
    return points;
}

/**
 * Converts rope points to a smooth Catmull-Rom cubic Bezier SVG path.
 */
export function pointsToSmoothSvgPath(points: ReadonlyArray<WirePoint>): string {
    if (points.length === 0) return '';
    if (points.length === 1) {
        return `M ${roundCoord(points[0].x)} ${roundCoord(points[0].y)}`;
    }
    if (points.length === 2) {
        return `M ${roundCoord(points[0].x)} ${roundCoord(points[0].y)} L ${roundCoord(points[1].x)} ${roundCoord(points[1].y)}`;
    }

    const segments: string[] = [`M ${roundCoord(points[0].x)} ${roundCoord(points[0].y)}`];
    for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[Math.max(0, i - 1)];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[Math.min(points.length - 1, i + 2)];

        const cp1x = roundCoord(p1.x + (p2.x - p0.x) / 6);
        const cp1y = roundCoord(p1.y + (p2.y - p0.y) / 6);
        const cp2x = roundCoord(p2.x - (p3.x - p1.x) / 6);
        const cp2y = roundCoord(p2.y - (p3.y - p1.y) / 6);
        segments.push(`C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${roundCoord(p2.x)} ${roundCoord(p2.y)}`);
    }
    return segments.join(' ');
}

/**
 * Computes static pre-settled wire geometry matching true Verlet physics equilibrium.
 */
export function computeStaticWireGeometry(
    start: WireEndpoint,
    end: WireEndpoint,
    settings: Partial<WirePhysicsSettings> = DEFAULT_WIRE_PHYSICS_SETTINGS,
    segments = DEFAULT_WIRE_SEGMENTS,
): WireGeometry {
    const engine = new WirePhysicsEngine(settings, segments);
    engine.syncWire('static', start, end);
    return engine.getWireGeometry('static')!;
}

/**
 * Returns the closest component pin within `snapRadius` (excluding `excludePinId`), or null.
 */
export function findMagneticSnapPin(
    point: WirePoint,
    pinPositions: Record<string, PinPosition>,
    excludePinId: string | null = null,
    snapRadius = DEFAULT_SNAP_RADIUS,
): string | null {
    let bestPin: string | null = null;
    let bestDistSq = snapRadius * snapRadius;

    for (const [pinId, pin] of Object.entries(pinPositions)) {
        if (pinId === excludePinId) continue;
        const dx = pin.x - point.x;
        const dy = pin.y - point.y;
        const distSq = dx * dx + dy * dy;
        if (distSq <= bestDistSq) {
            bestDistSq = distSq;
            bestPin = pinId;
        }
    }

    return bestPin;
}

/**
 * Computes the angle (degrees) pointing from `anchor` toward `neighbor`.
 */
export function computeEndpointAngle(anchor: WirePoint, neighbor: WirePoint): number {
    const dx = neighbor.x - anchor.x;
    const dy = neighbor.y - anchor.y;
    if (Math.hypot(dx, dy) < 0.01) return 0;
    return Math.round((Math.atan2(dy, dx) * 180) / Math.PI * 10) / 10;
}

/**
 * Isolated Reason Rack / Netoun-inspired Verlet rope engine for jumper wires.
 * Sub-stepped solver delivers lively inertia & gravity response with non-rubbery stiffness,
 * zero-lag pin locking during component movement, and automatic idle CPU suspension.
 */
export class WirePhysicsEngine {
    private settings: WirePhysicsSettings;
    private readonly segments: number;
    private readonly ropes = new Map<string, WireRopeState>();

    constructor(
        initialSettings: Partial<WirePhysicsSettings> = DEFAULT_WIRE_PHYSICS_SETTINGS,
        segments = DEFAULT_WIRE_SEGMENTS,
    ) {
        this.settings = clampWirePhysicsSettings(initialSettings);
        this.segments = Math.max(6, segments);
    }

    public getSettings(): WirePhysicsSettings {
        return { ...this.settings };
    }

    public hasWire(id: string): boolean {
        return this.ropes.has(id);
    }

    public updateSettings(next: Partial<WirePhysicsSettings>): void {
        const clamped = clampWirePhysicsSettings(next);
        const physicsChanged = clamped.gravity !== this.settings.gravity
            || clamped.slack !== this.settings.slack;
        this.settings = clamped;

        if (!physicsChanged) return;

        for (const rope of this.ropes.values()) {
            rope.segmentLength = computeRestSegmentLength(
                rope.nodes[0],
                rope.nodes[rope.nodes.length - 1],
                this.segments,
                clamped.gravity,
                clamped.slack,
            );
            rope.sleeping = false;
            rope.idleFrames = 0;
            rope.activeFrames = 0;
        }
    }

    public syncWire(id: string, start: WireEndpoint, end: WireEndpoint): WireRopeState {
        const existing = this.ropes.get(id);
        if (!existing) {
            const seed = computeInitialCatenaryPoints(
                start,
                end,
                this.segments,
                this.settings.gravity,
                this.settings.slack,
            );
            const rope: WireRopeState = {
                id,
                start: { ...start },
                end: { ...end },
                nodes: seed.map((pt) => ({ x: pt.x, y: pt.y, oldX: pt.x, oldY: pt.y })),
                segmentLength: computeRestSegmentLength(
                    start,
                    end,
                    this.segments,
                    this.settings.gravity,
                    this.settings.slack,
                ),
                sleeping: true,
                idleFrames: SLEEP_FRAMES_REQUIRED,
                activeFrames: 0,
                grab: null,
                detached: null,
            };
            this.settleRopeToEquilibrium(rope);
            this.ropes.set(id, rope);
            return rope;
        }

        // Never overwrite endpoints or segment length while the user is actively pulling this wire
        if (existing.grab || existing.detached) {
            return existing;
        }

        const endpointsChanged = !sameEndpoint(existing.start, start) || !sameEndpoint(existing.end, end);
        existing.start = { ...start };
        existing.end = { ...end };

        if (endpointsChanged) {
            const lastIdx = existing.nodes.length - 1;
            existing.nodes[0].x = start.x;
            existing.nodes[0].y = start.y;
            existing.nodes[0].oldX = start.x;
            existing.nodes[0].oldY = start.y;
            existing.nodes[lastIdx].x = end.x;
            existing.nodes[lastIdx].y = end.y;
            existing.nodes[lastIdx].oldX = end.x;
            existing.nodes[lastIdx].oldY = end.y;
            existing.segmentLength = computeRestSegmentLength(
                existing.nodes[0],
                existing.nodes[lastIdx],
                this.segments,
                this.settings.gravity,
                this.settings.slack,
            );
            // Zero-lag pin lock: keep endpoints glued and propagate smooth constraints without extreme velocity spikes
            this.projectConstraintsOnly(existing, 8);
            for (let i = 1; i < lastIdx; i++) {
                const node = existing.nodes[i];
                const vx = node.x - node.oldX;
                const vy = node.y - node.oldY;
                const speed = Math.hypot(vx, vy);
                if (speed > MAX_SYNC_VELOCITY) {
                    const scale = MAX_SYNC_VELOCITY / speed;
                    node.oldX = node.x - vx * scale;
                    node.oldY = node.y - vy * scale;
                }
            }
            existing.sleeping = false;
            existing.idleFrames = 0;
            existing.activeFrames = 0;
        }

        return existing;
    }

    public removeStaleWires(activeIds: Set<string>): void {
        for (const id of this.ropes.keys()) {
            if (!activeIds.has(id)) {
                this.ropes.delete(id);
            }
        }
    }

    public wakeWire(id: string): void {
        const rope = this.ropes.get(id);
        if (!rope) return;
        rope.sleeping = false;
        rope.idleFrames = 0;
        rope.activeFrames = 0;
    }

    public wakeAll(): void {
        for (const rope of this.ropes.values()) {
            rope.sleeping = false;
            rope.idleFrames = 0;
            rope.activeFrames = 0;
        }
    }

    public isWireSleeping(id: string): boolean {
        return this.ropes.get(id)?.sleeping ?? true;
    }

    public hasAwakeWires(): boolean {
        for (const rope of this.ropes.values()) {
            if (!rope.sleeping) return true;
        }
        return false;
    }

    public grabMidSpan(id: string, point: WirePoint): boolean {
        const rope = this.ropes.get(id);
        if (!rope || rope.nodes.length < 3) return false;

        let bestIdx = 1;
        let bestDistSq = Infinity;
        for (let i = 1; i < rope.nodes.length - 1; i++) {
            const dx = rope.nodes[i].x - point.x;
            const dy = rope.nodes[i].y - point.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < bestDistSq) {
                bestDistSq = d2;
                bestIdx = i;
            }
        }

        rope.grab = { nodeIndex: bestIdx, target: { x: point.x, y: point.y } };
        rope.sleeping = false;
        rope.idleFrames = 0;
        rope.activeFrames = 0;
        return true;
    }

    public moveGrab(id: string, point: WirePoint): void {
        const rope = this.ropes.get(id);
        if (!rope?.grab) return;
        rope.grab.target = { x: point.x, y: point.y };
        rope.sleeping = false;
        rope.idleFrames = 0;
        rope.activeFrames = 0;
    }

    public releaseGrab(id: string): void {
        const rope = this.ropes.get(id);
        if (!rope) return;
        rope.grab = null;
        rope.sleeping = false;
        rope.idleFrames = 0;
        rope.activeFrames = 0;
    }

    public detachEndpoint(id: string, end: 'start' | 'end', point: WirePoint): void {
        const rope = this.ropes.get(id);
        if (!rope) return;
        rope.detached = { end, target: { x: point.x, y: point.y } };
        rope.sleeping = false;
        rope.idleFrames = 0;
        rope.activeFrames = 0;
    }

    public moveDetachedEndpoint(id: string, point: WirePoint): void {
        const rope = this.ropes.get(id);
        if (!rope?.detached) return;
        rope.detached.target = { x: point.x, y: point.y };
        rope.sleeping = false;
        rope.idleFrames = 0;
        rope.activeFrames = 0;
    }

    public reattachEndpoint(id: string): void {
        const rope = this.ropes.get(id);
        if (!rope) return;
        const wasEnd = rope.detached?.end;
        rope.detached = null;
        const lastIdx = rope.nodes.length - 1;
        if (wasEnd === 'start') {
            rope.nodes[0] = {
                x: rope.start.x,
                y: rope.start.y,
                oldX: rope.start.x,
                oldY: rope.start.y,
            };
        } else if (wasEnd === 'end') {
            rope.nodes[lastIdx] = {
                x: rope.end.x,
                y: rope.end.y,
                oldX: rope.end.x,
                oldY: rope.end.y,
            };
        }
        rope.segmentLength = computeRestSegmentLength(
            rope.nodes[0],
            rope.nodes[lastIdx],
            this.segments,
            this.settings.gravity,
            this.settings.slack,
        );
        this.projectConstraintsOnly(rope, 3);
        rope.sleeping = false;
        rope.idleFrames = 0;
        rope.activeFrames = 0;
    }

    public step(dtScale = 1): string[] {
        const dt = clamp(dtScale, 0.25, 1.8);
        const subGravityAcc = (this.settings.gravity * GRAVITY_SCALE * dt * dt) / (SUBSTEPS * SUBSTEPS);
        const steppedIds: string[] = [];

        for (const rope of this.ropes.values()) {
            if (rope.sleeping) continue;

            const isFree = !rope.grab && !rope.detached;
            if (isFree) {
                rope.activeFrames += 1;
            }
            const damping = isFree && rope.activeFrames > 55
                ? Math.max(0.86, SUBSTEP_DAMPING - (rope.activeFrames - 55) * 0.0022)
                : SUBSTEP_DAMPING;

            for (let substep = 0; substep < SUBSTEPS; substep++) {
                this.stepSingleSubstep(rope, subGravityAcc, damping);
            }
            this.evaluateSleepState(rope);
            steppedIds.push(rope.id);
        }

        return steppedIds;
    }

    private isNodePinned(rope: WireRopeState, index: number): boolean {
        const lastIdx = rope.nodes.length - 1;
        if (index === 0 || index === lastIdx) return true;
        return rope.grab?.nodeIndex === index;
    }

    private applyPinnedPositions(rope: WireRopeState): void {
        const lastIdx = rope.nodes.length - 1;
        const startTarget = rope.detached?.end === 'start' ? rope.detached.target : rope.start;
        const endTarget = rope.detached?.end === 'end' ? rope.detached.target : rope.end;

        rope.nodes[0].x = startTarget.x;
        rope.nodes[0].y = startTarget.y;
        rope.nodes[lastIdx].x = endTarget.x;
        rope.nodes[lastIdx].y = endTarget.y;

        if (rope.grab) {
            const grabbed = rope.nodes[rope.grab.nodeIndex];
            if (grabbed) {
                grabbed.x = rope.grab.target.x;
                grabbed.y = rope.grab.target.y;
                grabbed.oldX = rope.grab.target.x;
                grabbed.oldY = rope.grab.target.y;
            }
        }
    }

    private applyExitTangentGuidance(rope: WireRopeState): void {
        const lastIdx = rope.nodes.length - 1;
        const lift = Math.min(20, rope.segmentLength * 0.9);
        const stiffness = 0.095;

        if (
            rope.detached?.end !== 'start'
            && rope.grab?.nodeIndex !== 1
            && (rope.start.ex !== undefined || rope.start.ey !== undefined)
        ) {
            const targetX = rope.start.x + (rope.start.ex ?? 0) * lift;
            const targetY = rope.start.y + (rope.start.ey ?? 0) * lift;
            rope.nodes[1].x += (targetX - rope.nodes[1].x) * stiffness;
            rope.nodes[1].y += (targetY - rope.nodes[1].y) * stiffness;
        }

        if (
            rope.detached?.end !== 'end'
            && rope.grab?.nodeIndex !== lastIdx - 1
            && (rope.end.ex !== undefined || rope.end.ey !== undefined)
        ) {
            const targetX = rope.end.x + (rope.end.ex ?? 0) * lift;
            const targetY = rope.end.y + (rope.end.ey ?? 0) * lift;
            rope.nodes[lastIdx - 1].x += (targetX - rope.nodes[lastIdx - 1].x) * stiffness;
            rope.nodes[lastIdx - 1].y += (targetY - rope.nodes[lastIdx - 1].y) * stiffness;
        }
    }

    private projectConstraintsOnly(rope: WireRopeState, iterations: number): void {
        const nodes = rope.nodes;
        const lastIdx = nodes.length - 1;

        for (let iter = 0; iter < iterations; iter++) {
            this.applyPinnedPositions(rope);
            this.applyExitTangentGuidance(rope);

            for (let i = 0; i < lastIdx; i++) {
                const a = nodes[i];
                const b = nodes[i + 1];
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const dist = Math.hypot(dx, dy);
                if (dist < 0.0001) continue;

                const diff = (dist - rope.segmentLength) / dist;
                const aPinned = this.isNodePinned(rope, i);
                const bPinned = this.isNodePinned(rope, i + 1);

                if (aPinned && bPinned) continue;
                if (aPinned) {
                    b.x -= dx * diff;
                    b.y -= dy * diff;
                } else if (bPinned) {
                    a.x += dx * diff;
                    a.y += dy * diff;
                } else {
                    const half = diff * 0.5;
                    a.x += dx * half;
                    a.y += dy * half;
                    b.x -= dx * half;
                    b.y -= dy * half;
                }
            }
        }

        this.applyPinnedPositions(rope);
    }

    private stepSingleSubstep(
        rope: WireRopeState,
        subGravityAcc: number,
        damping = SUBSTEP_DAMPING,
    ): void {
        const nodes = rope.nodes;
        const lastIdx = nodes.length - 1;

        for (let i = 1; i < lastIdx; i++) {
            if (rope.grab?.nodeIndex === i) continue;
            const node = nodes[i];
            const vx = (node.x - node.oldX) * damping;
            const vy = (node.y - node.oldY) * damping;
            node.oldX = node.x;
            node.oldY = node.y;
            node.x += vx;
            node.y += vy + subGravityAcc;
        }

        if (rope.detached) {
            const sx = rope.detached.end === 'start' ? rope.detached.target.x : rope.start.x;
            const sy = rope.detached.end === 'start' ? rope.detached.target.y : rope.start.y;
            const ex = rope.detached.end === 'end' ? rope.detached.target.x : rope.end.x;
            const ey = rope.detached.end === 'end' ? rope.detached.target.y : rope.end.y;
            rope.segmentLength = computeRestSegmentLength(
                { x: sx, y: sy },
                { x: ex, y: ey },
                this.segments,
                this.settings.gravity,
                this.settings.slack,
            );
        }

        this.projectConstraintsOnly(rope, CONSTRAINT_ITERATIONS);
    }

    private settleRopeToEquilibrium(rope: WireRopeState, maxSteps = 90): void {
        const subGravityAcc = (this.settings.gravity * GRAVITY_SCALE) / (SUBSTEPS * SUBSTEPS);
        const nodes = rope.nodes;
        const lastIdx = nodes.length - 1;

        for (let step = 0; step < maxSteps; step++) {
            for (let substep = 0; substep < SUBSTEPS; substep++) {
                this.stepSingleSubstep(rope, subGravityAcc, SETTLE_SUBSTEP_DAMPING);
            }

            let maxDisp = 0;
            for (let i = 1; i < lastIdx; i++) {
                const node = nodes[i];
                const disp = Math.hypot(node.x - node.oldX, node.y - node.oldY);
                if (disp > maxDisp) maxDisp = disp;
            }
            if (maxDisp < SLEEP_EPSILON) {
                break;
            }
        }

        for (const node of nodes) {
            node.oldX = node.x;
            node.oldY = node.y;
        }
        rope.sleeping = true;
        rope.idleFrames = SLEEP_FRAMES_REQUIRED;
        rope.activeFrames = 0;
    }

    private evaluateSleepState(rope: WireRopeState): void {
        const nodes = rope.nodes;
        const lastIdx = nodes.length - 1;
        const isFree = !rope.grab && !rope.detached;

        if (isFree && rope.activeFrames >= MAX_FREE_ACTIVE_FRAMES) {
            rope.sleeping = true;
            rope.idleFrames = SLEEP_FRAMES_REQUIRED;
            rope.activeFrames = 0;
            for (const node of nodes) {
                node.oldX = node.x;
                node.oldY = node.y;
            }
            return;
        }

        let maxDisp = 0;
        for (let i = 1; i < lastIdx; i++) {
            const node = nodes[i];
            const disp = Math.hypot(node.x - node.oldX, node.y - node.oldY);
            if (disp > maxDisp) maxDisp = disp;
        }

        if (isFree && maxDisp < SLEEP_EPSILON) {
            rope.idleFrames += 1;
            if (rope.idleFrames >= SLEEP_FRAMES_REQUIRED) {
                rope.sleeping = true;
                rope.activeFrames = 0;
                for (const node of nodes) {
                    node.oldX = node.x;
                    node.oldY = node.y;
                }
            }
        } else {
            rope.idleFrames = 0;
        }
    }

    public getWireGeometry(id: string): WireGeometry | null {
        const rope = this.ropes.get(id);
        if (!rope || rope.nodes.length < 2) return null;

        const first = rope.nodes[0];
        const second = rope.nodes[1];
        const prev = rope.nodes[rope.nodes.length - 2];
        const last = rope.nodes[rope.nodes.length - 1];

        return {
            path: pointsToSmoothSvgPath(rope.nodes),
            start: { x: first.x, y: first.y },
            end: { x: last.x, y: last.y },
            startAngle: computeEndpointAngle(first, second),
            endAngle: computeEndpointAngle(last, prev),
            sleeping: rope.sleeping,
        };
    }

    public clear(): void {
        this.ropes.clear();
    }
}
