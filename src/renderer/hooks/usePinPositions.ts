/**
 * usePinPositions
 * Caches pin info from Wokwi custom elements and computes canvas-space pin positions.
 * Rotation is fully accounted for: pin offsets are rotated around the element top-left.
 */
import { useRef, useEffect, useMemo, useState } from 'react';
import type { WokwiDiagram, PinPosition, PinInfo } from '../types/wokwi.types';

/**
 * Rotate a 2-D vector (dx, dy) by angleDeg degrees (clockwise, matching CSS
 * `transform: rotate()`).
 */
function rotatePinOffset(dx: number, dy: number, angleDeg: number): { x: number; y: number } {
    if (!angleDeg) return { x: dx, y: dy };
    const rad = (angleDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return {
        x: dx * cos - dy * sin,
        y: dx * sin + dy * cos,
    };
}

/** What we store per part in the cache — pins plus the element's natural dimensions */
interface CachedPinData {
    pins: PinInfo[];
    /** Natural (unrotated) width of the element in pixels */
    width: number;
    /** Natural (unrotated) height of the element in pixels */
    height: number;
}

function clonePins(pins: PinInfo[]): PinInfo[] {
    return pins.map((pin) => ({ ...pin }));
}

function samePins(a: PinInfo[], b: PinInfo[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i].name !== b[i].name || a[i].x !== b[i].x || a[i].y !== b[i].y) {
            return false;
        }
    }
    return true;
}

function sameCachedPinData(a: CachedPinData | undefined, b: CachedPinData): boolean {
    if (!a) return false;
    return a.width === b.width && a.height === b.height && samePins(a.pins, b.pins);
}

function readElementPinData(el: HTMLElement & { pinInfo?: PinInfo[] }): CachedPinData | null {
    if (!el?.pinInfo || !Array.isArray(el.pinInfo)) return null;
    return {
        pins: clonePins(el.pinInfo),
        width: el.offsetWidth,
        height: el.offsetHeight,
    };
}

function collectPartElements(diagram: WokwiDiagram): Record<string, HTMLElement & { pinInfo?: PinInfo[] }> {
    const elements: Record<string, HTMLElement & { pinInfo?: PinInfo[] }> = {};
    for (const part of diagram.parts) {
        const element = document.getElementById(part.id) as (HTMLElement & { pinInfo?: PinInfo[] }) | null;
        if (element) {
            elements[part.id] = element;
        }
    }
    return elements;
}

function getPartCacheKey(part: WokwiDiagram['parts'][number]): string {
    return `${part.id}:${part.type}:${JSON.stringify(part.attrs ?? {})}`;
}

/**
 * Reads pin info from the DOM (Wokwi custom elements expose `.pinInfo`),
 * caches it per part, and returns a memoized map of pinId → canvas position.
 *
 * Cache key format: `${partId}:${partType}:${attrs}` so a part with the same ID
 * across different projects/types/configs is never reused with stale pin offsets.
 */
