import {
    getBoardProfileByWokwiType,
    resolveBoardPin,
    type BoardPinProfile,
    type BoardProfile,
} from '../../shared/avr/profiles';
import type { WokwiDiagram } from '../types/wokwi.types';

export interface SimulatorPinMetadata {
    pinId: string;
    partId: string;
    partType: string;
    pinName: string;
    displayName: string;
    boardProfile?: BoardProfile;
    boardPin?: BoardPinProfile;
    kind: 'board' | 'component';
}

export interface DiagramRouteHintItem {
    connectionId: string;
    connectionLabel: string;
    message: string;
}

export interface WiringCandidateSummary {
    title: string;
    detail: string;
}

export type WiringCandidateStatus = 'valid' | 'invalid' | 'neutral';
export type WiringCandidateTone = 'generic' | 'pwm' | 'adc' | 'i2c' | 'spi' | 'uart' | 'invalid' | 'neutral';

export interface WiringCandidateDescriptor {
    status: WiringCandidateStatus;
    tone: WiringCandidateTone;
    summary?: WiringCandidateSummary;
}

export interface WiringCandidateToneAppearance {
    label: string;
    ring: string;
    fill: string;
    stroke: string;
}

export interface WiringLegendDescriptionOptions {
    hasValidTargets?: boolean;
    hasInvalidTargets?: boolean;
}

type PreferredLegendTone = Exclude<WiringCandidateTone, 'invalid' | 'neutral'>;

interface ParsedPinId {
    partId: string;
    pinName: string;
}

function parsePinId(pinId: string): ParsedPinId | null {
    const separator = pinId.indexOf(':');
    if (separator <= 0 || separator >= pinId.length - 1) {
        return null;
    }

    return {
        partId: pinId.slice(0, separator),
        pinName: pinId.slice(separator + 1),
    };
}

export function getBoardPinDisplayName(boardPin: BoardPinProfile): string {
    if (boardPin.name.startsWith('A')) {
        return boardPin.name;
    }

    return boardPin.aliases?.find((alias) => alias.startsWith('D'))
        ?? boardPin.aliases?.[0]
        ?? boardPin.name;
}

export function formatBoardPinPwmLabel(boardPin: BoardPinProfile): string | null {
    if (!boardPin.pwm) {
        return null;
    }

    return `${boardPin.pwm.timerId}/${boardPin.pwm.channel}`;
}

export function getBoardPinFunctionBadges(boardPin: BoardPinProfile): string[] {
    const badges: string[] = [];

    if (boardPin.i2c) {
        badges.push(`I2C ${boardPin.i2c}`);
    }
    if (boardPin.spi) {
        badges.push(`SPI ${boardPin.spi}`);
    }
    if (boardPin.uart) {
        badges.push(`${boardPin.uart.usartId.toUpperCase()} ${boardPin.uart.role}`);
    }

    return badges;
}

export function resolveSimulatorPinMetadata(
    diagram: WokwiDiagram | undefined,
    pinId: string | null,
): SimulatorPinMetadata | null {
    if (!diagram || !pinId) {
        return null;
    }

    const parsed = parsePinId(pinId);
    if (!parsed) {
        return null;
    }

    const part = diagram.parts.find((candidate) => candidate.id === parsed.partId);
    if (!part) {
        return null;
    }

    if (part.type.startsWith('wokwi-arduino-')) {
        const boardProfile = getBoardProfileByWokwiType(part.type) ?? undefined;
        const boardPin = boardProfile ? resolveBoardPin(boardProfile, parsed.pinName) ?? undefined : undefined;
        return {
            pinId,
            partId: parsed.partId,
            partType: part.type,
            pinName: parsed.pinName,
            displayName: boardPin ? getBoardPinDisplayName(boardPin) : parsed.pinName.toUpperCase(),
            boardProfile,
            boardPin,
            kind: 'board',
        };
    }

    return {
        pinId,
        partId: parsed.partId,
        partType: part.type,
        pinName: parsed.pinName,
        displayName: parsed.pinName,
        kind: 'component',
    };
}

