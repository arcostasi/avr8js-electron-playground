/**
 * GPIO Router
 * Sets up connection-based GPIO routing between Arduino pins and components.
 * Pure TypeScript — no React dependency.
 *
 * Supported components:
 *  OUTPUT: LED, RGB LED, Buzzer, Relay, LED Bar Graph, 7-Segment
 *  INPUT:  Pushbutton, Slide Switch, DIP Switch, Tilt Switch
 *  ANALOG: Potentiometer, Slide Potentiometer, Analog Joystick
 *  SCAN:   Membrane Keypad (row/column scanning)
 *  ENCODE: Rotary Encoder KY-040 (quadrature output)
 */
import type { WokwiDiagram } from '../types/wokwi.types';
import type { AVRRunner } from '../../shared/execute';
import type { PortBitInfo } from '../utils/pin-mapping';
import type { AVRIOPort } from 'avr8js';
import { getPortAndBit, getADCChannel } from '../utils/pin-mapping';
import { StepperController } from '../../shared/stepper';

/** Cast helper for wokwi custom elements with dynamic props */
type WokwiElement = HTMLElement & Record<string, unknown>;

/** Cleanup function returned by setupGPIORouting */
export type GPIOCleanup = () => void;

/** Resolved Arduino↔Component connection */
interface ResolvedConn {
    arduinoPin: string;
    componentPin: string;
}

/** Ports shorthand */
interface Ports {
    portB: AVRIOPort;
    portC: AVRIOPort;
    portD: AVRIOPort;
}

/** Component handler context */
interface HandlerCtx {
    el: HTMLElement;
    conns: ResolvedConn[];
    ports: Ports;
    runner: AVRRunner;
    cleanups: Array<() => void>;
}

// ── Component handler registry ──

type ComponentHandler = (ctx: HandlerCtx) => void;

const handlerMap: Record<string, ComponentHandler> = {
    'wokwi-led':                     wireLED,
    'wokwi-rgb-led':                 wireLED,
    'wokwi-buzzer':                  wireSignalOutput,
    'wokwi-relay-module':            wireSignalOutput,
    'wokwi-led-bar-graph':           wireLEDBarGraph,
    'wokwi-7segment':                wire7Segment,
    'wokwi-pushbutton':              wirePushbutton,
    'wokwi-pushbutton-6mm':          wirePushbutton,
    'wokwi-slide-switch':            wireSwitch,
    'wokwi-tilt-switch':             wireSwitch,
    'wokwi-dip-switch-8':            wireDipSwitch,
    'wokwi-potentiometer':           wireAnalogInput,
    'wokwi-slide-potentiometer':     wireAnalogInput,
    'wokwi-analog-joystick':         wireJoystick,
    'wokwi-membrane-keypad':         wireKeypad,
    'wokwi-ky-040':                  wireRotaryEncoder,
    'wokwi-servo':                   wireServo,
    'wokwi-stepper-motor':           wireStepperMotor,
    'wokwi-ntc-temperature-sensor':  wireAnalogSensor,
    'wokwi-photoresistor-sensor':    wireAnalogDigitalSensor,
    'wokwi-flame-sensor':            wireAnalogDigitalSensor,
    'wokwi-big-sound-sensor':        wireAnalogDigitalSensor,
    'wokwi-small-sound-sensor':      wireAnalogDigitalSensor,
    'wokwi-heart-beat-sensor':       wireDigitalSensor,
    'wokwi-pir-motion-sensor':       wireDigitalSensor,
    'wokwi-rotary-dialer':           wireRotaryDialer,
};

// ── Main Entry Point ──

/**
 * Parses diagram connections and wires Arduino GPIO pins to component elements.
 * Returns a cleanup function that removes all event listeners.
 */
