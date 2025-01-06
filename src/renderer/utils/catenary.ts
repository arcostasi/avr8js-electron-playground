/**
 * Catenary Wire Physics
 * Calculates SVG cubic bezier paths that simulate physical cable droop.
 */
import type { PinPosition } from '../types/wokwi.types';

/**
 * Builds a catenary-style SVG path between two pin positions.
 * Simulates gravity sag using cubic bezier curves.
 */
export function buildCatenaryPath(start: PinPosition, end: PinPosition): string {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dist = Math.hypot(dx, dy);

    // Sag increases with distance, min 15px droop for short wires
    const sag = Math.max(15, dist * 0.25);

    // Midpoint of the cable (gravity pulls down)
    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2 + sag;

    // Two control points for a smooth cubic bezier catenary
    const cp1x = start.x + dx * 0.2;
    const cp1y = start.y + sag * 0.8;
    const cp2x = end.x - dx * 0.2;
    const cp2y = end.y + sag * 0.8;

    return [
        `M ${start.x} ${start.y}`,
        `C ${cp1x} ${cp1y}, ${midX} ${midY}, ${midX} ${midY}`,
        `S ${cp2x} ${cp2y}, ${end.x} ${end.y}`,
    ].join(' ');
}

/**
 * Builds a lighter catenary path for the "in-progress" wiring preview.
 * Uses less sag for a more responsive feel.
 */
export function buildTempCatenaryPath(start: PinPosition, end: PinPosition): string {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dist = Math.hypot(dx, dy);

    const sag = Math.max(10, dist * 0.2);

    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2 + sag;

    const cp1x = start.x + dx * 0.2;
    const cp1y = start.y + sag * 0.7;
    const cp2x = end.x - dx * 0.2;
    const cp2y = end.y + sag * 0.7;

    return [
        `M ${start.x} ${start.y}`,
        `C ${cp1x} ${cp1y}, ${midX} ${midY}, ${midX} ${midY}`,
        `S ${cp2x} ${cp2y}, ${end.x} ${end.y}`,
    ].join(' ');
}
