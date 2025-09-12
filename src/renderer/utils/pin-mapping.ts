/**
 * Arduino Pin Mapping
 * Maps Arduino pin names (digital 0-13, analog A0-A5) to AVR port/bit pairs.
 */
import type { AVRIOPort } from 'avr8js';
import { defaultBoardProfile, resolveBoardPin, type BoardProfile } from '../../shared/avr/profiles';

export interface PortBitInfo {
    port: AVRIOPort;
    bit: number;
}

interface LegacyArduinoPorts {
    portB?: AVRIOPort;
    portC?: AVRIOPort;
    portD?: AVRIOPort;
}

interface ProfileArduinoPorts {
    B?: AVRIOPort;
    C?: AVRIOPort;
    D?: AVRIOPort;
}

export type ArduinoPorts =
    | LegacyArduinoPorts
    | ProfileArduinoPorts
    | Record<string, AVRIOPort>
    | (LegacyArduinoPorts & ProfileArduinoPorts);

function getNamedPort(ports: ArduinoPorts, portId: string): AVRIOPort | null {
    const modernPorts = ports as Record<string, AVRIOPort | undefined>;
    const directPort = modernPorts[portId];
    if (directPort) {
        return directPort;
    }

    const legacyPortKey = `port${portId}`;
    return modernPorts[legacyPortKey] ?? null;
}

/**
 * Resolves an Arduino pin name to the corresponding AVR port and bit.
 * The default board profile preserves the Arduino Uno / ATmega328P mapping.
 */
export function getPortAndBit(
    pinName: string,
    ports: ArduinoPorts,
    boardProfile: BoardProfile = defaultBoardProfile,
): PortBitInfo | null {
    const resolvedPin = resolveBoardPin(boardProfile, pinName);
    if (!resolvedPin?.portId || typeof resolvedPin.bit !== 'number') {
        return null;
    }

    const port = getNamedPort(ports, resolvedPin.portId);
    if (!port) {
        return null;
    }

    return { port, bit: resolvedPin.bit };
}

/**
 * Resolves an Arduino analog pin name to the ADC channel number.
 * Returns null for non-analog pin names.
 */
export function getADCChannel(pinName: string, boardProfile: BoardProfile = defaultBoardProfile): number | null {
    return resolveBoardPin(boardProfile, pinName)?.adcChannel ?? null;
}
