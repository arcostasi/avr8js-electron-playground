import { afterEach, describe, expect, it, vi } from 'vitest';
import { AVRRunner } from '../../shared/execute';
import type { WokwiDiagram } from '../types/wokwi.types';
import { setupGPIORouting } from './gpio-router';

const EMPTY_HEX = ':00000001FF\n';

function createFakeEventTarget<T extends Record<string, unknown>>(initial: T) {
    const listeners = new Map<string, Set<(e: Event) => void>>();
    return Object.assign(initial, {
        addEventListener(type: string, fn: (e: Event) => void) {
            const set = listeners.get(type) ?? new Set();
            set.add(fn);
            listeners.set(type, set);
        },
        removeEventListener(type: string, fn: (e: Event) => void) {
            listeners.get(type)?.delete(fn);
        },
        dispatchEvent(event: Event) {
            for (const fn of (listeners.get(event.type) ?? [])) {
                fn(event);
            }
            return true;
        },
        getAttribute: (): string | null => null,
    });
}

afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

describe('gpio-router deferred 60fps flushing', () => {
    it('batches LED, 7-segment, and LED bar graph DOM mutations until flush() and skips redundant writes', () => {
        const runner = new AVRRunner(EMPTY_HEX);

        let ledWrites = 0;
        let ledBackingValue = false;
        const fakeLed = {
            get value() { return ledBackingValue; },
            set value(next: boolean) {
                ledWrites += 1;
                ledBackingValue = next;
            },
        };

        let segWrites = 0;
        let segBackingValues = [0, 0, 0, 0, 0, 0, 0, 0];
        const fakeSeg7 = {
            getAttribute: () => 'cathode',
            get values() { return segBackingValues; },
            set values(next: number[]) {
                segWrites += 1;
                segBackingValues = next;
            },
        };

        let barWrites = 0;
        let barBackingValues: boolean[] = Array.from({ length: 10 }, () => false);
        const fakeBar = {
            get values() { return barBackingValues; },
            set values(next: boolean[]) {
                barWrites += 1;
                barBackingValues = next;
            },
        };

        const elements: Record<string, unknown> = {
            uno: {},
            led1: fakeLed,
            seg1: fakeSeg7,
            bar1: fakeBar,
        };
        vi.stubGlobal('document', {
            getElementById: (id: string) => elements[id] ?? null,
        });

        const diagram: WokwiDiagram = {
            version: 2,
            editor: 'avr8js-electron-playground',
            parts: [
                { id: 'uno', type: 'wokwi-arduino-uno', top: 0, left: 0, rotate: 0 },
                { id: 'led1', type: 'wokwi-led', top: 0, left: 0, rotate: 0 },
                { id: 'seg1', type: 'wokwi-7segment', top: 0, left: 0, rotate: 0 },
                { id: 'bar1', type: 'wokwi-led-bar-graph', top: 0, left: 0, rotate: 0 },
            ],
            connections: [
                { id: 'c1', from: 'uno:13', to: 'led1:A', color: 'red' },
                { id: 'c2', from: 'uno:12', to: 'seg1:A', color: 'green' },
                { id: 'c3', from: 'uno:11', to: 'seg1:B', color: 'green' },
                { id: 'c4', from: 'uno:10', to: 'bar1:A1', color: 'blue' },
                { id: 'c5', from: 'uno:9', to: 'bar1:A2', color: 'blue' },
            ],
        };

        const handle = setupGPIORouting(diagram, runner);

        // Configure Port B (pins 8-13 -> bits 0-5) as outputs and toggle rapidly mid-frame
        runner.cpu.writeData(runner.portB.portConfig.DDR, 0b0011_1111);
        runner.cpu.writeData(runner.portB.portConfig.PORT, 0b0010_0000); // pin 13 HIGH
        runner.cpu.writeData(runner.portB.portConfig.PORT, 0b0000_0000); // pin 13 LOW
        runner.cpu.writeData(runner.portB.portConfig.PORT, 0b0011_1110); // 13,12,11,10,9 HIGH

        // Zero DOM writes should happen during CPU cycles before flush()
        expect(ledWrites).toBe(0);
        expect(segWrites).toBe(0);
        expect(barWrites).toBe(0);

        handle.flush();
        expect(ledWrites).toBe(1);
        expect(ledBackingValue).toBe(true);
        expect(segWrites).toBe(1);
        expect(segBackingValues.slice(0, 2)).toEqual([1, 1]);
        expect(barWrites).toBe(1);
        expect(barBackingValues.slice(0, 2)).toEqual([true, true]);

        // Second flush without changes must perform zero DOM writes
        handle.flush();
        expect(ledWrites).toBe(1);
        expect(segWrites).toBe(1);
        expect(barWrites).toBe(1);

        handle.cleanup();
        runner.stop();
    });
});