function formatPartTypeLabel(partType: string): string {
    if (partType.startsWith('wokwi-')) {
        return partType.slice('wokwi-'.length);
    }
    if (partType.startsWith('chip-')) {
        return partType.slice('chip-'.length);
    }
    return partType;
}

export function formatSimulatorPinReference(
    diagram: WokwiDiagram | undefined,
    pinId: string,
): string {
    const metadata = resolveSimulatorPinMetadata(diagram, pinId);
    if (!metadata) {
        return pinId;
    }

    if (metadata.kind === 'board') {
        return metadata.displayName;
    }

    return `${formatPartTypeLabel(metadata.partType)}:${metadata.displayName}`;
}

function listBoardPwmPins(boardProfile: BoardProfile): string {
    return boardProfile.pins
        .filter((pin) => pin.pwm)
        .map((pin) => getBoardPinDisplayName(pin))
        .join(', ');
}

function listBoardPinsBy(boardProfile: BoardProfile, predicate: (pin: BoardPinProfile) => boolean): string {
    return boardProfile.pins
        .filter(predicate)
        .map((pin) => getBoardPinDisplayName(pin))
        .join(', ');
}

function shouldRequireAdc(componentType: string, pinName: string): boolean {
    const upperPin = pinName.toUpperCase();
    if (componentType === 'wokwi-analog-joystick') {
        return upperPin === 'HORZ' || upperPin === 'VER';
    }

    if (componentType === 'wokwi-potentiometer' || componentType === 'wokwi-slide-potentiometer') {
        return upperPin === 'SIG';
    }

    if (
        componentType === 'wokwi-ntc-temperature-sensor'
        || componentType === 'wokwi-photoresistor-sensor'
        || componentType === 'wokwi-big-sound-sensor'
        || componentType === 'wokwi-small-sound-sensor'
        || componentType === 'wokwi-flame-sensor'
        || componentType === 'wokwi-gas-sensor'
    ) {
        return upperPin === 'OUT' || upperPin === 'AO' || upperPin === 'AOUT';
    }

    return false;
}

function getComponentBusExpectation(componentType: string, pinName: string): {
    kind: 'i2c' | 'spi' | 'uart';
    role: string;
    boardRole: string;
    description: string;
} | null {
    const upperPin = pinName.toUpperCase();

    if (upperPin === 'SDA' || upperPin === 'SCL') {
        return {
            kind: 'i2c',
            role: upperPin,
            boardRole: upperPin,
            description: `${componentType} ${upperPin}`,
        };
    }

    if (upperPin === 'MOSI' || upperPin === 'MISO' || upperPin === 'SCK') {
        return {
            kind: 'spi',
            role: upperPin,
            boardRole: upperPin,
            description: `${componentType} ${upperPin}`,
        };
    }

    if (upperPin === 'RX') {
        return {
            kind: 'uart',
            role: upperPin,
            boardRole: 'TX',
            description: `${componentType} RX`,
        };
    }

    if (upperPin === 'TX') {
        return {
            kind: 'uart',
            role: upperPin,
            boardRole: 'RX',
            description: `${componentType} TX`,
        };
    }

    return null;
}

function getBoardPinPreferredTones(boardPin: BoardPinProfile): PreferredLegendTone[] {
    const tones: PreferredLegendTone[] = [];

    if (boardPin.pwm) {
        tones.push('pwm');
    }
    if (typeof boardPin.adcChannel === 'number') {
        tones.push('adc');
    }
    if (boardPin.i2c) {
        tones.push('i2c');
    }
    if (boardPin.spi) {
        tones.push('spi');
    }
    if (boardPin.uart) {
        tones.push('uart');
    }

    return tones;
}

