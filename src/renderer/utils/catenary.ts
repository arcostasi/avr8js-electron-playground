/**
 * Catenary Wire Routing
 *
 * Each pin carries an exit unit vector (ex, ey) computed by usePinPositions
 * from the pin's position relative to its component face and the component's
 * rotation.  The cubic bezier uses that vector as the tangent at each endpoint
 * so every wire departs perpendicular to the component face — wires coming
 * from the top of a display exit upward before arcing down to their target.
 *
 * A gravity-downward sag bias is addded on top of the exit tangent so the
 * middle of the wire droops naturally for long runs.
 */
import type { PinPosition } from '../types/wokwi.types';

/** Minimum and maximum tangent arm length (pixels). */
const MIN_ARM = 35;
const MAX_ARM = 180;

/**
 * Returns the gravity-biased perpendicular of the wire unit vector (ux, uy).
 * Used as a secondary sag offset when both pins lack exit direction info.
 */
function sagPerp(ux: number, uy: number): [number, number] {
    // left-hand perp Y = ux ;  right-hand perp Y = -ux
    // pick whichever has the larger (more downward) Y component
    const lyDown = ux >= 0;
    const [px, py] = lyDown ? [-uy, ux] : [uy, -ux];
    if (py === 0) return [0, 1]; // horizontal wire → pure downward bow
    return py >= 0 ? [px, py] : [-px, -py];
}

/**
 * Builds a wire path between two pin positions.
 *
 * If a pin carries an exit direction (ex, ey), the control point is placed
 * along that direction for a "lift off" distance, ensuring the wire clears
 * the component face.  Both CPs also get a small gravity-downward offset so
 * the wire droops realistically in open space.
 */
export function buildCatenaryPath(start: PinPosition, end: PinPosition): string {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 2) return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;

    const ux = dx / dist;
    const uy = dy / dist;

    // Arm length: how far the CP travels away from its pin before curving.
    // Longer for longer wires so the exit is always visible.
    const arm = Math.min(MAX_ARM, Math.max(MIN_ARM, dist * 0.42));

    // Gravity sag applied at both CPs (downward bias in screen space)
    const sag = Math.min(100, Math.max(20, dist * 0.22));
    const [sgx, sgy] = sagPerp(ux, uy);

    // CP1 — exits from the start pin
    // If the pin has a known face direction, use it; otherwise use wire direction.
    const s_ex = start.ex ?? ux;
    const s_ey = start.ey ?? uy;
    const cp1x = start.x + s_ex * arm + sgx * sag * 0.4;
    const cp1y = start.y + s_ey * arm + sgy * sag * 0.4;

    // CP2 — approaches the end pin from outside its component face.
    // Use the same exit direction (not negated) so the wire arrives from outside.
    const e_ex = end.ex !== undefined ?  end.ex : -ux;
    const e_ey = end.ey !== undefined ?  end.ey : -uy;
    const cp2x = end.x + e_ex * arm + sgx * sag * 0.4;
    const cp2y = end.y + e_ey * arm + sgy * sag * 0.4;

    return `M ${start.x} ${start.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${end.x} ${end.y}`;
}

/**
 * Lighter path for the in-progress wiring preview.
 * Uses smaller sag/arm so the preview feels responsive and precise.
 */
export function buildTempCatenaryPath(start: PinPosition, end: PinPosition): string {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 2) return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;

    const ux = dx / dist;
    const uy = dy / dist;
    const arm = Math.min(100, Math.max(25, dist * 0.32));
    const sag = Math.min(60,  Math.max(10, dist * 0.16));
    const [sgx, sgy] = sagPerp(ux, uy);

    const s_ex = start.ex ?? ux;
    const s_ey = start.ey ?? uy;
    const cp1x = start.x + s_ex * arm + sgx * sag * 0.3;
    const cp1y = start.y + s_ey * arm + sgy * sag * 0.3;

    const e_ex = end.ex !== undefined ?  end.ex : -ux;
    const e_ey = end.ey !== undefined ?  end.ey : -uy;
    const cp2x = end.x + e_ex * arm + sgx * sag * 0.3;
    const cp2y = end.y + e_ey * arm + sgy * sag * 0.3;

    return `M ${start.x} ${start.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${end.x} ${end.y}`;
}