export function setupGPIORouting(diagram: WokwiDiagram, runner: AVRRunner): GPIOCleanup {
    const cleanups: Array<() => void> = [];
    if (!diagram.connections) return () => {};

    // Build part lookup: partId → { type, element }
    const partMap: Record<string, { type: string; el: HTMLElement }> = {};
    for (const part of diagram.parts) {
        const el = document.getElementById(part.id);
        if (el) partMap[part.id] = { type: part.type, el };
    }

    // Find the Arduino MCU
    const arduinoPart = diagram.parts.find(p =>
        p.type === 'wokwi-arduino-uno' ||
        p.type === 'wokwi-arduino-mega' ||
        p.type === 'wokwi-arduino-nano'
    );
    if (!arduinoPart) return () => {};

    const ports: Ports = { portB: runner.portB, portC: runner.portC, portD: runner.portD };

    // Resolve and group connections by component
    const byComponent = resolveConnections(diagram, arduinoPart.id);

    // Dispatch to per-type handlers
    for (const [compId, conns] of byComponent) {
        const comp = partMap[compId];
        if (!comp) continue;
        const handler = handlerMap[comp.type];
        if (handler) {
            handler({ el: comp.el, conns, ports, runner, cleanups });
        }
    }

    return () => {
        for (const fn of cleanups) fn();
        cleanups.length = 0;
    };
}

// ── Connection Resolver ──

function resolveConnections(
    diagram: WokwiDiagram,
    arduinoId: string,
): Map<string, ResolvedConn[]> {
    const byComponent = new Map<string, ResolvedConn[]>();

    for (const conn of diagram.connections) {
        const [fromPartId, fromPin] = conn.from.split(':');
        const [toPartId, toPin] = conn.to.split(':');

        let arduinoPin: string | undefined;
        let componentPartId: string | undefined;
        let componentPin: string | undefined;

        if (fromPartId === arduinoId) {
            arduinoPin = fromPin;
            componentPartId = toPartId;
            componentPin = toPin;
        } else if (toPartId === arduinoId) {
            arduinoPin = toPin;
            componentPartId = fromPartId;
            componentPin = fromPin;
        }

        if (arduinoPin && componentPartId && componentPin) {
            const list = byComponent.get(componentPartId) || [];
            list.push({ arduinoPin, componentPin });
            byComponent.set(componentPartId, list);
        }
    }

    return byComponent;
}

// ══════════════════════════════════════
// OUTPUT Handlers
// ══════════════════════════════════════

function wireLED({ el, conns, ports }: HandlerCtx): void {
    for (const c of conns) {
        const pi = getPortAndBit(c.arduinoPin, ports);
        if (!pi) continue;
        const led = el as HTMLElement & { value: boolean };
        if (c.componentPin === 'A') {
            pi.port.addListener(() => { led.value = pi.port.pinState(pi.bit) === 1; });
        } else if (c.componentPin === 'C') {
            pi.port.addListener(() => { led.value = pi.port.pinState(pi.bit) !== 1; });
        }
    }
}

function wireSignalOutput({ el, conns, ports }: HandlerCtx): void {
    for (const c of conns) {
        const pi = getPortAndBit(c.arduinoPin, ports);
        if (!pi) continue;
        pi.port.addListener(() => {
            (el as WokwiElement).hasSignal = pi.port.pinState(pi.bit) === 1;
        });
    }
}

function wireLEDBarGraph({ el, conns, ports }: HandlerCtx): void {
    for (const c of conns) {
        const pi = getPortAndBit(c.arduinoPin, ports);
        if (!pi) continue;
        const pinMatch = /^([AC])(\d+)$/.exec(c.componentPin);
        if (!pinMatch) continue;
        const isAnode = pinMatch[1] === 'A';
        const ledIndex = Number.parseInt(pinMatch[2], 10) - 1;
        pi.port.addListener(() => {
            const high = pi.port.pinState(pi.bit) === 1;
            const target = el as WokwiElement;
            if (target.values && Array.isArray(target.values)) {
                const vals = [...target.values];
                vals[ledIndex] = isAnode ? high : !high;
                target.values = vals;
            }
        });
    }
}

const SEGMENT_MAP: Record<string, string> = {
    A: 'a', B: 'b', C: 'c', D: 'd', E: 'e', F: 'f', G: 'g', DP: 'dp', COM: 'com',
};

function wire7Segment({ el, conns, ports }: HandlerCtx): void {
    for (const c of conns) {
        const pi = getPortAndBit(c.arduinoPin, ports);
        if (!pi) continue;
        const seg = SEGMENT_MAP[c.componentPin.toUpperCase()];
        if (!seg) continue;
        pi.port.addListener(() => {
            (el as WokwiElement)[seg] = pi.port.pinState(pi.bit) === 1;
        });
    }
}

// ══════════════════════════════════════
// INPUT Handlers
// ══════════════════════════════════════

