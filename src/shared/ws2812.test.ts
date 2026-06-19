import { describe, expect, it } from 'vitest';
import { PinState } from 'avr8js';
import { WS2812Controller } from './ws2812';

function sendBit(ws: WS2812Controller, bit: 0 | 1, startNs: number): number {
    const highNs = bit === 1 ? 800 : 400;
    const lowNs = bit === 1 ? 450 : 850;
    ws.feedValue(PinState.High, startNs);
    ws.feedValue(PinState.Low, startNs + highNs);
    return startNs + highNs + lowNs;
}

function sendGrbPixel(ws: WS2812Controller, grb: number, startNs: number): number {
    let ts = startNs;
    for (let bitIndex = 0; bitIndex < 24; bitIndex++) {
        const bit = ((grb >> (23 - bitIndex)) & 1) as 0 | 1;
        ts = sendBit(ws, bit, ts);
    }
    return ts;
}

describe('WS2812Controller', () => {
    it('decodes GRB pixels and supports live buffer resizing', () => {
        const ws = new WS2812Controller(2);
        let ts = 100000;
        ws.feedValue(PinState.Low, 0);

        ts = sendGrbPixel(ws, 0x123456, ts);
        ts = sendGrbPixel(ws, 0xabcdef, ts);
        ws.feedValue(PinState.High, ts + 60000);

        const initial = ws.update(ts + 60000);
        expect(initial).not.toBeNull();
        expect(initial?.[0]).toBe(0x123456);
        expect(initial?.[1]).toBe(0xabcdef);

        ws.resize(4);
        const expanded = ws.update(ts + 60000);
        expect(expanded).not.toBeNull();
        expect(expanded?.length).toBe(4);
        expect(expanded?.[0]).toBe(0x123456);
        expect(expanded?.[1]).toBe(0xabcdef);
        expect(expanded?.[2]).toBe(0);
        expect(expanded?.[3]).toBe(0);

        ws.resize(1);
        const shrunk = ws.update(ts + 60000);
        expect(shrunk?.length).toBe(1);
        expect(shrunk?.[0]).toBe(0x123456);
    });
});
