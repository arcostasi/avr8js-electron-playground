import { describe, expect, it } from 'vitest';
import type { WokwiDiagram } from '../types/wokwi.types';
import { createUndoHistorySnapshot, getUndoSnapshotKey } from './useDiagramState';

describe('useDiagramState undo history helpers', () => {
    const baseDiagram: WokwiDiagram = {
        version: 2,
        editor: 'avr8js-electron-playground',
        parts: [
            { id: 'uno', type: 'wokwi-arduino-uno', top: 0, left: 0, rotate: 0 },
            {
                id: 'led1',
                type: 'wokwi-led',
                top: 100,
                left: 200,
                rotate: 90,
                attrs: { color: 'red' },
            },
        ],
        connections: [
            {
                id: 'c1',
                from: 'uno:13',
                to: 'led1:A',
                color: 'green',
                waypoints: [{ x: 120, y: 60 }, { x: 160, y: 80 }],
                routeHints: ['pwm'],
            },
        ],
    };

    it('preserves component positions and wire colors while stripping wire positioning metadata', () => {
        const snap = createUndoHistorySnapshot(baseDiagram);

        expect(snap.parts).toEqual(baseDiagram.parts);
        expect(snap.connections).toEqual([
            { id: 'c1', from: 'uno:13', to: 'led1:A', color: 'green' },
        ]);
        expect(snap.connections[0].waypoints).toBeUndefined();
        expect(snap.connections[0].routeHints).toBeUndefined();
    });

    it('produces identical keys for waypoint-only edits and distinct keys for part or color changes', () => {
        const baseKey = getUndoSnapshotKey(createUndoHistorySnapshot(baseDiagram));

        const movedWaypointsDiagram: WokwiDiagram = {
            ...baseDiagram,
            connections: [
                {
                    ...baseDiagram.connections[0],
                    waypoints: [{ x: 250, y: 190 }],
                    routeHints: ['adc'],
                },
            ],
        };
        expect(getUndoSnapshotKey(createUndoHistorySnapshot(movedWaypointsDiagram))).toBe(baseKey);

        const movedPartDiagram: WokwiDiagram = {
            ...baseDiagram,
            parts: [
                baseDiagram.parts[0],
                { ...baseDiagram.parts[1], left: 260 },
            ],
        };
        expect(getUndoSnapshotKey(createUndoHistorySnapshot(movedPartDiagram))).not.toBe(baseKey);

        const recoloredWireDiagram: WokwiDiagram = {
            ...baseDiagram,
            connections: [{ ...baseDiagram.connections[0], color: 'orange' }],
        };
        expect(getUndoSnapshotKey(createUndoHistorySnapshot(recoloredWireDiagram))).not.toBe(baseKey);
    });
});
