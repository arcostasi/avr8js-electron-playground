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

/**
 * Reads pin info from the DOM (Wokwi custom elements expose `.pinInfo`),
 * caches it per part, and returns a memoized map of pinId → canvas position.
 *
 * Cache key format: `${partId}:${partType}` so a part with the same ID but
 * a different type (user swapped the component) is correctly re-read.
 */
export function usePinPositions(diagram?: WokwiDiagram): Record<string, PinPosition> {
    /**
     * Counter incremented each time the post-commit effect populates the cache.
     * MUST be captured (not discarded with [,]) so we can add it to the
     * pinPositions useMemo dependency array — without it the memo never
     * recomputes after the effect fires, which is the true root cause of the
     * "need to click twice to see wires" bug.
     */
    const [pinTick, setPinTick] = useState(0);

    // Cache keyed by "partId:partType" — stores pins AND unrotated element dimensions.
    // Rotation changes don't need to bust the cache because we always re-apply rotation
    // from the raw (unrotated) pin data at render time.
    const pinInfoCache = useRef<Record<string, CachedPinData>>({});

    /**
     * Stable string that encodes IDENTITY + ROTATION of every part.
     * Including rotation here ensures the `pinPositions` useMemo (which performs
     * the rotation maths) recomputes whenever a part is rotated, without having
     * to re-read pinInfo from the DOM.
     */
    const partsKey = useMemo(
        () =>
            diagram?.parts
                .map(p => `${p.id}:${p.type}:${p.rotate ?? 0}`)
                .join(',') ?? '',
        [diagram?.parts],
    );

    // Synchronous pin position calculator — runs during render.
    // pinTick is in the dep array so this recomputes whenever the post-commit
    // effect has freshly populated the cache with newly mounted elements.
    const pinPositions = useMemo(() => {
        const positions: Record<string, PinPosition> = {};
        if (!diagram) return positions;
        const elementsById = collectPartElements(diagram);

        diagram.parts.forEach(part => {
            const cacheKey = `${part.id}:${part.type}`;
            let cached = pinInfoCache.current[cacheKey];
            const element = elementsById[part.id];

            if (cached) {
                // Custom chip pin layouts can change even when the diagram shape doesn't,
                // for example after manifest edits or delayed pinInfo registration.
                const fresh = element ? readElementPinData(element) : null;
                if (fresh && !sameCachedPinData(cached, fresh)) {
                    cached = fresh;
                    pinInfoCache.current[cacheKey] = cached;
                }
            } else {
                // Elements from the PREVIOUS render are already in the DOM —
                // try to read pinInfo synchronously before the commit.
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
    }, [diagram, partsKey, pinTick]);

    /**
     * Post-commit DOM read — runs AFTER the new elements have been added to the DOM.
     *
     * BUG FIX: previously depended on `diagram?.parts.length`, so it did NOT
     * re-run when switching between projects that had the same number of parts.
     * Now depends on `partsKey` (id + type per part) which changes whenever the
     * actual set of parts changes, regardless of count.
     */
    useEffect(() => {
        if (!diagram) return;
        const elementsById = collectPartElements(diagram);

        // Evict cache entries that are no longer valid:
        //   - parts removed from the diagram
        //   - parts whose type changed (same id, different type)
        const validKeys = new Set(diagram.parts.map(p => `${p.id}:${p.type}`));
        for (const key of Object.keys(pinInfoCache.current)) {
            if (!validKeys.has(key)) {
                delete pinInfoCache.current[key];
            }
        }

        // After commit, refresh cache entries from the live DOM. This must run even
        // when the diagram object is unchanged, because custom chip manifests and
        // attrs can change the exposed pin layout independently from diagram parts.
        const timer = setTimeout(() => {
            let changed = false;
            diagram.parts.forEach(part => {
                const cacheKey = `${part.id}:${part.type}`;
                const fresh = elementsById[part.id] ? readElementPinData(elementsById[part.id]) : null;
                if (!fresh) return;

                if (!sameCachedPinData(pinInfoCache.current[cacheKey], fresh)) {
                    pinInfoCache.current[cacheKey] = fresh;
                    changed = true;
                }
            });
            // Force a re-render so pinPositions is recomputed with the full cache
            if (changed) {
                setPinTick(n => n + 1);
            }
        }, 150);
        return () => clearTimeout(timer);
    });

    return pinPositions;
}
