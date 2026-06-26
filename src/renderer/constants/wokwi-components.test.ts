import { describe, expect, it } from 'vitest';

import { boardProfiles } from '../../shared/avr/profiles';
import { COMMON_COMPONENTS } from './wokwi-components';

describe('wokwi-components', () => {
    it('includes every registered AVR board in the common component catalog', () => {
        for (const profile of boardProfiles) {
            expect(COMMON_COMPONENTS).toContainEqual(
                expect.objectContaining({ type: profile.wokwiType, label: profile.name }),
            );
        }
    });

    it('does not duplicate board component entries', () => {
        const registeredBoardTypes = new Set(boardProfiles.map((profile) => profile.wokwiType));
        const catalogBoardTypes = COMMON_COMPONENTS
            .filter((component) => registeredBoardTypes.has(component.type))
            .map((component) => component.type);

        expect(new Set(catalogBoardTypes).size).toBe(registeredBoardTypes.size);
        expect(catalogBoardTypes.length).toBe(registeredBoardTypes.size);
    });

    it('registers the customizable Dot Matrix RGB component with default dimensions', () => {
        expect(COMMON_COMPONENTS).toContainEqual(
            expect.objectContaining({
                type: 'dot-matrix-react',
                label: 'Dot Matrix RGB',
                attrs: {
                    rows: '16',
                    cols: '16',
                    dotSize: '24',
                    dotGap: '4',
                },
            }),
        );
    });

    it('registers valid wokwi-ks2e-m-dc5 relay tag and removes nonexistent wokwi-relay-module', () => {
        expect(COMMON_COMPONENTS).toContainEqual(
            expect.objectContaining({ type: 'wokwi-ks2e-m-dc5' }),
        );
        expect(COMMON_COMPONENTS.some((c) => c.type === 'wokwi-relay-module')).toBe(false);
    });
});
