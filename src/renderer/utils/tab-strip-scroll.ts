export interface TabStripItemMetrics {
    left: number;
    width: number;
}

export interface TabStripScrollInput {
    direction: 'left' | 'right';
    currentScrollLeft: number;
    clientWidth: number;
    scrollWidth: number;
    items: TabStripItemMetrics[];
    tolerance?: number;
}

export interface TabStripRevealInput {
    currentScrollLeft: number;
    clientWidth: number;
    scrollWidth: number;
    item: TabStripItemMetrics;
    tolerance?: number;
}

export function computeNextTabStripScrollLeft(input: TabStripScrollInput): number {
    const tolerance = input.tolerance ?? 1;
    const maxScrollLeft = Math.max(0, Math.ceil(input.scrollWidth - input.clientWidth));
    if (input.items.length === 0 || maxScrollLeft <= 0 || input.clientWidth <= 0) {
        return 0;
    }

    const viewportStart = Math.min(Math.max(0, input.currentScrollLeft), maxScrollLeft);
    const viewportEnd = viewportStart + input.clientWidth;

    if (input.direction === 'right') {
        const nextItem = input.items.find((item) => item.left + item.width > viewportEnd + tolerance);
        if (!nextItem) {
            return maxScrollLeft;
        }
        const target = nextItem.width > input.clientWidth && viewportStart < nextItem.left - tolerance
            ? nextItem.left
            : nextItem.left + nextItem.width - input.clientWidth;
        return Math.min(maxScrollLeft, Math.max(0, Math.ceil(target)));
    }

    let prevItem: TabStripItemMetrics | undefined;
    for (let index = input.items.length - 1; index >= 0; index -= 1) {
        if (input.items[index].left < viewportStart - tolerance) {
            prevItem = input.items[index];
            break;
        }
    }
    if (!prevItem) {
        return 0;
    }
    const target = prevItem.width > input.clientWidth && viewportEnd > prevItem.left + prevItem.width + tolerance
        ? prevItem.left + prevItem.width - input.clientWidth
        : prevItem.left;
    return Math.min(maxScrollLeft, Math.max(0, Math.floor(target)));
}

export function computeScrollLeftToRevealTabItem(input: TabStripRevealInput): number | null {
    const tolerance = input.tolerance ?? 1;
    const maxScrollLeft = Math.max(0, Math.ceil(input.scrollWidth - input.clientWidth));
    if (maxScrollLeft <= 0 || input.clientWidth <= 0) {
        return null;
    }

    const viewportStart = Math.min(Math.max(0, input.currentScrollLeft), maxScrollLeft);
    const viewportEnd = viewportStart + input.clientWidth;
    const itemLeft = input.item.left;
    const itemRight = itemLeft + input.item.width;

    if (itemLeft >= viewportStart - tolerance && itemRight <= viewportEnd + tolerance) {
        return null;
    }

    if (input.item.width > input.clientWidth || itemLeft < viewportStart - tolerance) {
        return Math.min(maxScrollLeft, Math.max(0, Math.floor(itemLeft)));
    }

    return Math.min(maxScrollLeft, Math.max(0, Math.ceil(itemRight - input.clientWidth)));
}
