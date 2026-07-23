import { describe, expect, it } from 'vitest';
import type { WokwiDiagram } from '../types/wokwi.types';
import {
    computePadFreeRotatePosition,
    duplicatePartInDiagram,
    getEffectiveSide,
    pickPadFreeSide,
    removePartFromDiagram,
} from './part-controls';

describe('part-controls', () => {
    it('places rotate handle on right edge when top and bottom edges both have pins (7segment / uno / dip)', () => {
        const pins7Seg = [
            { name: 'G', x: 10, y: 2 },
            { name: 'COM.2', x: 20, y: 2 },
            { name: 'A', x: 30, y: 2 },
            { name: 'D', x: 10, y: 80 },
            { name: 'COM.1', x: 20, y: 80 },
        ];
        expect(pickPadFreeSide(pins7Seg, 48, 82)).toBe('right');
        const pos = computePadFreeRotatePosition({
            left: 100,
            top: 200,
            width: 48,
            height: 82,
            pins: pins7Seg,
            margin: 20,
        });
        expect(pos).toEqual({
            x: 168,
            y: 241,
            side: 'right',
            effectiveSide: 'right',
            orientation: 'vertical',
        });
    });

    it('places rotate handle on top edge when pins are only at bottom (led / buzzer / dot-matrix)', () => {
        const pinsLed = [
            { name: 'C', x: 15, y: 42 },
            { name: 'A', x: 25, y: 42 },
        ];
        const pos = computePadFreeRotatePosition({
            left: 200,
            top: 100,
            width: 40,
            height: 44,
            pins: pinsLed,
            margin: 20,
        });
        expect(pos).toEqual({
            x: 220,
            y: 80,
            side: 'top',
            effectiveSide: 'top',
            orientation: 'horizontal',
        });
    });

    it('places rotate handle on right edge when pins are only at top (ssd1306 / mpu6050)', () => {
        const pinsOled = [
            { name: 'DATA', x: 36, y: 12 },
            { name: 'CLK', x: 46, y: 12 },
            { name: 'VIN', x: 93, y: 12 },
            { name: 'GND', x: 103, y: 12 },
        ];
        expect(pickPadFreeSide(pinsOled, 130, 120)).toBe('right');
    });

    it('places rotate handle cleanly on top edge for left/right parts and rotates with component', () => {
        const pinsResistor = [
            { name: '1', x: 0, y: 6 },
            { name: '2', x: 60, y: 6 },
        ];
        expect(pickPadFreeSide(pinsResistor, 60, 12)).toBe('top');

        // At 90deg CW around top-left, local (30, -20) rotates to (20, 30)
        const rotated90 = computePadFreeRotatePosition({
            left: 100,
            top: 200,
            width: 60,
            height: 12,
            rotate: 90,
            pins: pinsResistor,
            margin: 20,
        });
        expect(rotated90).toEqual({
            x: 120,
            y: 230,
            side: 'top',
            effectiveSide: 'right',
            orientation: 'vertical',
        });
    });

    it('computes effective screen-space side across positive, negative, and wrapped rotations', () => {
        expect(getEffectiveSide('top', 0)).toBe('top');
        expect(getEffectiveSide('top', 90)).toBe('right');
        expect(getEffectiveSide('top', 180)).toBe('bottom');
        expect(getEffectiveSide('top', 270)).toBe('left');
        expect(getEffectiveSide('top', 360)).toBe('top');
        expect(getEffectiveSide('right', -90)).toBe('top');
        expect(getEffectiveSide('bottom', 450)).toBe('left');
    });

    it('removes targeted part and attached wires while keeping unrelated parts and prefix-similar IDs', () => {
        const diagram: WokwiDiagram = {
            version: 2,
            editor: 'wokwi',
            parts: [
                { id: 'uno', type: 'wokwi-arduino-uno', top: 0, left: 0, rotate: 0 },
                { id: 'led1', type: 'wokwi-led', top: 10, left: 10, rotate: 0 },
                { id: 'led10', type: 'wokwi-led', top: 20, left: 20, rotate: 0 },
            ],
            connections: [
                { id: 'c1', from: 'uno:13', to: 'led1:A', color: 'red' },
                { id: 'c2', from: 'led1:C', to: 'uno:GND.1', color: 'black' },
                { id: 'c3', from: 'uno:12', to: 'led10:A', color: 'green' },
                { id: 'c4', from: 'led10:C', to: 'uno:GND.2', color: 'black' },
            ],
        };

        const updated = removePartFromDiagram(diagram, 'led1');
        expect(updated.parts.map((part) => part.id)).toEqual(['uno', 'led10']);
        expect(updated.connections.map((conn) => conn.id)).toEqual(['c3', 'c4']);
    });

    it('duplicates a part with cloned attrs, collision-free ID, and offset position', () => {
        const diagram: WokwiDiagram = {
            version: 2,
            editor: 'wokwi',
            parts: [
                { id: 'led1', type: 'wokwi-led', top: 40, left: 60, rotate: 90, attrs: { color: 'blue' } },
                { id: 'led2', type: 'wokwi-led', top: 80, left: 80, rotate: 0, attrs: { color: 'red' } },
            ],
            connections: [],
        };

        const result = duplicatePartInDiagram(diagram, 'led1');
        expect(result).not.toBeNull();
        expect(result!.duplicatedPartId).toBe('led3');
        expect(result!.diagram.parts).toHaveLength(3);
        expect(result!.diagram.parts[2]).toEqual({
            id: 'led3',
            type: 'wokwi-led',
            left: 88,
            top: 68,
            rotate: 90,
            attrs: { color: 'blue' },
        });
        expect(result!.diagram.parts[2].attrs).not.toBe(diagram.parts[0].attrs);

        const customOffset = duplicatePartInDiagram(diagram, 'led2', { dx: 10, dy: -15 });
        expect(customOffset!.duplicatedPartId).toBe('led3');
        expect(customOffset!.diagram.parts[2].left).toBe(90);
        expect(customOffset!.diagram.parts[2].top).toBe(65);

        expect(duplicatePartInDiagram(diagram, 'missing-part')).toBeNull();
    });
});
