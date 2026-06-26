import { describe, expect, it } from 'vitest';
import type { WokwiDiagram } from '../types/wokwi.types';
import {
    getPartColorConfig,
    resolvePartColor,
    resolvePartSwatchFill,
    updatePartColorInDiagram,
} from './part-colors';

describe('part-colors', () => {
    it('returns color configurations for supported components and null for unsupported ones', () => {
        expect(getPartColorConfig('wokwi-led')?.swatches.map((s) => s.value)).toContain('blue');
        expect(getPartColorConfig('wokwi-pushbutton')?.swatches.map((s) => s.value)).toContain('black');
        expect(getPartColorConfig('wokwi-pushbutton-6mm')).not.toBeNull();
        expect(getPartColorConfig('wokwi-led-bar-graph')?.swatches.map((s) => s.value)).toContain('GYR');
        expect(getPartColorConfig('wokwi-7segment')).not.toBeNull();
        expect(getPartColorConfig('wokwi-resistor')).toBeNull();
    });

    it('resolves configured colors and falls back to component defaults', () => {
        expect(resolvePartColor({ type: 'wokwi-led' })).toBe('red');
        expect(resolvePartColor({ type: 'wokwi-pushbutton', attrs: { color: 'green' } })).toBe('green');
        expect(resolvePartColor({ type: 'wokwi-led', attrs: { color: '  blue  ' } })).toBe('blue');
    });

    it('resolves swatch fills for named colors, multi-color modes, and custom CSS values', () => {
        expect(resolvePartSwatchFill({ type: 'wokwi-led', attrs: { color: 'GREEN' } })).toBe('#22c55e');
        expect(resolvePartSwatchFill({ type: 'wokwi-led-bar-graph', attrs: { color: 'GYR' } })).toContain('linear-gradient');
        expect(resolvePartSwatchFill({ type: 'wokwi-pushbutton', attrs: { color: '#ff00aa' } })).toBe('#ff00aa');
    });

    it('updates part color immutably and clears stale lightColor on wokwi-led', () => {
        const diagram: WokwiDiagram = {
            version: 2,
            author: 'test',
            editor: 'wokwi',
            parts: [
                {
                    id: 'led1',
                    type: 'wokwi-led',
                    top: 10,
                    left: 20,
                    rotate: 0,
                    attrs: { color: 'red', lightColor: '#ffaaaa', flip: '1' },
                },
                {
                    id: 'btn1',
                    type: 'wokwi-pushbutton',
                    top: 40,
                    left: 50,
                    rotate: 0,
                    attrs: { color: 'green', label: 'OK' },
                },
            ],
            connections: [],
        };

        const updatedLed = updatePartColorInDiagram(diagram, 'led1', 'blue');
        expect(updatedLed).not.toBe(diagram);
        expect(updatedLed.parts[0].attrs).toEqual({ color: 'blue', flip: '1' });
        expect(updatedLed.parts[1]).toBe(diagram.parts[1]);
        expect(diagram.parts[0].attrs).toEqual({ color: 'red', lightColor: '#ffaaaa', flip: '1' });

        const updatedBtn = updatePartColorInDiagram(updatedLed, 'btn1', 'yellow');
        expect(updatedBtn.parts[1].attrs).toEqual({ color: 'yellow', label: 'OK' });
    });
});
