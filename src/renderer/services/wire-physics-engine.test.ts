import { describe, expect, it } from 'vitest';
import {
    clampWirePhysicsSettings,
    computeInitialCatenaryPoints,
    DEFAULT_WIRE_PHYSICS_SETTINGS,
    DEFAULT_WIRE_SEGMENTS,
    findMagneticSnapPin,
    pointsToSmoothSvgPath,
    WirePhysicsEngine,
} from './wire-physics-engine';

describe('wire-physics-engine', () => {
    it('drapes wires downward according to gravity and slack while keeping short spans tidy', () => {
        const lowSag = computeInitialCatenaryPoints(
            { x: 0, y: 100 },
            { x: 200, y: 100 },
            DEFAULT_WIRE_SEGMENTS,
            0.2,
            1.05,
        );
        const highSag = computeInitialCatenaryPoints(
            { x: 0, y: 100 },
            { x: 200, y: 100 },
            DEFAULT_WIRE_SEGMENTS,
            1.2,
            1.5,
        );
        const shortSpan = computeInitialCatenaryPoints(
            { x: 0, y: 100 },
            { x: 28, y: 100 },
            DEFAULT_WIRE_SEGMENTS,
            DEFAULT_WIRE_PHYSICS_SETTINGS.gravity,
            DEFAULT_WIRE_PHYSICS_SETTINGS.slack,
        );

        const midLow = lowSag[Math.floor(lowSag.length / 2)];
        const midHigh = highSag[Math.floor(highSag.length / 2)];
        const midShort = shortSpan[Math.floor(shortSpan.length / 2)];
        expect(midLow.y).toBeGreaterThan(100);
        expect(midHigh.y).toBeGreaterThan(midLow.y);
        expect(midShort.y - 100).toBeLessThan(12);

        const engine = new WirePhysicsEngine(DEFAULT_WIRE_PHYSICS_SETTINGS);
        engine.syncWire('w1', { x: 0, y: 100 }, { x: 200, y: 100 });
        expect(engine.hasWire('w1')).toBe(true);
        expect(engine.isWireSleeping('w1')).toBe(true);
        expect(engine.hasAwakeWires()).toBe(false);
    });

    it('opens pre-settled at true Verlet equilibrium so waking produces minimal shape drift', () => {
        const engine = new WirePhysicsEngine(DEFAULT_WIRE_PHYSICS_SETTINGS);
        engine.syncWire('w1', { x: 40, y: 120, ex: 0, ey: -1 }, { x: 240, y: 210, ex: 0, ey: 1 });
        const initialPath = engine.getWireGeometry('w1')?.path ?? '';
        const extractPoints = (svgPath: string) =>
            Array.from(svgPath.matchAll(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)(?=\s*$|\s*,|\s+C)/g)).map((m) => ({
                x: Number(m[1]),
                y: Number(m[2]),
            }));

        const beforePts = extractPoints(initialPath);
        engine.wakeWire('w1');
        for (let i = 0; i < 20; i++) engine.step(1);
        const afterPts = extractPoints(engine.getWireGeometry('w1')?.path ?? '');

        expect(beforePts.length).toBe(afterPts.length);
        const midIdx = Math.floor(beforePts.length / 2);
        const midDrift = Math.hypot(
            afterPts[midIdx].x - beforePts[midIdx].x,
            afterPts[midIdx].y - beforePts[midIdx].y,
        );
        expect(midDrift).toBeLessThan(2);
    });

    it('locks endpoints immediately on syncWire, responds briskly, and returns to sleep', () => {
        const engine = new WirePhysicsEngine(DEFAULT_WIRE_PHYSICS_SETTINGS);
        engine.syncWire('w1', { x: 20, y: 40, ex: 0, ey: 1 }, { x: 180, y: 40, ex: 0, ey: -1 });
        expect(engine.isWireSleeping('w1')).toBe(true);

        // Moving an endpoint wakes the wire and locks endpoint coordinates with zero lag
        engine.syncWire('w1', { x: 20, y: 40, ex: 0, ey: 1 }, { x: 240, y: 120, ex: 0, ey: -1 });
        expect(engine.isWireSleeping('w1')).toBe(false);
        expect(engine.hasAwakeWires()).toBe(true);
        expect(engine.getWireGeometry('w1')?.end).toEqual({ x: 240, y: 120 });

        // After 10 brisk frames, wire shows responsive gravity/inertia motion without molasses lag
        for (let i = 0; i < 10; i++) {
            engine.step(1);
        }
        const midPath = engine.getWireGeometry('w1')?.path ?? '';
        expect(midPath.startsWith('M 20 40')).toBe(true);

        let steps = 10;
        while (engine.hasAwakeWires() && steps < 400) {
            engine.step(1);
            steps += 1;
        }

        expect(engine.isWireSleeping('w1')).toBe(true);
        expect(steps).toBeGreaterThan(20);
        expect(steps).toBeLessThan(400);

        const geom = engine.getWireGeometry('w1');
        expect(geom).not.toBeNull();
        expect(geom?.start).toEqual({ x: 20, y: 40 });
        expect(geom?.end).toEqual({ x: 240, y: 120 });
    });

    it('follows rapid multi-frame component drags cleanly without erratic kinks and settles quickly', () => {
        const engine = new WirePhysicsEngine(DEFAULT_WIRE_PHYSICS_SETTINGS);
        engine.syncWire('w1', { x: 40, y: 100, ex: 0, ey: 1 }, { x: 200, y: 100, ex: 0, ey: -1 });

        for (let frame = 1; frame <= 6; frame++) {
            engine.syncWire(
                'w1',
                { x: 40, y: 100, ex: 0, ey: 1 },
                { x: 200 + frame * 40, y: 100 + frame * 20, ex: 0, ey: -1 },
            );
            engine.step(1);
        }

        const midDragGeom = engine.getWireGeometry('w1');
        expect(midDragGeom?.end).toEqual({ x: 440, y: 220 });

        let settleSteps = 0;
        while (engine.hasAwakeWires() && settleSteps < 200) {
            engine.step(1);
            settleSteps += 1;
        }
        expect(engine.isWireSleeping('w1')).toBe(true);
        expect(settleSteps).toBeLessThan(200);
    });

    it('guarantees sleep within 100 steps even when opposing vertical pin tangents fight gravity', () => {
        const engine = new WirePhysicsEngine(DEFAULT_WIRE_PHYSICS_SETTINGS);
        engine.syncWire('w1', { x: 40, y: 120, ex: 0, ey: -1 }, { x: 240, y: 210, ex: 0, ey: 1 });
        engine.wakeWire('w1');

        let steps = 0;
        while (engine.hasAwakeWires() && steps < 105) {
            engine.step(1);
            steps += 1;
        }

        expect(engine.isWireSleeping('w1')).toBe(true);
        expect(steps).toBeLessThanOrEqual(100);
    });

    it('supports mid-span grab/release with brisk gravity return and protects active detached drags', () => {
        const engine = new WirePhysicsEngine();
        engine.syncWire('w1', { x: 0, y: 50 }, { x: 200, y: 50 });

        expect(engine.grabMidSpan('w1', { x: 100, y: 60 })).toBe(true);
        expect(engine.isWireSleeping('w1')).toBe(false);
        engine.moveGrab('w1', { x: 100, y: 180 });
        engine.step(1);

        const pulledPath = engine.getWireGeometry('w1')?.path ?? '';
        expect(pulledPath.startsWith('M 0 50')).toBe(true);

        engine.releaseGrab('w1');
        for (let i = 0; i < 15; i++) engine.step(1);
        expect(engine.hasAwakeWires()).toBe(true);

        engine.detachEndpoint('w1', 'end', { x: 220, y: 90 });
        engine.moveDetachedEndpoint('w1', { x: 260, y: 130 });
        // Re-syncing diagram while dragging must not overwrite detached endpoint position
        engine.syncWire('w1', { x: 0, y: 50 }, { x: 200, y: 50 });
        engine.step(1);
        expect(engine.getWireGeometry('w1')?.end).toEqual({ x: 260, y: 130 });

        engine.reattachEndpoint('w1');
        expect(engine.getWireGeometry('w1')?.end).toEqual({ x: 200, y: 50 });
    });

    it('finds nearest magnetic snap pin within radius while excluding source anchor', () => {
        const pins = {
            'uno:13': { x: 100, y: 100 },
            'led1:A': { x: 210, y: 105 },
            'led1:C': { x: 218, y: 105 },
        };

        expect(findMagneticSnapPin({ x: 206, y: 104 }, pins, 'uno:13', 16)).toBe('led1:A');
        expect(findMagneticSnapPin({ x: 102, y: 101 }, pins, 'uno:13', 16)).toBeNull();
        expect(findMagneticSnapPin({ x: 300, y: 300 }, pins, null, 16)).toBeNull();
    });

    it('clamps wire physics settings including tenth-pixel thickness precision', () => {
        const clamped = clampWirePhysicsSettings({
            gravity: 5,
            slack: 0.5,
            thickness: 3.6,
            opacity: 0.1,
            realisticRendering: false,
        });
        expect(clamped).toEqual({
            gravity: 1.5,
            slack: 1.0,
            thickness: 3.6,
            opacity: 0.25,
            realisticRendering: false,
        });

        const path = pointsToSmoothSvgPath([
            { x: 0, y: 0 },
            { x: 50, y: 20 },
            { x: 100, y: 0 },
        ]);
        expect(path.startsWith('M 0 0 C ')).toBe(true);
    });
});
