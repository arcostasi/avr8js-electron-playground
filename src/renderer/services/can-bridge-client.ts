import type { CanBridgeEvent, CanBridgeFrame, CanBridgeStartOptions } from '../../shared/can-bridge';

type ElectronIpcRenderer = typeof import('electron').ipcRenderer;
type CanBridgeListener = (event: CanBridgeEvent) => void;

interface SessionState {
    started: boolean;
    ready: boolean;
    queue: CanBridgeFrame[];
    listeners: Set<CanBridgeListener>;
}

const sessions = new Map<string, SessionState>();
let listenerInstalled = false;

function getIpcRenderer(): ElectronIpcRenderer | null {
    try {
        if (!window || !window.require) {
            return null;
        }
        const electron = window.require('electron') as typeof import('electron');
        return electron.ipcRenderer ?? null;
    } catch {
        return null;
    }
}

function getOrCreateSession(sessionId: string): SessionState {
    let state = sessions.get(sessionId);
    if (!state) {
        state = {
            started: false,
            ready: false,
            queue: [],
            listeners: new Set(),
        };
        sessions.set(sessionId, state);
    }
    return state;
}

function emitSessionEvent(sessionId: string, event: CanBridgeEvent): void {
    const state = getOrCreateSession(sessionId);
    if (event.type === 'ready') {
        state.ready = true;
    } else if (event.type === 'closed' || event.type === 'error') {
        state.ready = false;
    } else if (event.type === 'rx') {
        state.queue.push(event.frame);
    }

    for (const listener of state.listeners) {
        listener(event);
    }
}

function ensureGlobalListener(): void {
    if (listenerInstalled) {
        return;
    }
    const ipcRenderer = getIpcRenderer();
    if (!ipcRenderer) {
        return;
    }

    ipcRenderer.on('can-bridge:event', (_event: unknown, payload: { sessionId: string; event: CanBridgeEvent }) => {
        if (!payload?.sessionId || !payload.event) {
            return;
        }
        emitSessionEvent(payload.sessionId, payload.event);
    });
    listenerInstalled = true;
}

export function ensureCanBridgeSession(
    options: CanBridgeStartOptions,
    listener?: CanBridgeListener,
): () => void {
    ensureGlobalListener();
    const state = getOrCreateSession(options.sessionId);
    if (listener) {
        state.listeners.add(listener);
    }

    const ipcRenderer = getIpcRenderer();
    if (ipcRenderer && !state.started) {
        state.started = true;
        ipcRenderer.send('can-bridge:start', options);
    }

    return () => {
        if (!listener) {
            return;
        }
        const current = sessions.get(options.sessionId);
        current?.listeners.delete(listener);
    };
}

export function stopCanBridgeSession(sessionId: string): void {
    const ipcRenderer = getIpcRenderer();
    if (ipcRenderer) {
        ipcRenderer.send('can-bridge:stop', { sessionId });
    }
    const state = sessions.get(sessionId);
    if (state) {
        state.started = false;
        state.ready = false;
        state.queue.length = 0;
        state.listeners.clear();
    }
    sessions.delete(sessionId);
}

export function isCanBridgeReady(sessionId: string): boolean {
    return sessions.get(sessionId)?.ready ?? false;
}

export function sendCanBridgeFrame(sessionId: string, frame: CanBridgeFrame): boolean {
    const ipcRenderer = getIpcRenderer();
    if (!ipcRenderer) {
        return false;
    }
    const state = sessions.get(sessionId);
    if (!state?.ready) {
        return false;
    }
    ipcRenderer.send('can-bridge:send', { sessionId, frame });
    return true;
}

export function pollCanBridgeFrame(sessionId: string): CanBridgeFrame | null {
    const state = sessions.get(sessionId);
    if (!state || state.queue.length === 0) {
        return null;
    }
    return state.queue.shift() ?? null;
}
