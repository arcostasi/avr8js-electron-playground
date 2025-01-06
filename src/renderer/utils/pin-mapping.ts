/**
 * Arduino Pin Mapping
 * Maps Arduino pin names (digital 0-13, analog A0-A5) to AVR port/bit pairs.
 */
import type { AVRIOPort } from 'avr8js';

export interface PortBitInfo {
    port: AVRIOPort;
    bit: number;
}

interface ArduinoPorts {
    portB: AVRIOPort;
    portC: AVRIOPort;
    portD: AVRIOPort;
}

/**
 * Resolves an Arduino pin name to the corresponding AVR port and bit.
 *
 * ATmega328p mapping:
 * - Pins 0-7   → Port D, bits 0-7
 * - Pins 8-13  → Port B, bits 0-5
 * - Pins A0-A5 → Port C, bits 0-5
 */
export function getPortAndBit(pinName: string, ports: ArduinoPorts): PortBitInfo | null {
    // Digital pins
    const digitalPin = Number.parseInt(pinName, 10);
    if (!Number.isNaN(digitalPin)) {
        if (digitalPin >= 0 && digitalPin <= 7) {
            return { port: ports.portD, bit: digitalPin };
        } else if (digitalPin >= 8 && digitalPin <= 13) {
            return { port: ports.portB, bit: digitalPin - 8 };
        }
    }

    // Analog pins as digital
    const analogMatch = /^A(\d+)$/.exec(pinName);
    if (analogMatch) {
        const analogPin = Number.parseInt(analogMatch[1], 10);
        if (analogPin >= 0 && analogPin <= 5) {
            return { port: ports.portC, bit: analogPin };
        }
    }

    return null;
}

/**
 * Resolves an Arduino analog pin name (A0-A5) to the ADC channel number (0-5).
 * Returns null for non-analog pin names.
 */
export function getADCChannel(pinName: string): number | null {
    const analogMatch = /^A(\d+)$/.exec(pinName);
    if (analogMatch) {
        const channel = Number.parseInt(analogMatch[1], 10);
        if (channel >= 0 && channel <= 7) {
            return channel;
        }
    }
    return null;
}
