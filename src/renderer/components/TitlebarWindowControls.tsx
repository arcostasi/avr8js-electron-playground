import React, { useEffect, useState } from 'react';

function getElectronIpc() {
    try {
        const electron = window.require?.('electron') as typeof import('electron') | undefined;
        return electron?.ipcRenderer ?? null;
    } catch {
        return null;
    }
}

const ipcRenderer = getElectronIpc();

interface WindowStatePayload {
    isMaximized: boolean;
    isFullScreen: boolean;
}

const DEFAULT_WINDOW_STATE: WindowStatePayload = {
    isMaximized: false,
    isFullScreen: false,
};

const ICON_PROPS: React.SVGProps<SVGSVGElement> = {
    width: 16,
    height: 16,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    shapeRendering: 'geometricPrecision',
    'aria-hidden': true,
};

function FullScreenToggleIcon({ isFullScreen }: Readonly<{ isFullScreen: boolean }>) {
    if (isFullScreen) {
        return (
            <svg {...ICON_PROPS} strokeWidth={1.35}>
                <path d="M6 3 V5.25 C6 5.66 5.66 6 5.25 6 H3" />
                <path d="M10 3 V5.25 C10 5.66 10.34 6 10.75 6 H13" />
                <path d="M3 10 H5.25 C5.66 10 6 10.34 6 10.75 V13" />
                <path d="M13 10 H10.75 C10.34 10 10 10.34 10 10.75 V13" />
            </svg>
        );
    }

    return (
        <svg {...ICON_PROPS} strokeWidth={1.35}>
            <path d="M3 6 V3.75 C3 3.34 3.34 3 3.75 3 H6" />
            <path d="M10 3 H12.25 C12.66 3 13 3.34 13 3.75 V6" />
            <path d="M3 10 V12.25 C3 12.66 3.34 13 3.75 13 H6" />
            <path d="M10 13 H12.25 C12.66 13 13 12.66 13 12.25 V10" />
        </svg>
    );
}

function MinimizeIcon() {
    return (
        <svg {...ICON_PROPS} strokeWidth={1.4}>
            <path d="M3.5 8.5 H12.5" />
        </svg>
    );
}

function MaximizeRestoreIcon({ isMaximized }: Readonly<{ isMaximized: boolean }>) {
    if (isMaximized) {
        return (
            <svg {...ICON_PROPS} strokeWidth={1.35}>
                <rect x="3" y="5" width="7.5" height="7.5" rx="1.1" />
                <path d="M5.5 5 V4.2 C5.5 3.54 6.04 3 6.7 3 H11.8 C12.46 3 13 3.54 13 4.2 V9.3 C13 9.96 12.46 10.5 11.8 10.5 H10.5" />
            </svg>
        );
    }

    return (
        <svg {...ICON_PROPS} strokeWidth={1.35}>
            <rect x="3.5" y="3.5" width="9" height="9" rx="1.25" />
        </svg>
    );
}

function CloseIcon() {
    return (
        <svg {...ICON_PROPS} strokeWidth={1.45}>
            <path d="M4.25 4.25 L11.75 11.75 M11.75 4.25 L4.25 11.75" />
        </svg>
    );
}

export default function TitlebarWindowControls() {
    const [windowState, setWindowState] = useState<WindowStatePayload>(DEFAULT_WINDOW_STATE);

    useEffect(() => {
        if (!ipcRenderer) return undefined;
        let mounted = true;

        void ipcRenderer.invoke('window-get-state')
            .then((state: unknown) => {
                if (!mounted || !state || typeof state !== 'object') return;
                const payload = state as Partial<WindowStatePayload>;
                setWindowState({
                    isMaximized: Boolean(payload.isMaximized),
                    isFullScreen: Boolean(payload.isFullScreen),
                });
            })
            .catch(() => {
                // ignore in non-Electron test environments
            });

        const handleStateChange = (_event: unknown, next: Partial<WindowStatePayload> | undefined) => {
            if (!next || typeof next !== 'object') return;
            setWindowState({
                isMaximized: Boolean(next.isMaximized),
                isFullScreen: Boolean(next.isFullScreen),
            });
        };

        ipcRenderer.on('window-state-changed', handleStateChange);
        return () => {
            mounted = false;
            ipcRenderer.removeListener('window-state-changed', handleStateChange);
        };
    }, []);

    const baseBtnClass = [
        'w-11 h-9 flex items-center justify-center',
        'text-vscode-text/80 hover:text-vscode-text',
        'hover:bg-vscode-hover active:bg-vscode-hover/80',
        'transition-colors duration-100 focus:outline-none',
        'focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-blue-400',
    ].join(' ');

    const fullScreenLabel = windowState.isFullScreen
        ? 'Exit Full Screen (F11)'
        : 'Enter Full Screen (F11)';
    const maximizeLabel = windowState.isMaximized ? 'Restore Down' : 'Maximize';

    return (
        <div
            className="flex items-center h-full shrink-0"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
            <button
                type="button"
                onClick={() => ipcRenderer?.send('window-toggle-fullscreen')}
                title={fullScreenLabel}
                aria-label={fullScreenLabel}
                aria-pressed={windowState.isFullScreen}
                className={[
                    baseBtnClass,
                    windowState.isFullScreen ? 'text-blue-400 bg-vscode-hover/60 hover:text-blue-300' : '',
                ].filter(Boolean).join(' ')}
            >
                <FullScreenToggleIcon isFullScreen={windowState.isFullScreen} />
            </button>

            <span className="h-4 w-px bg-vscode-border/70 mx-0.5" aria-hidden="true" />

            <button
                type="button"
                onClick={() => ipcRenderer?.send('window-minimize')}
                title="Minimize"
                aria-label="Minimize"
                className={baseBtnClass}
            >
                <MinimizeIcon />
            </button>

            <button
                type="button"
                onClick={() => ipcRenderer?.send('window-maximize')}
                title={maximizeLabel}
                aria-label={maximizeLabel}
                className={baseBtnClass}
            >
                <MaximizeRestoreIcon isMaximized={windowState.isMaximized} />
            </button>

            <button
                type="button"
                onClick={() => ipcRenderer?.send('window-close')}
                title="Close"
                aria-label="Close"
                className={[
                    'w-11 h-9 flex items-center justify-center',
                    'text-vscode-text/80 hover:bg-[#e81123] active:bg-[#c50f1f]',
                    'hover:text-white transition-colors duration-100 focus:outline-none',
                    'focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-blue-400',
                ].join(' ')}
            >
                <CloseIcon />
            </button>
        </div>
    );
}