function wirePushbutton({ el, conns, ports, cleanups }: HandlerCtx): void {
    for (const c of conns) {
        const pi = getPortAndBit(c.arduinoPin, ports);
        if (!pi) continue;
        pi.port.setPin(pi.bit, true); // default: not pressed → HIGH
        const onPress = () => pi.port.setPin(pi.bit, false);
        const onRelease = () => pi.port.setPin(pi.bit, true);
        el.addEventListener('button-press', onPress);
        el.addEventListener('button-release', onRelease);
        cleanups.push(() => {
            el.removeEventListener('button-press', onPress);
            el.removeEventListener('button-release', onRelease);
        });
    }
}

function wireSwitch({ el, conns, ports, cleanups }: HandlerCtx): void {
    for (const c of conns) {
        const pi = getPortAndBit(c.arduinoPin, ports);
        if (!pi) continue;
        const readSwitch = () => {
            const val = Number((el as WokwiElement).value) || 0;
            pi.port.setPin(pi.bit, val === 1);
        };
        readSwitch();
        const onChange = () => readSwitch();
        el.addEventListener('change', onChange);
        el.addEventListener('pointerup', onChange);
        cleanups.push(() => {
            el.removeEventListener('change', onChange);
            el.removeEventListener('pointerup', onChange);
        });
    }
}

function wireDipSwitch({ el, conns, ports, cleanups }: HandlerCtx): void {
    for (const c of conns) {
        const pi = getPortAndBit(c.arduinoPin, ports);
        if (!pi) continue;
        const dipMatch = /^(\d+)(a?)$/.exec(c.componentPin);
        if (!dipMatch) continue;
        const switchIndex = Number.parseInt(dipMatch[1], 10) - 1;
        const readDip = () => {
            const target = el as WokwiElement;
            if (target.values && Array.isArray(target.values)) {
                pi.port.setPin(pi.bit, !!target.values[switchIndex]);
            }
        };
        readDip();
        const onChange = () => readDip();
        el.addEventListener('change', onChange);
        el.addEventListener('pointerup', onChange);
        cleanups.push(() => {
            el.removeEventListener('change', onChange);
            el.removeEventListener('pointerup', onChange);
        });
    }
}

// ══════════════════════════════════════
// ANALOG Handlers
// ══════════════════════════════════════

function wireAnalogInput({ el, conns, runner }: HandlerCtx): void {
    for (const c of conns) {
        if (c.componentPin !== 'SIG') continue;
        const ch = getADCChannel(c.arduinoPin);
        if (ch === null) continue;
        runner.adcRegistry.bindElement(ch, el, 'value', 1, 0);
    }
}

function wireJoystick({ el, conns, ports, runner, cleanups }: HandlerCtx): void {
    for (const c of conns) {
        if (c.componentPin === 'HORZ' || c.componentPin === 'VER') {
            const ch = getADCChannel(c.arduinoPin);
            if (ch === null) continue;
            const prop = c.componentPin === 'HORZ' ? 'xValue' : 'yValue';
            runner.adcRegistry.bindElement(ch, el, prop, 1, 0);
        } else if (c.componentPin === 'SEL') {
            const pi = getPortAndBit(c.arduinoPin, ports);
            if (!pi) continue;
            pi.port.setPin(pi.bit, true);
            const onPress = () => pi.port.setPin(pi.bit, false);
            const onRelease = () => pi.port.setPin(pi.bit, true);
            el.addEventListener('button-press', onPress);
            el.addEventListener('button-release', onRelease);
            cleanups.push(() => {
                el.removeEventListener('button-press', onPress);
                el.removeEventListener('button-release', onRelease);
            });
        }
    }
}

// ══════════════════════════════════════
// SENSOR Handlers (Analog / Digital)
// ══════════════════════════════════════

/** Pure analog sensor — single OUT pin wired to ADC (NTC, etc.) */
function wireAnalogSensor({ conns, runner }: HandlerCtx): void {
    for (const c of conns) {
        if (c.componentPin !== 'OUT') continue;
        const ch = getADCChannel(c.arduinoPin);
        if (ch !== null) {
            // Default midpoint value; user can later adjust via a hypothetical UI
            runner.adcRegistry.setValue(ch, 512);
        }
    }
}

