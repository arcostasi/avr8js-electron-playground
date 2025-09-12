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
});
