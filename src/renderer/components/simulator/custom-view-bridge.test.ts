import { describe, expect, it, vi } from 'vitest';
import {
    CUSTOM_VIEW_FRAME_NAME_PREFIX,
    CUSTOM_VIEW_IPC_CHANNEL,
    deliverNeoPixelsToCustomView,
    deliverSerialDataToCustomView,
    isWokwiListenMessage,
    postNeoPixelsToFrame,
    postSerialDataToFrame,
    resolveCustomViewUrl,
} from './custom-view-bridge';

describe('custom-view-bridge', () => {
    it('accepts valid http/https customView URLs and rejects unsafe or invalid ones', () => {
        expect(resolveCustomViewUrl('http://localhost:3000/')).toBe('http://localhost:3000/');
        expect(resolveCustomViewUrl('  http://localhost:3000/?size=8  ')).toBe('http://localhost:3000/?size=8');
        expect(resolveCustomViewUrl('https://wokwi.github.io/led-3d-cube/?size=8')).toBe(
            'https://wokwi.github.io/led-3d-cube/?size=8',
        );

        expect(resolveCustomViewUrl('javascript:alert(1)')).toBeNull();
        expect(resolveCustomViewUrl('file:///etc/passwd')).toBeNull();
        expect(resolveCustomViewUrl('')).toBeNull();
        expect(resolveCustomViewUrl('   ')).toBeNull();
        expect(resolveCustomViewUrl('not a url')).toBeNull();
        expect(resolveCustomViewUrl(null)).toBeNull();
    });

    it('detects Wokwi listen handshake messages accurately', () => {
        expect(isWokwiListenMessage({ app: 'wokwi', command: 'listen', version: 1 })).toBe(true);
        expect(isWokwiListenMessage({ app: 'wokwi', command: 'other' })).toBe(false);
        expect(isWokwiListenMessage({ app: 'other', command: 'listen' })).toBe(false);
        expect(isWokwiListenMessage(null)).toBe(false);
        expect(isWokwiListenMessage('listen')).toBe(false);
    });

    it('posts neopixels buffer payload safely to the target frame', () => {
        const postMessage = vi.fn();
        const pixels = new Uint32Array([0x112233, 0x445566]);

        expect(postNeoPixelsToFrame({ postMessage }, pixels)).toBe(true);
        expect(postMessage).toHaveBeenCalledTimes(1);
        expect(postMessage).toHaveBeenCalledWith({ neopixels: pixels }, '*');

        expect(postNeoPixelsToFrame(null, pixels)).toBe(false);
        expect(postNeoPixelsToFrame({
            postMessage: () => { throw new Error('blocked'); },
        }, pixels)).toBe(false);
    });

    it('delivers neopixels over Electron IPC when available and falls back to postMessage otherwise', async () => {
        const pixels = new Uint32Array([0x00112233, 0x00445566]);
        const invoke = vi.fn(async () => ({ delivered: true }));
        const postMessage = vi.fn();
        const frameName = `${CUSTOM_VIEW_FRAME_NAME_PREFIX}test-0`;

        await expect(
            deliverNeoPixelsToCustomView({
                frameName,
                targetUrl: 'http://localhost:3000/?size=8',
                targetWindow: { postMessage },
                pixels,
                ipcRenderer: { invoke },
            }),
        ).resolves.toBe(true);

        expect(invoke).toHaveBeenCalledTimes(1);
        const [channel, req] = invoke.mock.calls[0] as unknown as [
            string,
            { frameName: string; targetUrl: string; payload: { kind: string; bytes: Uint8Array } },
        ];
        expect(channel).toBe(CUSTOM_VIEW_IPC_CHANNEL);
        expect(req.frameName).toBe(frameName);
        expect(req.targetUrl).toBe('http://localhost:3000/?size=8');
        expect(req.payload.kind).toBe('neopixels');
        const roundTripped = new Uint32Array(
            req.payload.bytes.buffer,
            req.payload.bytes.byteOffset,
            req.payload.bytes.byteLength >> 2,
        );
        expect(Array.from(roundTripped)).toEqual(Array.from(pixels));
        expect(postMessage).not.toHaveBeenCalled();

        // Fallback when IPC returns delivered: false
        const invokeFalse = vi.fn(async () => ({ delivered: false }));
        await expect(
            deliverNeoPixelsToCustomView({
                frameName,
                targetUrl: 'http://localhost:3000/?size=8',
                targetWindow: { postMessage },
                pixels,
                ipcRenderer: { invoke: invokeFalse },
            }),
        ).resolves.toBe(true);
        expect(postMessage).toHaveBeenCalledWith({ neopixels: pixels }, '*');

        // Fallback when ipcRenderer is null
        postMessage.mockClear();
        await expect(
            deliverNeoPixelsToCustomView({
                frameName,
                targetUrl: 'http://localhost:3000/?size=8',
                targetWindow: { postMessage },
                pixels,
                ipcRenderer: null,
            }),
        ).resolves.toBe(true);
        expect(postMessage).toHaveBeenCalledWith({ neopixels: pixels }, '*');
    });

    it('delivers serial-data over Electron IPC and falls back to postSerialDataToFrame', async () => {
        const invoke = vi.fn(async () => ({ delivered: true }));
        const postMessage = vi.fn();
        const frameName = `${CUSTOM_VIEW_FRAME_NAME_PREFIX}test-1`;

        await expect(
            deliverSerialDataToCustomView({
                frameName,
                targetUrl: 'http://localhost:3000/?size=8',
                targetWindow: { postMessage },
                text: 'FastLED:1\n',
                ipcRenderer: { invoke },
            }),
        ).resolves.toBe(true);

        expect(invoke).toHaveBeenCalledWith(CUSTOM_VIEW_IPC_CHANNEL, {
            frameName,
            targetUrl: 'http://localhost:3000/?size=8',
            payload: { kind: 'serial-data', text: 'FastLED:1\n' },
        });
        expect(postMessage).not.toHaveBeenCalled();

        expect(postSerialDataToFrame({ postMessage }, 'Hello')).toBe(true);
        expect(postMessage).toHaveBeenCalledTimes(1);
        const sentPayload = postMessage.mock.calls[0][0] as { type: string; bytes: Uint8Array };
        expect(sentPayload.type).toBe('serial-data');
        expect(new TextDecoder().decode(sentPayload.bytes)).toBe('Hello');

        await expect(
            deliverSerialDataToCustomView({
                frameName,
                targetUrl: 'http://localhost:3000/?size=8',
                targetWindow: { postMessage },
                text: 'Fallback\n',
                ipcRenderer: null,
            }),
        ).resolves.toBe(true);
        expect(postMessage).toHaveBeenCalledTimes(2);
    });
});