/**
 * Analog + Digital sensor (Photoresistor, Flame, Sound sensors).
 * AOUT/AO → ADC with configurable value, DOUT/DO → digital threshold.
 */
function wireAnalogDigitalSensor({ conns, ports, runner }: HandlerCtx): void {
    let adcChannel: number | null = null;
    for (const c of conns) {
        const pin = c.componentPin.toUpperCase();
        if (pin === 'AOUT' || pin === 'AO') {
            const ch = getADCChannel(c.arduinoPin);
            if (ch !== null) {
                runner.adcRegistry.setValue(ch, 512);
                adcChannel = ch;
            }
        } else if (pin === 'DOUT' || pin === 'DO') {
            const pi = getPortAndBit(c.arduinoPin, ports);
            if (pi) {
                // Digital output mirrors analog: LOW when analog > 512 (threshold)
                pi.port.setPin(pi.bit, true);
                if (adcChannel !== null) {
                    const ch = adcChannel;
                    // Periodic check — tied to ADC value
                    const interval = setInterval(() => {
                        const val = runner.adcRegistry.getChannel(ch);
                        pi.port.setPin(pi.bit, val <= 512);
                    }, 50);
                    // No cleanup needed for interval since simulation stop destroys runner
                    void interval;
                }
            }
        }
    }
}

/** Pure digital sensor — single OUT pin (PIR, Heartbeat). Default LOW. */
function wireDigitalSensor({ conns, ports }: HandlerCtx): void {
    for (const c of conns) {
        if (c.componentPin !== 'OUT') continue;
        const pi = getPortAndBit(c.arduinoPin, ports);
        if (pi) {
            pi.port.setPin(pi.bit, false);
        }
    }
}

// ══════════════════════════════════════
// DIALER: Rotary Dialer
// ══════════════════════════════════════

/** Rotary dialer — DIAL goes HIGH while dialing, PULSE emits N pulses for digit N */
function wireRotaryDialer({ el, conns, ports, cleanups }: HandlerCtx): void {
    let dialPin: PortBitInfo | null = null;
    let pulsePin: PortBitInfo | null = null;

    for (const c of conns) {
        const pi = getPortAndBit(c.arduinoPin, ports);
        if (!pi) continue;
        if (c.componentPin === 'DIAL') dialPin = pi;
        else if (c.componentPin === 'PULSE') pulsePin = pi;
    }

    if (dialPin) dialPin.port.setPin(dialPin.bit, false);
    if (pulsePin) pulsePin.port.setPin(pulsePin.bit, true);

    const onDialStart = () => {
        if (dialPin) dialPin.port.setPin(dialPin.bit, true);
    };

    const onDial = (e: Event) => {
        const detail = (e as CustomEvent).detail;
        const digit = detail?.digit ?? 0;
        const pulseCount = digit === 0 ? 10 : digit;
        emitPulses(pulsePin, pulseCount);
    };

    const onDialEnd = () => {
        if (dialPin) dialPin.port.setPin(dialPin.bit, false);
    };

    el.addEventListener('dial-start', onDialStart);
    el.addEventListener('dial', onDial);
    el.addEventListener('dial-end', onDialEnd);
    cleanups.push(() => {
        el.removeEventListener('dial-start', onDialStart);
        el.removeEventListener('dial', onDial);
        el.removeEventListener('dial-end', onDialEnd);
    });
}

/** Emit N pulses on a pin (60ms LOW, 40ms HIGH per pulse) */
function emitPulses(pin: PortBitInfo | null, count: number): void {
    if (!pin) return;
    let i = 0;
    function step() {
        if (i >= count) { pin.port.setPin(pin.bit, true); return; }
        pin.port.setPin(pin.bit, false);
        setTimeout(() => {
            pin.port.setPin(pin.bit, true);
            i++;
            setTimeout(step, 40);
        }, 60);
    }
    step();
}

// ══════════════════════════════════════
// SCAN: Membrane Keypad
// ══════════════════════════════════════