function getConnectionEndpoints(
    diagram: WokwiDiagram | undefined,
    fromPinId: string,
    toPinId: string,
): {
    componentPin: SimulatorPinMetadata;
    boardPin: SimulatorPinMetadata & { boardProfile: BoardProfile; boardPin: BoardPinProfile };
    servoPin: SimulatorPinMetadata | undefined;
} | null {
    const from = resolveSimulatorPinMetadata(diagram, fromPinId);
    const to = resolveSimulatorPinMetadata(diagram, toPinId);

    if (!from || !to) {
        return null;
    }

    const endpoints = [from, to];
    const componentPin = endpoints.find((endpoint) => endpoint.kind === 'component');
    const boardPin = endpoints.find(
        (endpoint): endpoint is SimulatorPinMetadata & { boardProfile: BoardProfile; boardPin: BoardPinProfile } =>
            endpoint.kind === 'board' && !!endpoint.boardProfile && !!endpoint.boardPin,
    );

    if (!componentPin || !boardPin) {
        return null;
    }

    return {
        componentPin,
        boardPin,
        servoPin: endpoints.find((endpoint) => endpoint.partType === 'wokwi-servo' && endpoint.pinName.toUpperCase() === 'PWM'),
    };
}

function getServoRouteHint(
    boardPin: SimulatorPinMetadata & { boardProfile: BoardProfile; boardPin: BoardPinProfile },
): string[] {
    if (boardPin.boardPin.pwm) {
        return [];
    }

    return [
        `Servo signal is wired to ${boardPin.displayName}, which is not marked as PWM-capable on ${boardPin.boardProfile.name}. Prefer ${listBoardPwmPins(boardPin.boardProfile)}.`,
    ];
}

function getAdcRouteHint(
    componentPin: SimulatorPinMetadata,
    boardPin: SimulatorPinMetadata & { boardProfile: BoardProfile; boardPin: BoardPinProfile },
): string[] {
    if (!shouldRequireAdc(componentPin.partType, componentPin.pinName) || typeof boardPin.boardPin.adcChannel === 'number') {
        return [];
    }

    const preferredPins = listBoardPinsBy(
        boardPin.boardProfile,
        (pin) => typeof pin.adcChannel === 'number',
    );

    return [
        `${componentPin.displayName} on ${componentPin.partType} is usually sampled through an ADC-capable board pin. `
        + `${boardPin.displayName} is not marked as analog-capable on ${boardPin.boardProfile.name}. `
        + `Prefer ${preferredPins}.`,
    ];
}

function getBusRouteHint(
    componentPin: SimulatorPinMetadata,
    boardPin: SimulatorPinMetadata & { boardProfile: BoardProfile; boardPin: BoardPinProfile },
): string[] {
    const busExpectation = getComponentBusExpectation(componentPin.partType, componentPin.pinName);
    if (!busExpectation) {
        return [];
    }

    if (busExpectation.kind === 'i2c' && boardPin.boardPin.i2c !== busExpectation.boardRole) {
        const preferredPins = listBoardPinsBy(
            boardPin.boardProfile,
            (pin) => pin.i2c === busExpectation.boardRole,
        );
        return [
            `${componentPin.displayName} expects the ${busExpectation.role} board line, but ${boardPin.displayName} `
            + `is not marked as ${busExpectation.role} on ${boardPin.boardProfile.name}. `
            + `Prefer ${preferredPins}.`,
        ];
    }

    if (busExpectation.kind === 'spi' && boardPin.boardPin.spi !== busExpectation.boardRole) {
        const preferredPins = listBoardPinsBy(
            boardPin.boardProfile,
            (pin) => pin.spi === busExpectation.boardRole,
        );
        return [
            `${componentPin.displayName} expects the SPI ${busExpectation.role} board line, but ${boardPin.displayName} `
            + `is not marked as ${busExpectation.role} on ${boardPin.boardProfile.name}. `
            + `Prefer ${preferredPins}.`,
        ];
    }

    if (busExpectation.kind === 'uart' && boardPin.boardPin.uart?.role !== busExpectation.boardRole) {
        const preferredPins = listBoardPinsBy(
            boardPin.boardProfile,
            (pin) => pin.uart?.role === busExpectation.boardRole,
        );
        return [
            `${componentPin.displayName} should connect to a board ${busExpectation.boardRole} line, but ${boardPin.displayName} `
            + `is not marked as ${busExpectation.boardRole} on ${boardPin.boardProfile.name}. `
            + `Prefer ${preferredPins}.`,
        ];
    }

    return [];
}

