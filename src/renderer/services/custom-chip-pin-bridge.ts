import type { AVRRunner } from '../../shared/execute';
import { resolveBoardProfileFromParts } from '../../shared/avr/profiles';
import type { WokwiDiagram } from '../types/wokwi.types';
import { getADCChannel, getPortAndBit, type ArduinoPorts } from '../utils/pin-mapping';
import type { ChipPinBridge } from './custom-chip-runtime';

export function parseCustomChipI2CAddress(attrs?: Record<string, string>): number | null {
    if (!attrs) return null;
    const raw = attrs.i2cAddress ?? attrs.address ?? attrs.addr;
    if (!raw) return null;

    const value = raw.trim().toLowerCase();
    const parsed = value.startsWith('0x')
        ? Number.parseInt(value.slice(2), 16)
        : Number.parseInt(value, 10);
    if (Number.isNaN(parsed) || parsed < 0 || parsed > 0x7F) {
        return null;
    }
    return parsed;
}

export function buildChipPinBridge(
    diagram: WokwiDiagram,
    runner: AVRRunner,
    partId: string,
): ChipPinBridge[] {
    const arduinoPart = diagram.parts.find((part) => part.type.startsWith('wokwi-arduino-'));
    if (!arduinoPart) return [];

    const ports: Readonly<ArduinoPorts> = runner.ports;
    const boardProfile = resolveBoardProfileFromParts(diagram.parts);
    const mappings: ChipPinBridge[] = [];
    const seen = new Set<string>();

    for (const conn of (diagram.connections ?? [])) {
        const [fromPart, fromPin] = conn.from.split(':');
        const [toPart, toPin] = conn.to.split(':');

        let chipPinName: string | null = null;
        let arduinoPin: string | null = null;

        if (fromPart === partId && toPart === arduinoPart.id) {
            chipPinName = fromPin;
            arduinoPin = toPin;
        } else if (toPart === partId && fromPart === arduinoPart.id) {
            chipPinName = toPin;
            arduinoPin = fromPin;
        }

        if (!chipPinName || !arduinoPin) continue;
        if (/^(GND|5V|3V3|3\.3V|AREF|IOREF|VIN|PWR|RESET)$/i.test(arduinoPin)) continue;
        if (seen.has(chipPinName)) continue;

        const portBit = getPortAndBit(arduinoPin, ports, boardProfile);
        if (!portBit) continue;

        seen.add(chipPinName);
        mappings.push({
            chipPinName,
            arduinoPin,
            port: portBit.port,
            bit: portBit.bit,
            adcChannel: getADCChannel(arduinoPin, boardProfile),
        });
    }

    return mappings;
}