import { describe, expect, it, vi } from 'vitest';
import {
    CUSTOM_VIEW_FRAME_NAME_PREFIX,
    WOKWI_TRUSTED_ORIGIN,
    buildCustomViewDispatchScript,
    findMatchingCustomViewFrame,
    resolveAllowedHttpOrigin,
    type WebFrameMainLike,
} from './custom-view-ipc';

function createFakeFrame(overrides: Partial<WebFrameMainLike> = {}): WebFrameMainLike {
    return {
        name: `${CUSTOM_VIEW_FRAME_NAME_PREFIX}frame-0`,
        url: 'http://localhost:3000/?size=8',
        detached: false,
        isDestroyed: () => false,
        executeJavaScript: vi.fn(async () => undefined),
        ...overrides,
    };
}

describe('custom-view-ipc', () => {
    it('resolves allowed http/https origins and rejects unsafe or invalid URLs', () => {
        expect(resolveAllowedHttpOrigin('http://localhost:3000/?size=8')).toBe('http://localhost:3000');
        expect(resolveAllowedHttpOrigin('https://wokwi.github.io/led-3d-cube/?size=8')).toBe('https://wokwi.github.io');

        expect(resolveAllowedHttpOrigin('file:///C:/index.html')).toBeNull();
        expect(resolveAllowedHttpOrigin('javascript:alert(1)')).toBeNull();
        expect(resolveAllowedHttpOrigin('')).toBeNull();
        expect(resolveAllowedHttpOrigin('not-a-url')).toBeNull();
    });

    it('matches only live frames with the Custom View prefix, exact name, and expected origin', () => {
        const expectedFrameName = `${CUSTOM_VIEW_FRAME_NAME_PREFIX}r1-0`;
        const matching = createFakeFrame({ name: expectedFrameName, url: 'http://localhost:3000/?size=8' });
        const destroyed = createFakeFrame({ name: expectedFrameName, isDestroyed: () => true });
        const detached = createFakeFrame({ name: expectedFrameName, detached: true });
        const wrongOrigin = createFakeFrame({ name: expectedFrameName, url: 'http://localhost:4000/' });
        const wrongName = createFakeFrame({ name: `${CUSTOM_VIEW_FRAME_NAME_PREFIX}other` });

        expect(
            findMatchingCustomViewFrame(
                [destroyed, detached, wrongOrigin, wrongName, matching],
                expectedFrameName,
                'http://localhost:3000',
            ),
        ).toBe(matching);

        expect(
            findMatchingCustomViewFrame([matching], 'unprefixed-frame', 'http://localhost:3000'),
        ).toBeNull();
        expect(
            findMatchingCustomViewFrame([wrongOrigin], expectedFrameName, 'http://localhost:3000'),
        ).toBeNull();
    });

    it('builds a dispatch script for neopixels that emits a Wokwi-origin MessageEvent from window.parent', () => {
        const inputPixels = new Uint32Array([0x00112233, 0x00abcdef, 0x0000ff00]);
        const bytes = new Uint8Array(inputPixels.buffer, inputPixels.byteOffset, inputPixels.byteLength);
        const script = buildCustomViewDispatchScript({ kind: 'neopixels', bytes });

        const dispatched: Array<{
            type: string;
            data: { neopixels?: Uint32Array };
            origin: string;
            source: unknown;
        }> = [];
        const fakeParent = { id: 'parent' };

        class MockMessageEvent {
            type: string;
            data: { neopixels?: Uint32Array };
            origin: string;
            source: unknown;
            constructor(type: string, init: { data: { neopixels?: Uint32Array }; origin: string; source: unknown }) {
                this.type = type;
                this.data = init.data;
                this.origin = init.origin;
                this.source = init.source;
            }
        }

        const runner = new Function(
            'window',
            'MessageEvent',
            'atob',
            script,
        ) as (
            win: { parent: unknown; dispatchEvent: (event: MockMessageEvent) => void },
            msgEventCtor: typeof MockMessageEvent,
            atobFn: (b64: string) => string,
        ) => void;

        runner(
            {
                parent: fakeParent,
                dispatchEvent: (event) => dispatched.push(event),
            },
            MockMessageEvent,
            (b64) => Buffer.from(b64, 'base64').toString('binary'),
        );

        expect(dispatched).toHaveLength(1);
        expect(dispatched[0].type).toBe('message');
        expect(dispatched[0].origin).toBe(WOKWI_TRUSTED_ORIGIN);
        expect(dispatched[0].source).toBe(fakeParent);
        expect(dispatched[0].data.neopixels).toBeInstanceOf(Uint32Array);
        expect(Array.from(dispatched[0].data.neopixels ?? [])).toEqual(Array.from(inputPixels));
    });

    it('builds a dispatch script for serial-data with UTF-8 bytes and Wokwi origin', () => {
        const script = buildCustomViewDispatchScript({ kind: 'serial-data', text: 'FastLED:2\n' });
        const dispatched: Array<{
            type: string;
            data: { type?: string; bytes?: Uint8Array };
            origin: string;
            source: unknown;
        }> = [];
        const fakeParent = { id: 'parent' };

        class MockMessageEvent {
            type: string;
            data: { type?: string; bytes?: Uint8Array };
            origin: string;
            source: unknown;
            constructor(type: string, init: { data: { type?: string; bytes?: Uint8Array }; origin: string; source: unknown }) {
                this.type = type;
                this.data = init.data;
                this.origin = init.origin;
                this.source = init.source;
            }
        }

        const runner = new Function(
            'window',
            'MessageEvent',
            'atob',
            script,
        ) as (
            win: { parent: unknown; dispatchEvent: (event: MockMessageEvent) => void },
            msgEventCtor: typeof MockMessageEvent,
            atobFn: (b64: string) => string,
        ) => void;

        runner(
            {
                parent: fakeParent,
                dispatchEvent: (event) => dispatched.push(event),
            },
            MockMessageEvent,
            (b64) => Buffer.from(b64, 'base64').toString('binary'),
        );

        expect(dispatched).toHaveLength(1);
        expect(dispatched[0].origin).toBe(WOKWI_TRUSTED_ORIGIN);
        expect(dispatched[0].source).toBe(fakeParent);
        expect(dispatched[0].data.type).toBe('serial-data');
        expect(dispatched[0].data.bytes).toBeInstanceOf(Uint8Array);
        expect(new TextDecoder().decode(dispatched[0].data.bytes)).toBe('FastLED:2\n');
    });
});