export function usePinPositions(diagram?: WokwiDiagram, projectKey?: string): Record<string, PinPosition> {
    /**
     * Counter incremented each time the post-commit effect populates the cache.
     * MUST be captured (not discarded with [,]) so we can add it to the
     * pinPositions useMemo dependency array — without it the memo never
     * recomputes after the effect fires, which is the true root cause of the
     * "need to click twice to see wires" bug.
     */
    const [pinTick, setPinTick] = useState(0);

    // Cache keyed by "partId:partType:attrs" — stores pins AND unrotated element dimensions.
    // Rotation changes don't need to bust the cache because we always re-apply rotation
    // from the raw (unrotated) pin data at render time.
    const pinInfoCache = useRef<Record<string, CachedPinData>>({});
    const prevProjectKeyRef = useRef<string | undefined>(projectKey);
    const isProjectTransition = prevProjectKeyRef.current !== projectKey;
    if (isProjectTransition) {
        prevProjectKeyRef.current = projectKey;
        pinInfoCache.current = {};
    }

    /**
     * Stable string that encodes IDENTITY + ROTATION of every part.
     * Including rotation here ensures the `pinPositions` useMemo (which performs
     * the rotation maths) recomputes whenever a part is rotated, without having
     * to re-read pinInfo from the DOM.
     */
    const partsKey = useMemo(
        () =>
            diagram?.parts
                .map(p => `${p.id}:${p.type}:${p.rotate ?? 0}:${JSON.stringify(p.attrs ?? {})}`)
                .join(',') ?? '',
        [diagram?.parts],
    );

    // Synchronous pin position calculator — runs during render.
    // pinTick is in the dep array so this recomputes whenever the post-commit
    // effect has freshly populated the cache with newly mounted elements.
    const pinPositions = useMemo(() => {
        const positions: Record<string, PinPosition> = {};
        if (!diagram) return positions;

        diagram.parts.forEach(part => {
            const cacheKey = getPartCacheKey(part);
            let cached = pinInfoCache.current[cacheKey];

            if (!cached && !isProjectTransition) {
                // Only touch the DOM when a part is missing from cache (never during a project switch or drag frame)
                const element = document.getElementById(part.id) as (HTMLElement & { pinInfo?: PinInfo[] }) | null;
                const fresh = element ? readElementPinData(element) : null;
                if (fresh) {
                    cached = fresh;
                    pinInfoCache.current[cacheKey] = cached;
                }
            }
            if (!cached) return;

            const { pins, width, height } = cached;
            const angle = part.rotate ?? 0;

            pins.forEach(pin => {
                // Must match PartRenderer transformOrigin ('top left') so pads stay
                // attached to the component while rotating.
                const { x: rx, y: ry } = rotatePinOffset(pin.x, pin.y, angle);

                // Determine exit direction from pin position relative to element bounds.
                // Threshold: within 18% of an edge → exits from that face.
                const EDGE = 0.18;
                let edx = 0, edy = 0;
                const relX = width  > 0 ? pin.x / width  : 0.5;
                const relY = height > 0 ? pin.y / height : 0.5;
                if      (relY < EDGE)       { edy = -1; }  // top face → exits upward
                else if (relY > 1 - EDGE)   { edy = +1; }  // bottom face → exits downward
                else if (relX < EDGE)       { edx = -1; }  // left face → exits left
                else if (relX > 1 - EDGE)   { edx = +1; }  // right face → exits right

                // Rotate the exit direction by the same angle as the component
                const { x: rex, y: rey } = rotatePinOffset(edx, edy, angle);

                positions[`${part.id}:${pin.name}`] = {
                    x: part.left + rx,
                    y: part.top + ry,
                    ex: rex,
                    ey: rey,
                };
            });
        });
        return positions;
    }, [diagram, isProjectTransition, partsKey, pinTick, projectKey]);

    const diagramRef = useRef(diagram);
    diagramRef.current = diagram;
    const hasDiagram = Boolean(diagram);

    /**
     * Post-commit DOM read — runs AFTER structural part additions/removals/rotations,
     * project switches, or attribute changes, skipping position-only drag updates.
     */
    useEffect(() => {
        const currentDiagram = diagramRef.current;
        if (!currentDiagram) return undefined;

        // Evict cache entries that are no longer valid:
        //   - parts removed from the diagram
        //   - parts whose type or attrs changed
        const validKeys = new Set(currentDiagram.parts.map(getPartCacheKey));
        for (const key of Object.keys(pinInfoCache.current)) {
            if (!validKeys.has(key)) {
                delete pinInfoCache.current[key];
            }
        }

        const refreshCacheFromLiveDom = () => {
            const elementsById = collectPartElements(currentDiagram);
            let changed = false;
            currentDiagram.parts.forEach(part => {
                const cacheKey = getPartCacheKey(part);
                const fresh = elementsById[part.id] ? readElementPinData(elementsById[part.id]) : null;
                if (!fresh) return;

                if (!sameCachedPinData(pinInfoCache.current[cacheKey], fresh)) {
                    pinInfoCache.current[cacheKey] = fresh;
                    changed = true;
                }
            });
            if (changed) {
                setPinTick(n => n + 1);
            }
        };

        const rafId = globalThis.requestAnimationFrame(refreshCacheFromLiveDom);
        const timerShort = globalThis.setTimeout(refreshCacheFromLiveDom, 60);
        const timerLong = globalThis.setTimeout(refreshCacheFromLiveDom, 160);
        return () => {
            globalThis.cancelAnimationFrame(rafId);
            globalThis.clearTimeout(timerShort);
            globalThis.clearTimeout(timerLong);
        };
    }, [hasDiagram, partsKey, projectKey]);

    return pinPositions;
}