function getValidWiringCandidateSummary(
    componentPin: SimulatorPinMetadata,
    boardPin: SimulatorPinMetadata & { boardProfile: BoardProfile; boardPin: BoardPinProfile },
    hasServoPin: boolean,
): WiringCandidateSummary {
    if (hasServoPin && boardPin.boardPin.pwm) {
        return {
            title: 'PWM-capable target',
            detail: `${boardPin.displayName} provides PWM ${formatBoardPinPwmLabel(boardPin.boardPin)} on ${boardPin.boardProfile.name}.`,
        };
    }

    if (shouldRequireAdc(componentPin.partType, componentPin.pinName) && typeof boardPin.boardPin.adcChannel === 'number') {
        return {
            title: 'ADC-capable target',
            detail: `${boardPin.displayName} exposes ADC${boardPin.boardPin.adcChannel} on ${boardPin.boardProfile.name}.`,
        };
    }

    const busExpectation = getComponentBusExpectation(componentPin.partType, componentPin.pinName);
    if (busExpectation?.kind === 'i2c' && boardPin.boardPin.i2c) {
        return {
            title: 'I2C-compatible target',
            detail: `${boardPin.displayName} provides I2C ${boardPin.boardPin.i2c} on ${boardPin.boardProfile.name}.`,
        };
    }

    if (busExpectation?.kind === 'spi' && boardPin.boardPin.spi) {
        return {
            title: 'SPI-compatible target',
            detail: `${boardPin.displayName} provides SPI ${boardPin.boardPin.spi} on ${boardPin.boardProfile.name}.`,
        };
    }

    if (busExpectation?.kind === 'uart' && boardPin.boardPin.uart) {
        return {
            title: 'UART-compatible target',
            detail: `${boardPin.displayName} provides ${boardPin.boardPin.uart.usartId.toUpperCase()} ${boardPin.boardPin.uart.role} on ${boardPin.boardProfile.name}.`,
        };
    }

    return {
        title: 'Compatible target',
        detail: `${boardPin.displayName} is compatible with ${componentPin.displayName} on ${boardPin.boardProfile.name}.`,
    };
}

function getValidWiringCandidateTone(summary: WiringCandidateSummary): Exclude<WiringCandidateTone, 'invalid' | 'neutral'> {
    if (summary.title.startsWith('PWM')) {
        return 'pwm';
    }
    if (summary.title.startsWith('ADC')) {
        return 'adc';
    }
    if (summary.title.startsWith('I2C')) {
        return 'i2c';
    }
    if (summary.title.startsWith('SPI')) {
        return 'spi';
    }
    if (summary.title.startsWith('UART')) {
        return 'uart';
    }
    return 'generic';
}

export function getConnectionRouteHints(
    diagram: WokwiDiagram | undefined,
    fromPinId: string,
    toPinId: string,
): string[] {
    const resolved = getConnectionEndpoints(diagram, fromPinId, toPinId);
    if (!resolved) {
        return [];
    }

    if (resolved.servoPin) {
        return getServoRouteHint(resolved.boardPin);
    }

    const adcHint = getAdcRouteHint(resolved.componentPin, resolved.boardPin);
    if (adcHint.length > 0) {
        return adcHint;
    }

    return getBusRouteHint(resolved.componentPin, resolved.boardPin);
}

export function getWiringCandidateStatus(
    diagram: WokwiDiagram | undefined,
    startPinId: string | null,
    candidatePinId: string,
): WiringCandidateStatus {
    return getWiringCandidateDescriptor(diagram, startPinId, candidatePinId).status;
}

export function getWiringCandidateSummary(
    diagram: WokwiDiagram | undefined,
    startPinId: string | null,
    candidatePinId: string,
): WiringCandidateSummary | null {
    return getWiringCandidateDescriptor(diagram, startPinId, candidatePinId).summary ?? null;
}

