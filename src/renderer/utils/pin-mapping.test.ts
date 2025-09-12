import { describe, expect, it } from 'vitest';
import type { AVRIOPort } from 'avr8js';

import {
    arduinoMegaBoardProfile,
    arduinoNanoBoardProfile,
    arduinoUnoBoardProfile,
} from '../../shared/avr/profiles';
import { getADCChannel, getPortAndBit } from './pin-mapping';

function createFakePort(): AVRIOPort {
    return {
        pinState: (): 0 => 0,
        setPin: (): void => undefined,
    } as unknown as AVRIOPort;
}

describe('pin-mapping', () => {
    it('preserves Uno mapping with legacy port keys', () => {
        const portB = createFakePort();
        const portC = createFakePort();
        const portD = createFakePort();

        expect(getPortAndBit('13', { portB, portC, portD }, arduinoUnoBoardProfile)).toEqual({ port: portB, bit: 5 });
        expect(getPortAndBit('A5', { portB, portC, portD }, arduinoUnoBoardProfile)).toEqual({ port: portC, bit: 5 });
        expect(getADCChannel('A5', arduinoUnoBoardProfile)).toBe(5);
    });

    it('supports Mega extended digital and analog aliases with profile-style port keys', () => {
        const ports = {
            A: createFakePort(),
            B: createFakePort(),
            C: createFakePort(),
            D: createFakePort(),
            E: createFakePort(),
            F: createFakePort(),
            G: createFakePort(),
            H: createFakePort(),
            J: createFakePort(),
            K: createFakePort(),
            L: createFakePort(),
        };

        expect(getPortAndBit('53', ports, arduinoMegaBoardProfile)).toEqual({ port: ports.B, bit: 0 });
        expect(getPortAndBit('D53', ports, arduinoMegaBoardProfile)).toEqual({ port: ports.B, bit: 0 });
        expect(getPortAndBit('A15', ports, arduinoMegaBoardProfile)).toEqual({ port: ports.K, bit: 7 });
        expect(getPortAndBit('69', ports, arduinoMegaBoardProfile)).toEqual({ port: ports.K, bit: 7 });
        expect(getPortAndBit('D3', ports, arduinoMegaBoardProfile)).toEqual({ port: ports.E, bit: 5 });
        expect(getPortAndBit('D8', ports, arduinoMegaBoardProfile)).toEqual({ port: ports.H, bit: 5 });
        expect(getPortAndBit('D44', ports, arduinoMegaBoardProfile)).toEqual({ port: ports.L, bit: 5 });
        expect(getADCChannel('A15', arduinoMegaBoardProfile)).toBe(15);
        expect(getADCChannel('69', arduinoMegaBoardProfile)).toBe(15);
    });

    it('keeps analog-only Nano pins readable through ADC but not as GPIO', () => {
        const portB = createFakePort();
        const portC = createFakePort();
        const portD = createFakePort();

        expect(getADCChannel('A6', arduinoNanoBoardProfile)).toBe(6);
        expect(getPortAndBit('A6', { portB, portC, portD }, arduinoNanoBoardProfile)).toBeNull();
    });
});
