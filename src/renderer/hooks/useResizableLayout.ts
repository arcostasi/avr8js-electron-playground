import { useEffect, useRef } from 'react';
import Split from 'split.js';

interface ResizableLayoutOptions {
    sizes: number[];
    minSize: number[];
    direction?: 'horizontal' | 'vertical';
    gutterSize?: number;
    enabled: boolean;
}

/**
 * Custom hook to abstract Split.js away from React render cycle.
 * Mounts SplitJS instances dynamically matching the provided DOM selectors.
 */
export function useResizableLayout(
    selectors: string[],
    options: ResizableLayoutOptions
) {
    const splitRef = useRef<Split.Instance | null>(null);

    useEffect(() => {
        if (!options.enabled) {
            if (splitRef.current) {
                splitRef.current.destroy();
                splitRef.current = null;
            }
            return;
        }

        // Wait a tick for React to render the DOM nodes before initializing SplitJS
        const timeout = setTimeout(() => {
            // Check if all elements exist
            const allElementsExist = selectors.every(s => document.querySelector(s));
            if (!allElementsExist) return;

            splitRef.current = Split(selectors, {
                sizes: options.sizes,
                minSize: options.minSize,
                direction: options.direction || 'horizontal',
                gutterSize: options.gutterSize || 4,
                cursor: options.direction === 'vertical' ? 'row-resize' : 'col-resize',
            });
        }, 0);

        return () => {
            clearTimeout(timeout);
            if (splitRef.current) {
                splitRef.current.destroy();
                splitRef.current = null;
            }
        };
    }, [options.enabled, ...selectors]); // Re-run if enabled status or selectors change
}