/** 4×4 keypad: Arduino scans rows LOW, reads columns */
function wireKeypad({ el, conns, ports, cleanups }: HandlerCtx): void {
    const { rowPins, colPins } = parseKeypadPins(conns, ports);
    const pressedKeys = new Set<string>();

    const updateColumns = () => keypadUpdateColumns(rowPins, colPins, pressedKeys);

    const onDown = (e: Event) => { addOrRemoveKey(pressedKeys, (e as CustomEvent).detail, true); updateColumns(); };
    const onUp = (e: Event) => { addOrRemoveKey(pressedKeys, (e as CustomEvent).detail, false); updateColumns(); };

    for (const rp of rowPins) { if (rp) rp.port.addListener(updateColumns); }
    for (const cp of colPins) { if (cp) cp.port.setPin(cp.bit, true); }

    el.addEventListener('button-press', onDown);
    el.addEventListener('button-release', onUp);
    el.addEventListener('keydown', onDown);
    el.addEventListener('keyup', onUp);
    cleanups.push(() => {
        el.removeEventListener('button-press', onDown);
        el.removeEventListener('button-release', onUp);
        el.removeEventListener('keydown', onDown);
        el.removeEventListener('keyup', onUp);
    });
}

function parseKeypadPins(conns: ResolvedConn[], ports: Ports) {
    const rowPins: Array<PortBitInfo | null> = [null, null, null, null];
    const colPins: Array<PortBitInfo | null> = [null, null, null, null];
    for (const c of conns) {
        const pi = getPortAndBit(c.arduinoPin, ports);
        if (!pi) continue;
        const rm = /^R(\d)$/.exec(c.componentPin);
        const cm = /^C(\d)$/.exec(c.componentPin);
        if (rm) { const i = Number.parseInt(rm[1], 10) - 1; if (i >= 0 && i < 4) rowPins[i] = pi; }
        if (cm) { const i = Number.parseInt(cm[1], 10) - 1; if (i >= 0 && i < 4) colPins[i] = pi; }
    }
    return { rowPins, colPins };
}

function keypadUpdateColumns(
    rowPins: Array<PortBitInfo | null>,
    colPins: Array<PortBitInfo | null>,
    pressedKeys: Set<string>,
): void {
    for (let col = 0; col < 4; col++) {
        const cp = colPins[col];
        if (!cp) continue;
        let pulled = false;
        for (let row = 0; row < 4; row++) {
            const rp = rowPins[row];
            if (rp?.port.pinState(rp.bit) === 0 && pressedKeys.has(`${row},${col}`)) { pulled = true; break; }
        }
        cp.port.setPin(cp.bit, !pulled);
    }
}

function addOrRemoveKey(
    keys: Set<string>,
    detail: { row?: number; col?: number; key?: string } | undefined,
    add: boolean,
): void {
    if (detail?.row !== undefined && detail?.col !== undefined) {
        const k = `${detail.row},${detail.col}`;
        if (add) keys.add(k); else keys.delete(k);
    }
    if (detail?.key) {
        const p = KEYPAD_LAYOUT[detail.key];
        if (p) {
            const k = `${p.row},${p.col}`;
            if (add) keys.add(k); else keys.delete(k);
        }
    }
}

const KEYPAD_LAYOUT: Record<string, { row: number; col: number }> = {
    '1': { row: 0, col: 0 }, '2': { row: 0, col: 1 }, '3': { row: 0, col: 2 }, 'A': { row: 0, col: 3 },
    '4': { row: 1, col: 0 }, '5': { row: 1, col: 1 }, '6': { row: 1, col: 2 }, 'B': { row: 1, col: 3 },
    '7': { row: 2, col: 0 }, '8': { row: 2, col: 1 }, '9': { row: 2, col: 2 }, 'C': { row: 2, col: 3 },
    '*': { row: 3, col: 0 }, '0': { row: 3, col: 1 }, '#': { row: 3, col: 2 }, 'D': { row: 3, col: 3 },
};

// ══════════════════════════════════════
// ENCODE: Rotary Encoder KY-040
// ══════════════════════════════════════

