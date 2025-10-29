import { describe, expect, it } from 'vitest';
import type { WokwiDiagram } from '../types/wokwi.types';
import {
    formatBoardPinPwmLabel,
    formatSimulatorPinReference,
    getConnectionRouteHints,
    getBoardPinFunctionBadges,
    getPreferredWiringLegendTones,
    getWiringCandidateDescriptor,
    getWiringLegendDescription,
    getWiringLegendHeading,
    getWiringCandidateSummary,
    getWiringCandidateStatus,
    listDiagramRouteHints,
    resolveSimulatorPinMetadata,
} from './pin-capabilities';

function makeDiagram(
    boardType: string,
    parts: WokwiDiagram['parts'] = [{ id: 'servo', type: 'wokwi-servo', top: 0, left: 0, rotate: 0 }],
): WokwiDiagram {
    return {
        version: 2,
        editor: 'test',
        parts: [
            { id: 'board', type: boardType, top: 0, left: 0, rotate: 0 },
            ...parts,
        ],
        connections: [],
    };
}

function getRequiredBoardPin(diagram: WokwiDiagram, pinId: string) {
    const boardPin = resolveSimulatorPinMetadata(diagram, pinId)?.boardPin;
    if (!boardPin) {
        throw new Error(`Missing board pin metadata for ${pinId}`);
    }
    return boardPin;
}

