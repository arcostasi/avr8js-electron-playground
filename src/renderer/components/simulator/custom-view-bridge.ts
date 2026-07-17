export const CUSTOM_VIEW_IPC_CHANNEL = 'custom-view:post-message';
export const CUSTOM_VIEW_FRAME_NAME_PREFIX = 'avr8js-custom-view-';

export interface CustomViewBridgeHandle {
    pushNeoPixels: (pixels: Uint32Array) => void;
    clearNeoPixels: (pixelCount?: number) => void;
    pushSerialData?: (text: string) => void;
}

export interface ElectronIpcInvoker {
    invoke: (channel: string, payload: unknown) => Promise<unknown>;
}

function getElectronIpcRenderer(): ElectronIpcInvoker | null {
    const globalWithRequire = globalThis as {
        require?: (id: string) => { ipcRenderer?: ElectronIpcInvoker } | undefined;
    };
    try {
        const electronModule = globalWithRequire.require?.('electron');
        const ipcRenderer = electronModule?.ipcRenderer;
        if (ipcRenderer && typeof ipcRenderer.invoke === 'function') {
            return ipcRenderer;
        }
    } catch {
        // Ignore when running outside Electron (e.g. plain browser or Vitest)
    }
    return null;
}

function isDeliveredResult(result: unknown): boolean {
    if (!result || typeof result !== 'object') {
        return false;
    }
    return (result as { delivered?: unknown }).delivered === true;
}

/**
 * Validates and normalizes a Wokwi `customView` URL.
 * Only `http:` and `https:` URLs are permitted (blocking `javascript:`, `file:`, etc.).
 */
export function resolveCustomViewUrl(raw?: string | null): string | null {
    if (typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;

    try {
        const parsed = new URL(trimmed);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return null;
        }
        return parsed.toString();
    } catch {
        return null;
    }
}

/**
 * Checks whether an incoming postMessage payload is a Wokwi customView listen handshake.
 */
export function isWokwiListenMessage(data: unknown): boolean {
    if (!data || typeof data !== 'object') return false;
    const msg = data as { app?: unknown; command?: unknown };
    return msg.app === 'wokwi' && msg.command === 'listen';
}

/**
 * Posts a NeoPixel framebuffer packet `{ neopixels }` to the embedded customView frame.
 */
export function postNeoPixelsToFrame(
    targetWindow: Pick<Window, 'postMessage'> | null | undefined,
    pixels: Uint32Array,
): boolean {
    if (!targetWindow || typeof targetWindow.postMessage !== 'function') {
        return false;
    }
    try {
        targetWindow.postMessage({ neopixels: pixels }, '*');
        return true;
    } catch {
        return false;
    }
}

/**
 * Posts serial output bytes `{ type: 'serial-data', bytes }` to the embedded customView frame.
 */
export function postSerialDataToFrame(
    targetWindow: Pick<Window, 'postMessage'> | null | undefined,
    text: string,
): boolean {
    if (!targetWindow || typeof targetWindow.postMessage !== 'function') {
        return false;
    }
    try {
        const bytes = new TextEncoder().encode(text);
        targetWindow.postMessage({ type: 'serial-data', bytes }, '*');
        return true;
    } catch {
        return false;
    }
}

export interface DeliverNeoPixelsOptions {
    frameName: string;
    targetUrl: string;
    targetWindow: Pick<Window, 'postMessage'> | null | undefined;
    pixels: Uint32Array;
    ipcRenderer?: ElectronIpcInvoker | null;
}

/**
 * Delivers NeoPixels via Electron main-process frame dispatch first, falling back to postMessage.
 */
export async function deliverNeoPixelsToCustomView({
    frameName,
    targetUrl,
    targetWindow,
    pixels,
    ipcRenderer = getElectronIpcRenderer(),
}: DeliverNeoPixelsOptions): Promise<boolean> {
    const normalizedUrl = resolveCustomViewUrl(targetUrl);
    if (ipcRenderer && frameName.startsWith(CUSTOM_VIEW_FRAME_NAME_PREFIX) && normalizedUrl) {
        try {
            const bytes = new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength);
            const result = await ipcRenderer.invoke(CUSTOM_VIEW_IPC_CHANNEL, {
                frameName,
                targetUrl: normalizedUrl,
                payload: { kind: 'neopixels', bytes },
            });
            if (isDeliveredResult(result)) {
                return true;
            }
        } catch {
            // Fall through to standard window.postMessage
        }
    }

    return postNeoPixelsToFrame(targetWindow, pixels);
}

export interface DeliverSerialDataOptions {
    frameName: string;
    targetUrl: string;
    targetWindow: Pick<Window, 'postMessage'> | null | undefined;
    text: string;
    ipcRenderer?: ElectronIpcInvoker | null;
}

/**
 * Delivers serial output via Electron main-process frame dispatch first, falling back to postMessage.
 */
export async function deliverSerialDataToCustomView({
    frameName,
    targetUrl,
    targetWindow,
    text,
    ipcRenderer = getElectronIpcRenderer(),
}: DeliverSerialDataOptions): Promise<boolean> {
    if (!text) {
        return false;
    }

    const normalizedUrl = resolveCustomViewUrl(targetUrl);
    if (ipcRenderer && frameName.startsWith(CUSTOM_VIEW_FRAME_NAME_PREFIX) && normalizedUrl) {
        try {
            const result = await ipcRenderer.invoke(CUSTOM_VIEW_IPC_CHANNEL, {
                frameName,
                targetUrl: normalizedUrl,
                payload: { kind: 'serial-data', text },
            });
            if (isDeliveredResult(result)) {
                return true;
            }
        } catch {
            // Fall through to standard window.postMessage
        }
    }

    return postSerialDataToFrame(targetWindow, text);
}
