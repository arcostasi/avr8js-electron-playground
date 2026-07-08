import { describe, expect, it } from 'vitest';
import { BitRingBuffer } from './oscilloscope-buffer';

describe('BitRingBuffer', () => {
    it('stores bits in chronological order before reaching capacity', () => {
        const buf = new BitRingBuffer(4);
        expect(buf.size).toBe(0);

        buf.push(1);
        buf.push(0);
        buf.push(1);

        expect(buf.size).toBe(3);
        expect([buf.get(0), buf.get(1), buf.get(2)]).toEqual([1, 0, 1]);
    });

    it('wraps cleanly when pushed beyond capacity and resets on clear()', () => {
        const buf = new BitRingBuffer(4);
        const seq: Array<0 | 1> = [1, 1, 0, 0, 1, 0];
        for (const bit of seq) {
            buf.push(bit);
        }

        expect(buf.size).toBe(4);
        expect([buf.get(0), buf.get(1), buf.get(2), buf.get(3)]).toEqual([0, 0, 1, 0]);

        buf.clear();
        expect(buf.size).toBe(0);
        buf.push(1);
        expect(buf.size).toBe(1);
        expect(buf.get(0)).toBe(1);
    });
});
