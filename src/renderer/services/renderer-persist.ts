/* eslint-disable @typescript-eslint/no-require-imports */
type ElectronIpcRenderer = typeof import('electron').ipcRenderer;

interface StorageReadJsonResponse<T> {
    ok?: boolean;
    success?: boolean;
    found?: boolean;
    value?: T;
}

interface StorageWriteResponse {
    ok?: boolean;
    success?: boolean;
}

function getIpcRenderer(): ElectronIpcRenderer | null {
    try {
        const electron = require('electron') as typeof import('electron');
        return electron.ipcRenderer ?? null;
    } catch {
        return null;
    }
}

function localStorageKey(scope: string, name: string): string {
    return `persist:${scope}:${name}`;
}

export async function readPersistedJson<T>(scope: string, name: string, fallback: T): Promise<T> {
    const ipcRenderer = getIpcRenderer();
    if (ipcRenderer) {
        const result = await ipcRenderer.invoke('storage:read-json', { scope, name }) as StorageReadJsonResponse<T>;
        if ((result.ok ?? result.success) && result.found) {
            return result.value ?? fallback;
        }
        return fallback;
    }

    try {
        const raw = localStorage.getItem(localStorageKey(scope, name));
        if (!raw) return fallback;
        return JSON.parse(raw) as T;
    } catch {
        return fallback;
    }
}

export async function writePersistedJson<T>(scope: string, name: string, value: T): Promise<T> {
    const ipcRenderer = getIpcRenderer();
    if (ipcRenderer) {
        const result = await ipcRenderer.invoke('storage:write-json', { scope, name, value }) as StorageWriteResponse;
        if (result.ok ?? result.success) return value;
        return value;
    }

    try {
        localStorage.setItem(localStorageKey(scope, name), JSON.stringify(value));
    } catch {
        // ignore quota failures in fallback mode
    }
    return value;
}

export async function deletePersistedEntry(scope: string, name: string): Promise<void> {
    const ipcRenderer = getIpcRenderer();
    if (ipcRenderer) {
        await ipcRenderer.invoke('storage:delete-entry', { scope, name });
        return;
    }

    try {
        localStorage.removeItem(localStorageKey(scope, name));
    } catch {
        // ignore fallback failures
    }
}