describe('pin capabilities', () => {
    it('resolves board pin metadata for PWM-capable pins', () => {
        const diagram = makeDiagram('wokwi-arduino-mega');

        const metadata = resolveSimulatorPinMetadata(diagram, 'board:8');

        expect(metadata).toMatchObject({
            kind: 'board',
            displayName: 'D8',
            boardProfile: { id: 'arduino-mega' },
            boardPin: {
                portId: 'H',
                bit: 5,
                pwm: { timerId: 'timer4', channel: 'C' },
            },
        });
        expect(metadata?.boardPin ? formatBoardPinPwmLabel(metadata.boardPin) : null).toBe('timer4/C');
        expect(metadata?.boardPin ? getBoardPinFunctionBadges(metadata.boardPin) : []).toEqual([]);
    });

    it('warns when a servo signal is wired to a non-PWM board pin', () => {
        const diagram = makeDiagram('wokwi-arduino-uno');

        const hints = getConnectionRouteHints(diagram, 'servo:PWM', 'board:4');

        expect(hints).toHaveLength(1);
        expect(hints[0]).toContain('D4');
        expect(hints[0]).toContain('not marked as PWM-capable');
        expect(hints[0]).toContain('D3, D5, D6, D9, D10, D11');
    });

    it('does not warn when a servo signal is wired to a PWM-capable board pin', () => {
        const diagram = makeDiagram('wokwi-arduino-uno');

        expect(getConnectionRouteHints(diagram, 'servo:PWM', 'board:9')).toEqual([]);
    });

    it('exposes canonical I2C, SPI, and UART function badges for board pins', () => {
        const diagram = makeDiagram('wokwi-arduino-mega');

        expect(getBoardPinFunctionBadges(getRequiredBoardPin(diagram, 'board:20'))).toEqual(['I2C SDA']);
        expect(getBoardPinFunctionBadges(getRequiredBoardPin(diagram, 'board:51'))).toEqual(['SPI MOSI']);
        expect(getBoardPinFunctionBadges(getRequiredBoardPin(diagram, 'board:14'))).toEqual(['USART3 TX']);
    });

    it('warns when an analog signal is wired to a non-ADC board pin', () => {
        const diagram = makeDiagram('wokwi-arduino-uno', [
            { id: 'pot', type: 'wokwi-potentiometer', top: 0, left: 0, rotate: 0 },
        ]);

        const hints = getConnectionRouteHints(diagram, 'pot:SIG', 'board:4');

        expect(hints).toHaveLength(1);
        expect(hints[0]).toContain('ADC-capable');
        expect(hints[0]).toContain('A0, A1, A2, A3, A4, A5');
    });

    it('warns when an I2C signal is wired to the wrong board line', () => {
        const diagram = makeDiagram('wokwi-arduino-uno', [
            { id: 'lcd', type: 'wokwi-lcd1602', top: 0, left: 0, rotate: 0 },
        ]);

        const hints = getConnectionRouteHints(diagram, 'lcd:SDA', 'board:5');

        expect(hints).toHaveLength(1);
        expect(hints[0]).toContain('SDA');
        expect(hints[0]).toContain('A4');
    });

    it('warns when an SPI signal is wired to the wrong board line', () => {
        const diagram = makeDiagram('wokwi-arduino-mega', [
            { id: 'sd', type: 'wokwi-microsd-card', top: 0, left: 0, rotate: 0 },
        ]);

        const hints = getConnectionRouteHints(diagram, 'sd:MOSI', 'board:52');

        expect(hints).toHaveLength(1);
        expect(hints[0]).toContain('SPI MOSI');
        expect(hints[0]).toContain('51');
    });

    it('warns when a UART RX pin is wired to a board RX line instead of TX', () => {
        const diagram = makeDiagram('wokwi-arduino-uno', [
            { id: 'chip', type: 'chip-uart-demo', top: 0, left: 0, rotate: 0 },
        ]);

        const hints = getConnectionRouteHints(diagram, 'chip:RX', 'board:0');

        expect(hints).toHaveLength(1);
        expect(hints[0]).toContain('board TX line');
        expect(hints[0]).toContain('D1');
    });

    it('formats persistent diagram route hints with readable connection labels', () => {
        const diagram = makeDiagram('wokwi-arduino-uno', [
            { id: 'lcd', type: 'wokwi-lcd1602', top: 0, left: 0, rotate: 0 },
        ]);
        const hints = getConnectionRouteHints(diagram, 'lcd:SDA', 'board:5');

        const withConnection = {
            ...diagram,
            connections: [{ id: 'conn-1', from: 'lcd:SDA', to: 'board:5', color: 'green', routeHints: hints }],
        };

        expect(formatSimulatorPinReference(withConnection, 'lcd:SDA')).toBe('lcd1602:SDA');
        expect(formatSimulatorPinReference(withConnection, 'board:5')).toBe('D5');
        expect(listDiagramRouteHints(withConnection)).toEqual([
            expect.objectContaining({
                connectionId: 'conn-1',
                connectionLabel: 'lcd1602:SDA -> D5',
                message: hints[0],
            }),
        ]);
    });

    it('classifies live wiring candidates as valid, invalid, or neutral', () => {
        const uartDiagram = makeDiagram('wokwi-arduino-uno', [
            { id: 'chip', type: 'chip-uart-demo', top: 0, left: 0, rotate: 0 },
        ]);

        expect(getWiringCandidateStatus(uartDiagram, 'chip:RX', 'board:1')).toBe('valid');
        expect(getWiringCandidateStatus(uartDiagram, 'chip:RX', 'board:0')).toBe('invalid');
        expect(getWiringCandidateStatus(uartDiagram, 'board:0', 'board:1')).toBe('neutral');
    });

    it('describes valid wiring candidates with a short role summary', () => {
        const i2cDiagram = makeDiagram('wokwi-arduino-uno', [
            { id: 'lcd', type: 'wokwi-lcd1602', top: 0, left: 0, rotate: 0 },
        ]);
        const uartDiagram = makeDiagram('wokwi-arduino-uno', [
            { id: 'chip', type: 'chip-uart-demo', top: 0, left: 0, rotate: 0 },
        ]);
        const servoDiagram = makeDiagram('wokwi-arduino-uno');
        const adcDiagram = makeDiagram('wokwi-arduino-uno', [
            { id: 'pot', type: 'wokwi-potentiometer', top: 0, left: 0, rotate: 0 },
        ]);

        expect(getWiringCandidateSummary(i2cDiagram, 'lcd:SDA', 'board:A4')).toEqual({
            title: 'I2C-compatible target',
            detail: 'A4 provides I2C SDA on Arduino Uno.',
        });
        expect(getWiringCandidateSummary(uartDiagram, 'chip:RX', 'board:1')).toEqual({
            title: 'UART-compatible target',
            detail: 'D1 provides USART0 TX on Arduino Uno.',
        });
        expect(getWiringCandidateSummary(servoDiagram, 'servo:PWM', 'board:9')).toEqual({
            title: 'PWM-capable target',
            detail: 'D9 provides PWM timer1/A on Arduino Uno.',
        });
        expect(getWiringCandidateSummary(adcDiagram, 'pot:SIG', 'board:A0')).toEqual({
            title: 'ADC-capable target',
            detail: 'A0 exposes ADC0 on Arduino Uno.',
        });
        expect(getWiringCandidateSummary(uartDiagram, 'chip:RX', 'board:0')).toBeNull();
    });

    it('classifies valid candidate tones for overlay rendering', () => {
        const i2cDiagram = makeDiagram('wokwi-arduino-uno', [
            { id: 'lcd', type: 'wokwi-lcd1602', top: 0, left: 0, rotate: 0 },
        ]);
        const uartDiagram = makeDiagram('wokwi-arduino-uno', [
            { id: 'chip', type: 'chip-uart-demo', top: 0, left: 0, rotate: 0 },
        ]);
        const servoDiagram = makeDiagram('wokwi-arduino-uno');
        const adcDiagram = makeDiagram('wokwi-arduino-uno', [
            { id: 'pot', type: 'wokwi-potentiometer', top: 0, left: 0, rotate: 0 },
        ]);

        expect(getWiringCandidateDescriptor(i2cDiagram, 'lcd:SDA', 'board:A4')).toMatchObject({ status: 'valid', tone: 'i2c' });
        expect(getWiringCandidateDescriptor(uartDiagram, 'chip:RX', 'board:1')).toMatchObject({ status: 'valid', tone: 'uart' });
        expect(getWiringCandidateDescriptor(servoDiagram, 'servo:PWM', 'board:9')).toMatchObject({ status: 'valid', tone: 'pwm' });
        expect(getWiringCandidateDescriptor(adcDiagram, 'pot:SIG', 'board:A0')).toMatchObject({ status: 'valid', tone: 'adc' });
        expect(getWiringCandidateDescriptor(uartDiagram, 'chip:RX', 'board:0')).toEqual({ status: 'invalid', tone: 'invalid' });
    });

    it('derives preferred legend tones from the wiring start pin context', () => {
        const i2cDiagram = makeDiagram('wokwi-arduino-uno', [
            { id: 'lcd', type: 'wokwi-lcd1602', top: 0, left: 0, rotate: 0 },
        ]);
        const uartDiagram = makeDiagram('wokwi-arduino-uno', [
            { id: 'chip', type: 'chip-uart-demo', top: 0, left: 0, rotate: 0 },
        ]);
        const adcDiagram = makeDiagram('wokwi-arduino-uno', [
            { id: 'pot', type: 'wokwi-potentiometer', top: 0, left: 0, rotate: 0 },
        ]);
        const servoDiagram = makeDiagram('wokwi-arduino-uno');

        expect(getPreferredWiringLegendTones(i2cDiagram, 'lcd:SDA')).toEqual(['i2c']);
        expect(getPreferredWiringLegendTones(uartDiagram, 'chip:RX')).toEqual(['uart']);
        expect(getPreferredWiringLegendTones(adcDiagram, 'pot:SIG')).toEqual(['adc']);
        expect(getPreferredWiringLegendTones(servoDiagram, 'servo:PWM')).toEqual(['pwm']);
        expect(getPreferredWiringLegendTones(i2cDiagram, 'board:A4')).toEqual(['adc', 'i2c']);
        expect(getPreferredWiringLegendTones(i2cDiagram, 'board:4')).toEqual(['generic']);
    });

    it('derives a contextual legend heading from the wiring start pin', () => {
        const i2cDiagram = makeDiagram('wokwi-arduino-uno', [
            { id: 'lcd', type: 'wokwi-lcd1602', top: 0, left: 0, rotate: 0 },
        ]);
        const uartDiagram = makeDiagram('wokwi-arduino-uno', [
            { id: 'chip', type: 'chip-uart-demo', top: 0, left: 0, rotate: 0 },
        ]);
        const adcDiagram = makeDiagram('wokwi-arduino-uno', [
            { id: 'pot', type: 'wokwi-potentiometer', top: 0, left: 0, rotate: 0 },
        ]);
        const servoDiagram = makeDiagram('wokwi-arduino-uno');

        expect(getWiringLegendHeading(i2cDiagram, 'lcd:SDA')).toBe('Expected from SDA');
        expect(getWiringLegendHeading(uartDiagram, 'chip:RX')).toBe('Expected from RX');
        expect(getWiringLegendHeading(adcDiagram, 'pot:SIG')).toBe('Expected from ADC');
        expect(getWiringLegendHeading(servoDiagram, 'servo:PWM')).toBe('Expected from PWM');
        expect(getWiringLegendHeading(i2cDiagram, 'board:A4')).toBe('Expected from SDA');
        expect(getWiringLegendHeading(i2cDiagram, 'board:4')).toBe('Expected from D4');
    });

    it('derives a contextual legend description from the wiring start pin', () => {
        const i2cDiagram = makeDiagram('wokwi-arduino-uno', [
            { id: 'lcd', type: 'wokwi-lcd1602', top: 0, left: 0, rotate: 0 },
        ]);
        const uartDiagram = makeDiagram('wokwi-arduino-uno', [
            { id: 'chip', type: 'chip-uart-demo', top: 0, left: 0, rotate: 0 },
        ]);
        const adcDiagram = makeDiagram('wokwi-arduino-uno', [
            { id: 'pot', type: 'wokwi-potentiometer', top: 0, left: 0, rotate: 0 },
        ]);
        const servoDiagram = makeDiagram('wokwi-arduino-uno');

        expect(getWiringLegendDescription(i2cDiagram, 'lcd:SDA')).toBe('Showing compatible I2C board targets');
        expect(getWiringLegendDescription(uartDiagram, 'chip:RX')).toBe('Showing compatible UART board targets');
        expect(getWiringLegendDescription(adcDiagram, 'pot:SIG')).toBe('Showing ADC-capable board targets');
        expect(getWiringLegendDescription(servoDiagram, 'servo:PWM')).toBe('Showing PWM-capable board targets');
        expect(getWiringLegendDescription(i2cDiagram, 'board:4')).toBe('Showing compatible board targets');
        expect(getWiringLegendDescription(uartDiagram, 'chip:RX', {
            hasValidTargets: false,
            hasInvalidTargets: true,
        })).toBe('No compatible board targets visible');
    });
});