/** Quadrature encoder — generates CLK/DT pulses on rotation */
function wireRotaryEncoder({ el, conns, ports, cleanups }: HandlerCtx): void {
    let clkPin: PortBitInfo | null = null;
    let dtPin: PortBitInfo | null = null;
    let swPin: PortBitInfo | null = null;

    for (const c of conns) {
        const pi = getPortAndBit(c.arduinoPin, ports);
        if (!pi) continue;
        if (c.componentPin === 'CLK') clkPin = pi;
        else if (c.componentPin === 'DT') dtPin = pi;
        else if (c.componentPin === 'SW') swPin = pi;
    }

    if (clkPin) clkPin.port.setPin(clkPin.bit, true);
    if (dtPin) dtPin.port.setPin(dtPin.bit, true);
    if (swPin) swPin.port.setPin(swPin.bit, true);

    const QUAD: [boolean, boolean][] = [
        [true, true], [false, true], [false, false], [true, false],
    ];
    let quadStep = 0;
    let pendingSteps: number[] = [];
    let stepping = false;

    function processSteps() {
        if (pendingSteps.length === 0) { stepping = false; return; }
        stepping = true;
        const dir = pendingSteps.shift() ?? 1;
        quadStep = (quadStep + dir + 4) % 4;
        const [clk, dt] = QUAD[quadStep % 4];
        if (clkPin) clkPin.port.setPin(clkPin.bit, clk);
        if (dtPin) dtPin.port.setPin(dtPin.bit, dt);
        setTimeout(processSteps, 1);
    }

    const onRotate = (e: Event) => {
        const d = (e as CustomEvent).detail;
        const direction = d?.direction === 'ccw' ? -1 : 1;
        const steps = Math.abs(d?.steps ?? 1);
        for (let i = 0; i < steps * 4; i++) pendingSteps.push(direction);
        if (!stepping) processSteps();
    };

    const onPress = () => { if (swPin) swPin.port.setPin(swPin.bit, false); };
    const onRelease = () => { if (swPin) swPin.port.setPin(swPin.bit, true); };

    el.addEventListener('rotate', onRotate);
    el.addEventListener('rotate-cw', onRotate);
    el.addEventListener('rotate-ccw', onRotate);
    el.addEventListener('button-press', onPress);
    el.addEventListener('button-release', onRelease);
    cleanups.push(() => {
        el.removeEventListener('rotate', onRotate);
        el.removeEventListener('rotate-cw', onRotate);
        el.removeEventListener('rotate-ccw', onRotate);
        el.removeEventListener('button-press', onPress);
        el.removeEventListener('button-release', onRelease);
        pendingSteps = [];
    });
}

// ══════════════════════════════════════
// OUTPUT: Servo (PWM → angle)
// ══════════════════════════════════════

function wireServo({ el, conns, ports, runner }: HandlerCtx): void {
    for (const c of conns) {
        if (c.componentPin !== 'PWM') continue;
        const pi = getPortAndBit(c.arduinoPin, ports);
        if (!pi) continue;
        let lastRise = 0;
        let lastState = false;
        pi.port.addListener(() => {
            const high = pi.port.pinState(pi.bit) === 1;
            const now = runner.cpu.cycles / runner.frequency;
            if (high && !lastState) {
                lastRise = now;
            } else if (!high && lastState) {
                const pw = now - lastRise;
                if (pw > 0.0004 && pw < 0.003) {
                    (el as WokwiElement).angle = Math.max(
                        0,
                        Math.min(180, ((pw - 0.0005) / 0.002) * 180),
                    );
                }
            }
            lastState = high;
        });
    }
}

// ══════════════════════════════════════
// OUTPUT: Stepper Motor (4-phase → angle)
// ══════════════════════════════════════

/** Detects 4-phase full-step sequence and updates element angle */
function wireStepperMotor({ el, conns, ports }: HandlerCtx): void {
    const pinMap: Record<string, PortBitInfo | null> = {
        'A-': null, 'A+': null, 'B+': null, 'B-': null,
    };
    for (const c of conns) {
        if (c.componentPin in pinMap) {
            pinMap[c.componentPin] = getPortAndBit(c.arduinoPin, ports);
        }
    }

    const stepper = new StepperController();
    const readPin = (pi: PortBitInfo | null) => pi ? pi.port.pinState(pi.bit) === 1 : false;

    const updateStepper = () => {
        stepper.feedPhase(
            readPin(pinMap['A+']),
            readPin(pinMap['A-']),
            readPin(pinMap['B+']),
            readPin(pinMap['B-']),
        );
        (el as unknown as Record<string, unknown>).angle = stepper.angle;
    };

    // Listen on all connected ports
    const listened = new Set<AVRIOPort>();
    for (const key of Object.keys(pinMap)) {
        const pi = pinMap[key];
        if (pi && !listened.has(pi.port)) {
            pi.port.addListener(updateStepper);
            listened.add(pi.port);
        }
    }
}
