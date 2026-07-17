import React, { useCallback, useEffect, useId, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { RefreshCw, ExternalLink } from 'lucide-react';
import {
    CUSTOM_VIEW_FRAME_NAME_PREFIX,
    deliverNeoPixelsToCustomView,
    deliverSerialDataToCustomView,
    isWokwiListenMessage,
    type CustomViewBridgeHandle,
} from './custom-view-bridge';

interface CustomViewFrameProps {
    url: string;
    isPlaying: boolean;
    initialPixelCount?: number;
    bridgeRef: React.RefObject<CustomViewBridgeHandle | null>;
}

const HANDSHAKE_RETRY_DELAYS_MS = [150, 500, 1200];

const CustomViewFrame = React.memo(function CustomViewFrame({
    url,
    isPlaying,
    initialPixelCount,
    bridgeRef,
}: Readonly<CustomViewFrameProps>) {
    const rawId = useId();
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const latestPixelsRef = useRef<Uint32Array | null>(null);
    const mountedRef = useRef(true);
    const inFlightRef = useRef(false);
    const pendingPushRef = useRef(false);
    const hasLivePushSinceLoadRef = useRef(false);
    const frameGenerationRef = useRef(0);
    const retryTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
    const [reloadNonce, setReloadNonce] = useState(0);
    const [isConnected, setIsConnected] = useState(false);

    const frameName = useMemo(() => {
        const sanitizedId = rawId.replace(/[^a-zA-Z0-9-]/g, '');
        return `${CUSTOM_VIEW_FRAME_NAME_PREFIX}${sanitizedId}-${reloadNonce}`;
    }, [rawId, reloadNonce]);

    const clearRetryTimers = useCallback(() => {
        for (const timer of retryTimersRef.current) {
            clearTimeout(timer);
        }
        retryTimersRef.current = [];
    }, []);

    const pushCurrentPixels = useCallback(async () => {
        const pixels = latestPixelsRef.current;
        if (!pixels) return;

        if (inFlightRef.current) {
            pendingPushRef.current = true;
            return;
        }

        inFlightRef.current = true;
        const generation = frameGenerationRef.current;
        const snapshot = new Uint32Array(pixels);

        try {
            const delivered = await deliverNeoPixelsToCustomView({
                frameName,
                targetUrl: url,
                targetWindow: iframeRef.current?.contentWindow,
                pixels: snapshot,
            });
            if (mountedRef.current && generation === frameGenerationRef.current && delivered) {
                setIsConnected(true);
            }
        } finally {
            if (generation === frameGenerationRef.current) {
                inFlightRef.current = false;
                if (mountedRef.current && pendingPushRef.current) {
                    pendingPushRef.current = false;
                    void pushCurrentPixelsRef.current();
                }
            }
        }
    }, [frameName, url]);

    const pushCurrentPixelsRef = useRef(pushCurrentPixels);
    pushCurrentPixelsRef.current = pushCurrentPixels;

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            clearRetryTimers();
        };
    }, [clearRetryTimers]);

    useEffect(() => {
        frameGenerationRef.current += 1;
        inFlightRef.current = false;
        pendingPushRef.current = false;
        hasLivePushSinceLoadRef.current = false;
        latestPixelsRef.current = null;
        setIsConnected(false);
        clearRetryTimers();
    }, [url, reloadNonce, clearRetryTimers]);

    useImperativeHandle(bridgeRef, () => ({
        pushNeoPixels: (pixels: Uint32Array) => {
            hasLivePushSinceLoadRef.current = true;
            clearRetryTimers();
            const cached = latestPixelsRef.current;
            if (cached && cached.length === pixels.length) {
                cached.set(pixels);
            } else {
                latestPixelsRef.current = new Uint32Array(pixels);
            }
            void pushCurrentPixels();
        },
        clearNeoPixels: (pixelCount?: number) => {
            if (latestPixelsRef.current && (!pixelCount || latestPixelsRef.current.length === pixelCount)) {
                latestPixelsRef.current.fill(0);
            } else if (pixelCount && pixelCount > 0) {
                latestPixelsRef.current = new Uint32Array(pixelCount);
            }
            void pushCurrentPixels();
        },
        pushSerialData: (text: string) => {
            void deliverSerialDataToCustomView({
                frameName,
                targetUrl: url,
                targetWindow: iframeRef.current?.contentWindow,
                text,
            });
        },
    }), [clearRetryTimers, frameName, pushCurrentPixels, url]);

    const handleIframeLoad = useCallback(() => {
        clearRetryTimers();
        hasLivePushSinceLoadRef.current = false;
        if (initialPixelCount && initialPixelCount > 0) {
            if (!latestPixelsRef.current || latestPixelsRef.current.length !== initialPixelCount) {
                latestPixelsRef.current = new Uint32Array(initialPixelCount);
            }
        }

        void pushCurrentPixels();

        for (const delayMs of HANDSHAKE_RETRY_DELAYS_MS) {
            const timer = setTimeout(() => {
                if (!mountedRef.current || hasLivePushSinceLoadRef.current) return;
                void pushCurrentPixelsRef.current();
            }, delayMs);
            retryTimersRef.current.push(timer);
        }
    }, [clearRetryTimers, initialPixelCount, pushCurrentPixels]);

    // Respond if the embedded view posts `{ app: 'wokwi', command: 'listen' }`
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const targetWindow = iframeRef.current?.contentWindow;
            if (!event.source || !targetWindow || event.source !== targetWindow) return;
            if (!isWokwiListenMessage(event.data)) return;
            void pushCurrentPixels();
        };
        globalThis.addEventListener('message', handleMessage);
        return () => globalThis.removeEventListener('message', handleMessage);
    }, [pushCurrentPixels]);

    let statusLabel = 'Ready';
    if (isPlaying) {
        statusLabel = 'Streaming NeoPixels';
    } else if (isConnected) {
        statusLabel = 'Connected';
    }

    let statusDotClass = 'bg-slate-400';
    if (isPlaying) {
        statusDotClass = 'bg-emerald-400 animate-pulse';
    } else if (isConnected) {
        statusDotClass = 'bg-emerald-400';
    }

    return (
        <div className="flex flex-col flex-1 w-full h-full bg-[#0b0d12] overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-vscode-surface border-b border-vscode-border text-[11px] shrink-0">
                <span
                    className={[
                        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-medium',
                        isPlaying || isConnected
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                            : 'bg-vscode-input text-vscode-text opacity-75 border border-vscode-border',
                    ].join(' ')}
                >
                    <span
                        className={[
                            'w-1.5 h-1.5 rounded-full',
                            statusDotClass,
                        ].join(' ')}
                    />
                    {statusLabel}
                </span>

                <span className="font-mono text-vscode-text opacity-75 truncate" title={url}>
                    {url}
                </span>

                <div className="flex-1" />

                <button
                    type="button"
                    onClick={() => setReloadNonce((n) => n + 1)}
                    title="Reload Custom View"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-vscode-text hover:text-vscode-textActive hover:bg-vscode-hover transition-colors"
                >
                    <RefreshCw size={12} />
                    Reload
                </button>

                <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    title="Open URL in default browser"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-vscode-text opacity-75 hover:opacity-100 hover:bg-vscode-hover transition-colors"
                >
                    <ExternalLink size={12} />
                </a>
            </div>

            <iframe
                key={frameName}
                ref={iframeRef}
                name={frameName}
                src={url}
                title="Wokwi Custom View"
                allow="autoplay; fullscreen; xr-spatial-tracking"
                onLoad={handleIframeLoad}
                className="flex-1 w-full h-full border-0 bg-[#0b0d12]"
            />
        </div>
    );
});

export default CustomViewFrame;
