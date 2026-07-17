import type { IpcMain, IpcMainInvokeEvent } from 'electron';

export const CUSTOM_VIEW_IPC_CHANNEL = 'custom-view:post-message';
export const CUSTOM_VIEW_FRAME_NAME_PREFIX = 'avr8js-custom-view-';
export const WOKWI_TRUSTED_ORIGIN = 'https://wokwi.com';

export type CustomViewMessagePayload =
  | { kind: 'neopixels'; bytes: Uint8Array }
  | { kind: 'serial-data'; text: string };

export interface CustomViewPostMessageRequest {
  frameName: string;
  targetUrl: string;
  payload: CustomViewMessagePayload;
}

export interface WebFrameMainLike {
  readonly name: string;
  readonly url: string;
  readonly detached: boolean;
  isDestroyed: () => boolean;
  executeJavaScript: (code: string, userGesture?: boolean) => Promise<unknown>;
}

let customViewIpcRegistered = false;

/**
 * Resolves the normalized origin (`scheme://host[:port]`) for `http:` / `https:` URLs only.
 */
export function resolveAllowedHttpOrigin(rawUrl: string): string | null {
  if (typeof rawUrl !== 'string') {
    return null;
  }
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

/**
 * Finds the live child frame matching the expected `avr8js-custom-view-` name and HTTP(S) origin.
 */
export function findMatchingCustomViewFrame(
  frames: readonly WebFrameMainLike[],
  frameName: string,
  expectedOrigin: string,
): WebFrameMainLike | null {
  if (typeof frameName !== 'string' || !frameName.startsWith(CUSTOM_VIEW_FRAME_NAME_PREFIX)) {
    return null;
  }
  if (!expectedOrigin) {
    return null;
  }

  for (const frame of frames) {
    if (!frame || frame.isDestroyed() || frame.detached) {
      continue;
    }
    if (frame.name !== frameName) {
      continue;
    }
    if (resolveAllowedHttpOrigin(frame.url) !== expectedOrigin) {
      continue;
    }
    return frame;
  }

  return null;
}

/**
 * Builds a self-contained script that dispatches a Wokwi-originated MessageEvent inside the frame.
 */
export function buildCustomViewDispatchScript(payload: CustomViewMessagePayload): string {
  const bytesBuffer = payload.kind === 'neopixels'
    ? Buffer.from(payload.bytes.buffer, payload.bytes.byteOffset, payload.bytes.byteLength)
    : Buffer.from(payload.text, 'utf8');
  const base64 = bytesBuffer.toString('base64');
  const base64Literal = JSON.stringify(base64);
  const originLiteral = JSON.stringify(WOKWI_TRUSTED_ORIGIN);

  if (payload.kind === 'neopixels') {
    return `(() => {
  const raw = atob(${base64Literal});
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    bytes[i] = raw.charCodeAt(i);
  }
  const pixelCount = bytes.byteLength >> 2;
  const pixels = new Uint32Array(bytes.buffer, bytes.byteOffset, pixelCount);
  window.dispatchEvent(new MessageEvent('message', {
    data: { neopixels: pixels },
    origin: ${originLiteral},
    source: window.parent,
  }));
})();`;
  }

  return `(() => {
  const raw = atob(${base64Literal});
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    bytes[i] = raw.charCodeAt(i);
  }
  window.dispatchEvent(new MessageEvent('message', {
    data: { type: 'serial-data', bytes: bytes },
    origin: ${originLiteral},
    source: window.parent,
  }));
})();`;
}

function isValidPostMessageRequest(request: unknown): request is CustomViewPostMessageRequest {
  if (!request || typeof request !== 'object') {
    return false;
  }
  const candidate = request as Partial<CustomViewPostMessageRequest>;
  if (typeof candidate.frameName !== 'string' || typeof candidate.targetUrl !== 'string') {
    return false;
  }
  if (!candidate.payload || typeof candidate.payload !== 'object') {
    return false;
  }
  if (candidate.payload.kind === 'neopixels') {
    return candidate.payload.bytes instanceof Uint8Array;
  }
  if (candidate.payload.kind === 'serial-data') {
    return typeof candidate.payload.text === 'string';
  }
  return false;
}

/**
 * Registers the main-process IPC handler that forwards NeoPixel/serial frames into Custom View iframes.
 */
export function registerCustomViewIpc(ipcMain: IpcMain): void {
  if (customViewIpcRegistered) {
    return;
  }
  customViewIpcRegistered = true;

  ipcMain.handle(CUSTOM_VIEW_IPC_CHANNEL, async (event: IpcMainInvokeEvent, request: unknown) => {
    if (!isValidPostMessageRequest(request)) {
      return { delivered: false };
    }

    const expectedOrigin = resolveAllowedHttpOrigin(request.targetUrl);
    if (!expectedOrigin) {
      return { delivered: false };
    }

    try {
      const frames = event.sender.mainFrame?.framesInSubtree ?? [];
      const targetFrame = findMatchingCustomViewFrame(frames, request.frameName, expectedOrigin);
      if (!targetFrame) {
        return { delivered: false };
      }

      const script = buildCustomViewDispatchScript(request.payload);
      await targetFrame.executeJavaScript(script, false);
      return { delivered: true };
    } catch {
      return { delivered: false };
    }
  });
}