export function getWiringCandidateDescriptor(
    diagram: WokwiDiagram | undefined,
    startPinId: string | null,
    candidatePinId: string,
): WiringCandidateDescriptor {
    if (!diagram || !startPinId || startPinId === candidatePinId) {
        return { status: 'neutral', tone: 'neutral' };
    }

    const resolved = getConnectionEndpoints(diagram, startPinId, candidatePinId);
    if (!resolved) {
        return { status: 'neutral', tone: 'neutral' };
    }

    const routeHints = getConnectionRouteHints(diagram, startPinId, candidatePinId);
    if (routeHints.length > 0) {
        return { status: 'invalid', tone: 'invalid' };
    }

    const summary = getValidWiringCandidateSummary(resolved.componentPin, resolved.boardPin, !!resolved.servoPin);
    return {
        status: 'valid',
        tone: getValidWiringCandidateTone(summary),
        summary,
    };
}

export function getPreferredWiringLegendTones(
    diagram: WokwiDiagram | undefined,
    startPinId: string | null,
): PreferredLegendTone[] {
    const start = resolveSimulatorPinMetadata(diagram, startPinId);
    if (!start) {
        return [];
    }

    if (start.kind === 'board' && start.boardPin) {
        const tones = getBoardPinPreferredTones(start.boardPin);
        return tones.length > 0 ? tones : ['generic'];
    }

    if (start.partType === 'wokwi-servo' && start.pinName.toUpperCase() === 'PWM') {
        return ['pwm'];
    }

    if (shouldRequireAdc(start.partType, start.pinName)) {
        return ['adc'];
    }

    const busExpectation = getComponentBusExpectation(start.partType, start.pinName);
    if (busExpectation?.kind === 'i2c') {
        return ['i2c'];
    }
    if (busExpectation?.kind === 'spi') {
        return ['spi'];
    }
    if (busExpectation?.kind === 'uart') {
        return ['uart'];
    }

    return ['generic'];
}

function getBoardWiringLegendHeading(boardPin: BoardPinProfile, displayName: string): string {
    if (boardPin.i2c) {
        return `Expected from ${boardPin.i2c}`;
    }
    if (boardPin.spi) {
        return `Expected from ${boardPin.spi}`;
    }
    if (boardPin.uart) {
        return `Expected from ${boardPin.uart.role}`;
    }
    if (boardPin.pwm) {
        return 'Expected from PWM';
    }
    if (typeof boardPin.adcChannel === 'number') {
        return 'Expected from ADC';
    }
    return `Expected from ${displayName}`;
}

function getComponentWiringLegendHeading(start: SimulatorPinMetadata): string {
    if (start.partType === 'wokwi-servo' && start.pinName.toUpperCase() === 'PWM') {
        return 'Expected from PWM';
    }

    if (shouldRequireAdc(start.partType, start.pinName)) {
        return 'Expected from ADC';
    }

    const busExpectation = getComponentBusExpectation(start.partType, start.pinName);
    if (busExpectation) {
        return `Expected from ${busExpectation.role}`;
    }

    return `Expected from ${start.displayName}`;
}

function getBoardWiringLegendDescription(boardPin: BoardPinProfile): string {
    if (boardPin.i2c) {
        return 'Showing compatible I2C board targets';
    }
    if (boardPin.spi) {
        return 'Showing compatible SPI board targets';
    }
    if (boardPin.uart) {
        return 'Showing compatible UART board targets';
    }
    if (boardPin.pwm) {
        return 'Showing PWM-capable board targets';
    }
    if (typeof boardPin.adcChannel === 'number') {
        return 'Showing ADC-capable board targets';
    }
    return 'Showing compatible board targets';
}

