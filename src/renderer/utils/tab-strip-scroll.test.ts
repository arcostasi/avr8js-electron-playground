import { describe, expect, it } from 'vitest';
import {
    computeNextTabStripScrollLeft,
    computeScrollLeftToRevealTabItem,
    type TabStripItemMetrics,
} from './tab-strip-scroll';

describe('computeNextTabStripScrollLeft', () => {
    it('reveals the entire partially cut-off next tab in a single right click without skipping it', () => {
        const items: TabStripItemMetrics[] = [
            { left: 0, width: 200 },
            { left: 200, width: 220 }, // cut off at x=300; ends at 420
            { left: 420, width: 180 }, // ends at 600
        ];
        const firstStep = computeNextTabStripScrollLeft({
            direction: 'right',
            currentScrollLeft: 0,
            clientWidth: 300,
            scrollWidth: 600,
            items,
        });
        expect(firstStep).toBe(120); // 420 - 300: reveals full second tab

        const secondStep = computeNextTabStripScrollLeft({
            direction: 'right',
            currentScrollLeft: firstStep,
            clientWidth: 300,
            scrollWidth: 600,
            items,
        });
        expect(secondStep).toBe(300); // 600 - 300: reveals full third tab and clamps at maxScrollLeft
    });

    it('handles fractional DPI measurements without under-scrolling the revealed tab', () => {
        const items: TabStripItemMetrics[] = [
            { left: 0, width: 150.4 },
            { left: 150.4, width: 220.6 }, // right edge 371.0
        ];
        const nextLeft = computeNextTabStripScrollLeft({
            direction: 'right',
            currentScrollLeft: 0,
            clientWidth: 300.4,
            scrollWidth: 371.0,
            items,
        });
        expect(nextLeft).toBe(71); // Math.ceil(371.0 - 300.4)
    });

    it('reveals the entire partially cut-off previous tab when scrolling left and clamps at 0', () => {
        const items: TabStripItemMetrics[] = [
            { left: 0, width: 180 },
            { left: 180, width: 220 },
            { left: 400, width: 200 },
        ];
        const firstBack = computeNextTabStripScrollLeft({
            direction: 'left',
            currentScrollLeft: 300,
            clientWidth: 300,
            scrollWidth: 600,
            items,
        });
        expect(firstBack).toBe(180);

        const secondBack = computeNextTabStripScrollLeft({
            direction: 'left',
            currentScrollLeft: firstBack,
            clientWidth: 300,
            scrollWidth: 600,
            items,
        });
        expect(secondBack).toBe(0);
    });

    it('aligns start first and end second for an oversized tab wider than the viewport', () => {
        const items: TabStripItemMetrics[] = [
            { left: 0, width: 150 },
            { left: 150, width: 400 }, // wider than clientWidth=250; ends at 550
        ];
        const alignStart = computeNextTabStripScrollLeft({
            direction: 'right',
            currentScrollLeft: 0,
            clientWidth: 250,
            scrollWidth: 550,
            items,
        });
        expect(alignStart).toBe(150);

        const alignEnd = computeNextTabStripScrollLeft({
            direction: 'right',
            currentScrollLeft: alignStart,
            clientWidth: 250,
            scrollWidth: 550,
            items,
        });
        expect(alignEnd).toBe(300);
    });

    it('returns 0 for empty items or non-overflowing tab strips', () => {
        expect(computeNextTabStripScrollLeft({
            direction: 'right',
            currentScrollLeft: 0,
            clientWidth: 400,
            scrollWidth: 400,
            items: [{ left: 0, width: 200 }],
        })).toBe(0);

        expect(computeNextTabStripScrollLeft({
            direction: 'right',
            currentScrollLeft: 0,
            clientWidth: 400,
            scrollWidth: 600,
            items: [],
        })).toBe(0);
    });
});

describe('computeScrollLeftToRevealTabItem', () => {
    it('returns null when the entire tab is already visible', () => {
        expect(computeScrollLeftToRevealTabItem({
            currentScrollLeft: 100,
            clientWidth: 300,
            scrollWidth: 600,
            item: { left: 120, width: 180 },
        })).toBeNull();
    });

    it('scrolls right just enough to reveal a tab clipped on the right including fractional pixels', () => {
        expect(computeScrollLeftToRevealTabItem({
            currentScrollLeft: 0,
            clientWidth: 300.2,
            scrollWidth: 600,
            item: { left: 180, width: 160.5 }, // right edge 340.5
        })).toBe(41); // Math.ceil(340.5 - 300.2)
    });

    it('scrolls left to reveal a tab clipped on the left edge', () => {
        expect(computeScrollLeftToRevealTabItem({
            currentScrollLeft: 200,
            clientWidth: 300,
            scrollWidth: 600,
            item: { left: 150.7, width: 180 },
        })).toBe(150); // Math.floor(150.7)
    });

    it('aligns an oversized tab wider than the viewport to its left edge', () => {
        expect(computeScrollLeftToRevealTabItem({
            currentScrollLeft: 50,
            clientWidth: 250,
            scrollWidth: 700,
            item: { left: 200, width: 340 },
        })).toBe(200);
    });
});
