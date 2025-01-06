/**
 * usePinPositions
 * Caches pin info from Wokwi custom elements and computes canvas-space pin positions.
 */
import { useRef, useEffect, useMemo, useState } from 'react';
import type { WokwiDiagram, PinPosition, PinInfo } from '../types/wokwi.types';

/**
 * Reads pin info from the DOM (Wokwi custom elements expose `.pinInfo`),
 * caches it per part, and returns a memoized map of pinId → canvas position.
 */
export function usePinPositions(diagram?: WokwiDiagram): Record<string, PinPosition> {
    // Dummy state to force re-render when pinInfo cache populates
    const [, setPinPositionTrigger] = useState(0);

    // Pin info cache: read from DOM once per part, reuse for all subsequent renders
    const pinInfoCache = useRef<Record<string, PinInfo[]>>({});

    // Synchronous pin position calculator
    const pinPositions = useMemo(() => {
        const positions: Record<string, PinPosition> = {};
        if (!diagram) return positions;

        diagram.parts.forEach(part => {
            let pins = pinInfoCache.current[part.id];
            if (!pins) {
                const el = document.getElementById(part.id) as HTMLElement & { pinInfo?: PinInfo[] };
                if (el?.pinInfo && Array.isArray(el.pinInfo)) {
                    pins = el.pinInfo;
                    pinInfoCache.current[part.id] = pins;
                }
            }
            if (!pins) return;

            pins.forEach(pin => {
                positions[`${part.id}:${pin.name}`] = {
                    x: part.left + pin.x,
                    y: part.top + pin.y,
                };
            });
        });
        return positions;
    }, [diagram]);

    // Initial pinInfo population — reads from DOM after elements render
    useEffect(() => {
        if (!diagram) return;
        const timer = setTimeout(() => {
            let changed = false;
            diagram.parts.forEach(part => {
                if (!pinInfoCache.current[part.id]) {
                    const el = document.getElementById(part.id) as HTMLElement & { pinInfo?: PinInfo[] };
                    if (el?.pinInfo && Array.isArray(el.pinInfo)) {
                        pinInfoCache.current[part.id] = el.pinInfo;
                        changed = true;
                    }
                }
            });
            // Force a re-render to pick up newly cached pinInfo
            if (changed) {
                setPinPositionTrigger(n => n + 1);
            }
        }, 150);
        return () => clearTimeout(timer);
    }, [diagram?.parts.length]);

    return pinPositions;
}