function getComponentWiringLegendDescription(start: SimulatorPinMetadata): string {
    if (start.partType === 'wokwi-servo' && start.pinName.toUpperCase() === 'PWM') {
        return 'Showing PWM-capable board targets';
    }

    if (shouldRequireAdc(start.partType, start.pinName)) {
        return 'Showing ADC-capable board targets';
    }

    const busExpectation = getComponentBusExpectation(start.partType, start.pinName);
    if (busExpectation?.kind === 'i2c') {
        return 'Showing compatible I2C board targets';
    }
    if (busExpectation?.kind === 'spi') {
        return 'Showing compatible SPI board targets';
    }
    if (busExpectation?.kind === 'uart') {
        return 'Showing compatible UART board targets';
    }

    return 'Showing compatible board targets';
}

export function getWiringLegendHeading(
    diagram: WokwiDiagram | undefined,
    startPinId: string | null,
): string {
    const start = resolveSimulatorPinMetadata(diagram, startPinId);
    if (!start) {
        return 'Wiring key';
    }

    if (start.kind === 'board' && start.boardPin) {
        return getBoardWiringLegendHeading(start.boardPin, start.displayName);
    }

    return getComponentWiringLegendHeading(start);
}

export function getWiringLegendDescription(
    diagram: WokwiDiagram | undefined,
    startPinId: string | null,
    options: WiringLegendDescriptionOptions = {},
): string {
    if (options.hasValidTargets === false && options.hasInvalidTargets) {
        return 'No compatible board targets visible';
    }

    const start = resolveSimulatorPinMetadata(diagram, startPinId);
    if (!start) {
        return 'Showing compatible board targets';
    }

    if (start.kind === 'board' && start.boardPin) {
        return getBoardWiringLegendDescription(start.boardPin);
    }

    return getComponentWiringLegendDescription(start);
}

export function listDiagramRouteHints(diagram: WokwiDiagram | undefined): DiagramRouteHintItem[] {
    if (!diagram) {
        return [];
    }

    return diagram.connections.flatMap((connection) => {
        const connectionLabel = `${formatSimulatorPinReference(diagram, connection.from)} -> ${formatSimulatorPinReference(diagram, connection.to)}`;
        return (connection.routeHints ?? []).map((message) => ({
            connectionId: connection.id,
            connectionLabel,
            message,
        }));
    });
}

export function getWiringCandidateToneAppearance(tone: WiringCandidateTone): WiringCandidateToneAppearance {
    if (tone === 'pwm') {
        return {
            label: 'PWM',
            ring: 'rgba(245,158,11,0.28)',
            fill: 'rgba(245,158,11,0.72)',
            stroke: '#fcd34d',
        };
    }

    if (tone === 'adc') {
        return {
            label: 'ADC',
            ring: 'rgba(16,185,129,0.28)',
            fill: 'rgba(16,185,129,0.72)',
            stroke: '#86efac',
        };
    }

    if (tone === 'i2c') {
        return {
            label: 'I2C',
            ring: 'rgba(56,189,248,0.28)',
            fill: 'rgba(56,189,248,0.72)',
            stroke: '#7dd3fc',
        };
    }

    if (tone === 'spi') {
        return {
            label: 'SPI',
            ring: 'rgba(168,85,247,0.26)',
            fill: 'rgba(168,85,247,0.68)',
            stroke: '#d8b4fe',
        };
    }

    if (tone === 'uart') {
        return {
            label: 'UART',
            ring: 'rgba(14,165,233,0.28)',
            fill: 'rgba(14,165,233,0.72)',
            stroke: '#93c5fd',
        };
    }

    if (tone === 'generic') {
        return {
            label: 'Compatible',
            ring: 'rgba(34,197,94,0.28)',
            fill: 'rgba(34,197,94,0.72)',
            stroke: '#86efac',
        };
    }

    if (tone === 'invalid') {
        return {
            label: 'Invalid',
            ring: 'rgba(239,68,68,0.24)',
            fill: 'rgba(239,68,68,0.65)',
            stroke: '#fda4af',
        };
    }

    return {
        label: 'Neutral',
        ring: 'rgba(59,130,246,0.3)',
        fill: 'rgba(59,130,246,0.6)',
        stroke: '#60a5fa',
    };
}