describe('gpio-router component fixes', () => {
    it('maps analog joystick VERT/HORZ [-1, 0, +1] to [0, 512, 1023] and slide-pot [0..100] to [0..1023]', () => {
        const runner = new AVRRunner(EMPTY_HEX);
        const fakeJoystick = { xValue: 0, yValue: 0 };
        const fakeSlidePot = { min: 0, max: 100, value: 50 };

        const elements: Record<string, unknown> = {
            uno: {},
            joy1: fakeJoystick,
            pot1: fakeSlidePot,
        };
        vi.stubGlobal('document', { getElementById: (id: string) => elements[id] ?? null });

        const diagram: WokwiDiagram = {
            version: 2,
            editor: 'avr8js-electron-playground',
            parts: [
                { id: 'uno', type: 'wokwi-arduino-uno', top: 0, left: 0, rotate: 0 },
                { id: 'joy1', type: 'wokwi-analog-joystick', top: 0, left: 0, rotate: 0 },
                { id: 'pot1', type: 'wokwi-slide-potentiometer', top: 0, left: 0, rotate: 0 },
            ],
            connections: [
                { id: 'c1', from: 'joy1:VERT', to: 'uno:A0', color: 'green' },
                { id: 'c2', from: 'joy1:HORZ', to: 'uno:A1', color: 'blue' },
                { id: 'c3', from: 'pot1:SIG', to: 'uno:A2', color: 'orange' },
            ],
        };

        const handle = setupGPIORouting(diagram, runner);

        expect(runner.adcRegistry.getChannel(0)).toBe(512);
        expect(runner.adcRegistry.getChannel(1)).toBe(512);
        expect(runner.adcRegistry.getChannel(2)).toBe(512);

        fakeJoystick.yValue = -1;
        fakeJoystick.xValue = 1;
        fakeSlidePot.value = 100;
        expect(runner.adcRegistry.getChannel(0)).toBe(0);
        expect(runner.adcRegistry.getChannel(1)).toBe(1023);
        expect(runner.adcRegistry.getChannel(2)).toBe(1023);

        fakeJoystick.yValue = 1;
        fakeSlidePot.value = 0;
        expect(runner.adcRegistry.getChannel(0)).toBe(1023);
        expect(runner.adcRegistry.getChannel(2)).toBe(0);

        handle.cleanup();
        runner.stop();
    });

    it('handles slide-switch input events, dip-switch-8 switch-change events, and preserves tilt-switch state', () => {
        const runner = new AVRRunner(EMPTY_HEX);
        const fakeSlideSwitch = createFakeEventTarget({ value: 0 });
        const fakeDipSwitch = createFakeEventTarget({ values: [0, 0, 0, 0, 0, 0, 0, 0] });
        const fakeTiltSwitch = createFakeEventTarget({});

        const elements: Record<string, unknown> = {
            uno: {},
            sw1: fakeSlideSwitch,
            dip1: fakeDipSwitch,
            tilt1: fakeTiltSwitch,
        };
        vi.stubGlobal('document', { getElementById: (id: string) => elements[id] ?? null });

        // Pre-set tilt switch pin 4 (PD4) LOW before setupGPIORouting
        runner.portD.setPin(4, false);

        const diagram: WokwiDiagram = {
            version: 2,
            editor: 'avr8js-electron-playground',
            parts: [
                { id: 'uno', type: 'wokwi-arduino-uno', top: 0, left: 0, rotate: 0 },
                { id: 'sw1', type: 'wokwi-slide-switch', top: 0, left: 0, rotate: 0 },
                { id: 'dip1', type: 'wokwi-dip-switch-8', top: 0, left: 0, rotate: 0 },
                { id: 'tilt1', type: 'wokwi-tilt-switch', top: 0, left: 0, rotate: 0 },
            ],
            connections: [
                { id: 'c1', from: 'sw1:2', to: 'uno:2', color: 'green' },
                { id: 'c2', from: 'dip1:1a', to: 'uno:3', color: 'blue' },
                { id: 'c3', from: 'tilt1:OUT', to: 'uno:4', color: 'yellow' },
            ],
        };

        const handle = setupGPIORouting(diagram, runner);

        const readPinD = (bit: number) => (runner.cpu.data[runner.portD.portConfig.PIN] >> bit) & 1;

        // Slide switch responds to 'input'
        expect(readPinD(2)).toBe(1);
        fakeSlideSwitch.value = 1;
        fakeSlideSwitch.dispatchEvent(new Event('input'));
        expect(readPinD(2)).toBe(0);

        // DIP switch responds to 'switch-change'
        expect(readPinD(3)).toBe(1);
        fakeDipSwitch.values[0] = 1;
        fakeDipSwitch.dispatchEvent(new Event('switch-change'));
        expect(readPinD(3)).toBe(0);

        // Tilt switch pin 4 was NOT overwritten by wireSwitch
        expect(readPinD(4)).toBe(0);

        handle.cleanup();
        runner.stop();
    });

    it('steps KY-040 quadrature in opposite directions for rotate-cw vs rotate-ccw and supports keypad column field', () => {
        vi.useFakeTimers();
        const runner = new AVRRunner(EMPTY_HEX);
        const fakeEncoder = createFakeEventTarget({});
        const fakeKeypad = createFakeEventTarget({});

        const elements: Record<string, unknown> = {
            uno: {},
            enc1: fakeEncoder,
            kp1: fakeKeypad,
        };
        vi.stubGlobal('document', { getElementById: (id: string) => elements[id] ?? null });

        const diagram: WokwiDiagram = {
            version: 2,
            editor: 'avr8js-electron-playground',
            parts: [
                { id: 'uno', type: 'wokwi-arduino-uno', top: 0, left: 0, rotate: 0 },
                { id: 'enc1', type: 'wokwi-ky-040', top: 0, left: 0, rotate: 0 },
                { id: 'kp1', type: 'wokwi-membrane-keypad', top: 0, left: 0, rotate: 0 },
            ],
            connections: [
                { id: 'c1', from: 'enc1:CLK', to: 'uno:2', color: 'green' },
                { id: 'c2', from: 'enc1:DT', to: 'uno:3', color: 'blue' },
                { id: 'c3', from: 'kp1:R1', to: 'uno:4', color: 'red' },
                { id: 'c4', from: 'kp1:C2', to: 'uno:5', color: 'orange' },
            ],
        };

        const handle = setupGPIORouting(diagram, runner);

        const readPinD = (bit: number) => (runner.cpu.data[runner.portD.portConfig.PIN] >> bit) & 1;

        // Rotate CW: first step transitions from [true, true] -> [false, true] (CLK=0, DT=1)
        fakeEncoder.dispatchEvent(new CustomEvent('rotate-cw'));
        expect(readPinD(2)).toBe(0);
        expect(readPinD(3)).toBe(1);
        vi.runAllTimers();

        // Rotate CCW: first step transitions backwards from [true, true] -> [true, false] (CLK=1, DT=0)
        fakeEncoder.dispatchEvent(new CustomEvent('rotate-ccw'));
        expect(readPinD(2)).toBe(1);
        expect(readPinD(3)).toBe(0);
        vi.runAllTimers();

        // Keypad: drive R1 LOW and press { row: 0, column: 1 } -> C2 goes LOW
        runner.cpu.writeData(runner.portD.portConfig.DDR, 1 << 4);
        runner.cpu.writeData(runner.portD.portConfig.PORT, 0);
        fakeKeypad.dispatchEvent(new CustomEvent('button-press', { detail: { row: 0, column: 1 } }));
        expect(readPinD(5)).toBe(0);
        fakeKeypad.dispatchEvent(new CustomEvent('button-release', { detail: { row: 0, column: 1 } }));
        expect(readPinD(5)).toBe(1);

        handle.cleanup();
        runner.stop();
    });

    it('computes PWM duty cycle for LED brightness and RGB LED channels (common-cathode & common-anode)', () => {
        const runner = new AVRRunner(EMPTY_HEX);
        const fakeLed = { value: false, brightness: 1 };
        const fakeRgbCathode = { ledRed: 0, ledGreen: 0, ledBlue: 0 };
        const fakeRgbAnode = { ledRed: 0, ledGreen: 0, ledBlue: 0 };

        const elements: Record<string, unknown> = {
            uno: {},
            led1: fakeLed,
            rgb1: fakeRgbCathode,
            rgb2: fakeRgbAnode,
        };
        vi.stubGlobal('document', { getElementById: (id: string) => elements[id] ?? null });

        const diagram: WokwiDiagram = {
            version: 2,
            editor: 'avr8js-electron-playground',
            parts: [
                { id: 'uno', type: 'wokwi-arduino-uno', top: 0, left: 0, rotate: 0 },
                { id: 'led1', type: 'wokwi-led', top: 0, left: 0, rotate: 0 },
                { id: 'rgb1', type: 'wokwi-rgb-led', top: 0, left: 0, rotate: 0, attrs: { common: 'cathode' } },
                { id: 'rgb2', type: 'wokwi-rgb-led', top: 0, left: 0, rotate: 0, attrs: { common: 'anode' } },
            ],
            connections: [
                { id: 'c1', from: 'uno:9', to: 'led1:A', color: 'yellow' },
                { id: 'c2', from: 'uno:10', to: 'rgb1:R', color: 'red' },
                { id: 'c3', from: 'uno:11', to: 'rgb1:G', color: 'green' },
                { id: 'c4', from: 'uno:12', to: 'rgb2:B', color: 'blue' },
            ],
        };

        const handle = setupGPIORouting(diagram, runner);

        // Configure PORTB pins 9..12 (bits 1..4) as outputs
        runner.cpu.writeData(runner.portB.portConfig.DDR, 0b0001_1110);
        // 25 cycles ON for pin 9 (bit 1) & pin 10 (bit 2), 75 cycles OFF -> 25% duty
        // Pin 12 (bit 4, common-anode) LOW for 25 cycles, HIGH for 75 cycles -> 25% ON
        runner.cpu.writeData(runner.portB.portConfig.PORT, 0b0000_0110);
        runner.cpu.cycles += 25;
        runner.cpu.writeData(runner.portB.portConfig.PORT, 0b0001_1000);
        runner.cpu.cycles += 75;

        handle.flush();

        expect(fakeLed.value).toBe(true);
        expect(fakeLed.brightness).toBe(0.25);
        expect(fakeRgbCathode.ledRed).toBe(0.25);
        expect(fakeRgbCathode.ledGreen).toBe(0.75);
        expect(fakeRgbAnode.ledBlue).toBe(0.25);

        handle.cleanup();
        runner.stop();
    });

    it('propagates relay coil activation across P1 -> NO1/NC1 contacts to load LEDs', () => {
        const runner = new AVRRunner(EMPTY_HEX);
        const fakeRelay = { hasSignal: false };
        const fakeNoLed = { value: false };
        const fakeNcLed = { value: false };

        const elements: Record<string, unknown> = {
            uno: {},
            relay1: fakeRelay,
            ledNo: fakeNoLed,
            ledNc: fakeNcLed,
        };
        vi.stubGlobal('document', { getElementById: (id: string) => elements[id] ?? null });

        const diagram: WokwiDiagram = {
            version: 2,
            editor: 'avr8js-electron-playground',
            parts: [
                { id: 'uno', type: 'wokwi-arduino-uno', top: 0, left: 0, rotate: 0 },
                { id: 'relay1', type: 'wokwi-ks2e-m-dc5', top: 0, left: 0, rotate: 0 },
                { id: 'r1', type: 'wokwi-resistor', top: 0, left: 0, rotate: 0 },
                { id: 'ledNo', type: 'wokwi-led', top: 0, left: 0, rotate: 0 },
                { id: 'ledNc', type: 'wokwi-led', top: 0, left: 0, rotate: 0 },
            ],
            connections: [
                { id: 'c0', from: 'relay1:COIL2', to: 'uno:GND.1', color: 'black' },
                { id: 'c1', from: 'relay1:COIL1', to: 'uno:7', color: 'green' },
                { id: 'c2', from: 'relay1:P1', to: 'uno:5V', color: 'red' },
                { id: 'c3', from: 'relay1:NO1', to: 'r1:1', color: 'orange' },
                { id: 'c4', from: 'r1:2', to: 'ledNo:A', color: 'orange' },
                { id: 'c5', from: 'ledNo:C', to: 'uno:GND.1', color: 'black' },
                { id: 'c6', from: 'relay1:NC1', to: 'ledNc:A', color: 'blue' },
                { id: 'c7', from: 'ledNc:C', to: 'uno:GND.1', color: 'black' },
            ],
        };

        const handle = setupGPIORouting(diagram, runner);

        // Initial flush: relay de-energized -> NO OFF, NC ON
        handle.flush();
        expect(fakeRelay.hasSignal).toBe(false);
        expect(fakeNoLed.value).toBe(false);
        expect(fakeNcLed.value).toBe(true);

        // Energize pin 7 (PD7) -> NO ON, NC OFF
        runner.cpu.writeData(runner.portD.portConfig.DDR, 1 << 7);
        runner.cpu.writeData(runner.portD.portConfig.PORT, 1 << 7);
        handle.flush();
        expect(fakeRelay.hasSignal).toBe(true);
        expect(fakeNoLed.value).toBe(true);
        expect(fakeNcLed.value).toBe(false);

        handle.cleanup();
        runner.stop();
    });
});
