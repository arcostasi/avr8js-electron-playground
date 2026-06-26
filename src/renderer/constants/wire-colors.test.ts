import { describe, expect, it } from 'vitest';
import {
    resolveWireAppearance,
    WIRE_COLOR_DEFINITIONS,
    WIRE_COLORS,
} from './wire-colors';

describe('wire-colors', () => {
    it('provides 12 calibrated non-Web-1.0 realistic PVC wire definitions matching WIRE_COLORS', () => {
        expect(WIRE_COLORS).toHaveLength(12);
        expect(WIRE_COLOR_DEFINITIONS.map((def) => def.id)).toEqual([...WIRE_COLORS]);

        const rawWebColors = new Set(['#000000', '#0000ff', '#00ff00', '#ff0000', '#ffff00', '#ffffff']);
        for (const id of WIRE_COLORS) {
            const resolved = resolveWireAppearance(id);
            expect(resolved.id).toBe(id);
            expect(resolved.jacket.startsWith('#')).toBe(true);
            expect(rawWebColors.has(resolved.jacket.toLowerCase())).toBe(false);
        }

        expect(resolveWireAppearance('black').jacket).toBe('#2c313a');
        expect(resolveWireAppearance('blue').jacket).toBe('#2b6de0');
    });

    it('supports case-insensitive lookup, aliases, default fallback, and custom hex colors', () => {
        expect(resolveWireAppearance('RED').id).toBe('red');
        expect(resolveWireAppearance('grey').id).toBe('gray');
        expect(resolveWireAppearance('gold').jacket).toBe('#d69e2e');
        expect(resolveWireAppearance('').id).toBe('green');
        expect(resolveWireAppearance(null).id).toBe('green');

        const custom = resolveWireAppearance('#f43f5e');
        expect(custom.jacket).toBe('#f43f5e');
        expect(custom.outline).toBe('rgba(0,0,0,0.68)');
        expect(custom.collar).toBe('#f43f5e');
    });
});
