import { describe, it, expect } from 'vitest';
import { parseDiagram } from './wokwi.types';

describe('Wokwi Schema Migrations', () => {
    it('should upgrade V1 diagram to V2 connection objects and rotations', () => {
        const v1Diagram: Record<string, unknown> = {
            version: 1,
            author: "Test",
            editor: "wokwi",
            parts: [
                { type: "wokwi-arduino-uno", id: "uno", top: 0, left: 0 }
            ],
            connections: [
                ["uno:13", "led1:A", "green", []]
            ]
        };

        const v2Diagram = parseDiagram(
            v1Diagram as Parameters<typeof parseDiagram>[0],
        );

        expect(v2Diagram.version).toBe(2);

        // Parts must have rotate
        expect(v2Diagram.parts[0].rotate).toBe(0);

        // Connections must be objects
        expect(v2Diagram.connections[0]).toEqual(
            expect.objectContaining({
                from: "uno:13",
                to: "led1:A",
                color: "green"
            })
        );
        expect(v2Diagram.connections[0].id).toBeDefined();
    });

    it('should preserve existing V2 diagrams', () => {
        const v2Src = {
            version: 2 as const,
            author: "Test",
            editor: "wokwi",
            parts: [
                { type: "wokwi-led", id: "led1", top: 10, left: 10, rotate: 90, attrs: {} }
            ],
            connections: [
                { id: "conn-0", from: "uno:GND", to: "led1:C", color: "black", waypoints: [{ x: 0, y: 0 }] }
            ]
        };

        const result = parseDiagram(
            v2Src as Parameters<typeof parseDiagram>[0],
        );
        expect(result).toStrictEqual(v2Src);
    });
});
