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
import type { ArduinoPorts, PortBitInfo } from '../utils/pin-mapping';
import type { AVRIOPort } from 'avr8js';
import { getPortAndBit, getADCChannel } from '../utils/pin-mapping';
import { resolveBoardProfileFromParts, type BoardProfile } from '../../shared/avr/profiles';
import { StepperController } from '../../shared/stepper';
import type { CompiledSimulationSetup } from './simulation-engine';

/** Cast helper for wokwi custom elements with dynamic props */
type WokwiElement = HTMLElement & Record<string, unknown>;

/** Cleanup function returned by legacy cleanup handlers */
export type GPIOCleanup = () => void;

/** Handle returned by setupGPIORouting with 60 fps DOM flush + cleanup */
export interface GPIORoutingHandle {
    flush: () => void;
    cleanup: () => void;
}

/** Resolved Arduino↔Component connection */
interface ResolvedConn {
    arduinoPin: string;
    componentPin: string;
}

type Ports = Readonly<ArduinoPorts>;

/** Part registry entry used by GPIO handlers */
interface PartEntry {
    type: string;
    el: HTMLElement;
    attrs?: Record<string, string>;
}

/** Component handler context */
interface HandlerCtx {
    partId: string;
    partType: string;
    attrs?: Record<string, string>;
    el: HTMLElement;
    conns: ResolvedConn[];
    ports: Ports;
    boardProfile: BoardProfile;
    runner: AVRRunner;
    diagram: WokwiDiagram;
    partMap: Record<string, PartEntry>;
    cleanups: Array<() => void>;
    flushers: Array<() => void>;
}

// ── Component handler registry ──

type ComponentHandler = (ctx: HandlerCtx) => void;

const handlerMap: Record<string, ComponentHandler> = {
    'wokwi-led':                     wireLED,
    'wokwi-rgb-led':                 wireRGBLed,
    'wokwi-buzzer':                  wireSignalOutput,
    'wokwi-ks2e-m-dc5':              wireRelay,
    'wokwi-relay-module':            wireRelay,
    'wokwi-led-bar-graph':           wireLEDBarGraph,
    'wokwi-7segment':                wire7Segment,
    'wokwi-pushbutton':              wirePushbutton,
    'wokwi-pushbutton-6mm':          wirePushbutton,
    'wokwi-slide-switch':            wireSwitch,
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
    'wokwi-gas-sensor':              wireAnalogDigitalSensor,
    'wokwi-big-sound-sensor':        wireAnalogDigitalSensor,
    'wokwi-small-sound-sensor':      wireAnalogDigitalSensor,
    'wokwi-heart-beat-sensor':       wireAnalogSensor,
    'wokwi-pir-motion-sensor':       wireDigitalSensor,
    'wokwi-rotary-dialer':           wireRotaryDialer,
};

// ── Main Entry Point ──

/**
 * Parses diagram connections and wires Arduino GPIO pins to component elements.
 * Returns a cleanup function that removes all event listeners.
 */
export function setupGPIORouting(
    diagram: WokwiDiagram,
    runner: AVRRunner,
    compiledSetup?: CompiledSimulationSetup,
): GPIORoutingHandle {
    const cleanups: Array<() => void> = [];
    const flushers: Array<() => void> = [];
    if (!diagram.connections) {
        return { flush: () => {}, cleanup: () => {} };
    }

    // Build part lookup: partId → { type, el, attrs }
    const partMap: Record<string, PartEntry> = {};
    for (const part of diagram.parts) {
        const el = document.getElementById(part.id);
        if (el) partMap[part.id] = { type: part.type, el, attrs: part.attrs };
    }

    // Find the Arduino MCU
    const arduinoPart = diagram.parts.find((part) => part.type.startsWith('wokwi-arduino-'));
    if (!arduinoPart) {
        return { flush: () => {}, cleanup: () => {} };
    }

    const ports: Ports = runner.ports;
    const boardProfile = compiledSetup?.boardProfile ?? resolveBoardProfileFromParts(diagram.parts);

    // Resolve and group connections by component
    const byComponent = resolveConnections(diagram, arduinoPart.id);

    // Dispatch to per-type handlers
    for (const [compId, conns] of byComponent) {
        const comp = partMap[compId];
        if (!comp) continue;
        const handler = handlerMap[comp.type];
        if (handler) {
            handler({
                partId: compId,
                partType: comp.type,
                attrs: comp.attrs,
                el: comp.el,
                conns,
                ports,
                boardProfile,
                runner,
                diagram,
                partMap,
                cleanups,
                flushers,
            });
        }
    }

    return {
        flush: () => {
            for (const flushFn of flushers) {
                flushFn();
            }
        },
        cleanup: () => {
            for (const fn of cleanups) fn();
            cleanups.length = 0;
            flushers.length = 0;
        },
    };
}

// ── Connection Resolver ──

/**
 * Component types that are electrically transparent (passive).
 * When tracing a net we pass straight through them to find the
 * Arduino pin that ultimately drives the active component.
 */
const PASSIVE_TYPES = new Set(['wokwi-resistor']);
const POWER_PIN_RE = /^(GND|5V|3V3|3\.3V|AREF|IOREF|VIN|PWR|RESET)/i;
const POSITIVE_POWER_RE = /^(5V|3V3|3\.3V|VIN)(\.\d+)?$/i;

interface ConnectionGraph {
    adjacency: Map<string, string[]>;
    pinsByPart: Map<string, string[]>;
}

interface ComponentTouchPoint {
    componentPin: string;
    startNode: string;
}

function buildConnectionGraph(diagram: WokwiDiagram): ConnectionGraph {
    const adjacency = new Map<string, string[]>();

    const addEdge = (from: string, to: string) => {
        const fromEdges = adjacency.get(from) ?? [];
        const toEdges = adjacency.get(to) ?? [];
        fromEdges.push(to);
        toEdges.push(from);
        adjacency.set(from, fromEdges);
        adjacency.set(to, toEdges);
    };

    for (const conn of diagram.connections) {
        addEdge(conn.from, conn.to);
    }

    const pinsByPart = new Map<string, string[]>();
    for (const node of adjacency.keys()) {
        const partId = node.split(':')[0];
        const pins = pinsByPart.get(partId) ?? [];
        pins.push(node);
        pinsByPart.set(partId, pins);
    }

    return { adjacency, pinsByPart };
}

function enqueuePassivePins(
    partId: string,
    pinsByPart: Map<string, string[]>,
    visited: Set<string>,
    queue: string[],
): void {
    for (const sibling of (pinsByPart.get(partId) ?? [])) {
        if (visited.has(sibling)) continue;
        visited.add(sibling);
        queue.push(sibling);
    }
}

function shouldTraverseIntoPart(partId: string, arduinoId: string, partTypeMap: Map<string, string>): boolean {
    if (partId === arduinoId) {
        return true;
    }
    return PASSIVE_TYPES.has(partTypeMap.get(partId) ?? '');
}

function parseNodeRef(node: string): { partId: string; pinName: string } {
    const colonIdx = node.indexOf(':');
    return {
        partId: node.slice(0, colonIdx),
        pinName: node.slice(colonIdx + 1),
    };
}

function enqueueTraversableNeighbor(
    neighbor: string,
    arduinoId: string,
    partTypeMap: Map<string, string>,
    graph: ConnectionGraph,
    visited: Set<string>,
    queue: string[],
): void {
    if (visited.has(neighbor)) return;

    const { partId } = parseNodeRef(neighbor);
    if (!shouldTraverseIntoPart(partId, arduinoId, partTypeMap)) return;

    visited.add(neighbor);
    queue.push(neighbor);

    if (partId !== arduinoId) {
        enqueuePassivePins(partId, graph.pinsByPart, visited, queue);
    }
}

function enqueuePassiveSelfIfNeeded(
    partId: string,
    partTypeMap: Map<string, string>,
    graph: ConnectionGraph,
    visited: Set<string>,
    queue: string[],
): void {
    if (!PASSIVE_TYPES.has(partTypeMap.get(partId) ?? '')) return;
    enqueuePassivePins(partId, graph.pinsByPart, visited, queue);
}

function findArduinoPinFromNode(
    startNode: string,
    arduinoId: string,
    partTypeMap: Map<string, string>,
    graph: ConnectionGraph,
): string | null {
    const visited = new Set<string>([startNode]);
    const queue: string[] = [startNode];
    let head = 0;

    while (head < queue.length) {
        const node = queue[head++];

        const { partId, pinName } = parseNodeRef(node);

        if (partId === arduinoId) {
            return pinName;
        }

        for (const neighbor of (graph.adjacency.get(node) ?? [])) {
            enqueueTraversableNeighbor(neighbor, arduinoId, partTypeMap, graph, visited, queue);
        }

        enqueuePassiveSelfIfNeeded(partId, partTypeMap, graph, visited, queue);
    }

    return null;
}

function appendTouchPoint(
    touchPointsByPart: Map<string, ComponentTouchPoint[]>,
    partId: string,
    componentPin: string,
    startNode: string,
): void {
    const existing = touchPointsByPart.get(partId);
    if (existing) {
        existing.push({ componentPin, startNode });
        return;
    }
    touchPointsByPart.set(partId, [{ componentPin, startNode }]);
}

function buildTouchPointsByPart(diagram: WokwiDiagram): Map<string, ComponentTouchPoint[]> {
    const touchPointsByPart = new Map<string, ComponentTouchPoint[]>();

    for (const conn of diagram.connections) {
        const { partId: fromPartId, pinName: fromPin } = parseNodeRef(conn.from);
        const { partId: toPartId, pinName: toPin } = parseNodeRef(conn.to);
        appendTouchPoint(touchPointsByPart, fromPartId, fromPin, conn.from);
        if (toPartId !== fromPartId) {
            appendTouchPoint(touchPointsByPart, toPartId, toPin, conn.to);
        }
    }

    return touchPointsByPart;
}

function shouldResolvePart(partId: string, arduinoId: string, partTypeMap: Map<string, string>): boolean {
    if (partId === arduinoId) return false;
    const partType = partTypeMap.get(partId) ?? '';
    if (PASSIVE_TYPES.has(partType)) return false;
    return !partType.startsWith('wokwi-arduino-');
}

function pushResolvedConnection(
    byComponent: Map<string, ResolvedConn[]>,
    partId: string,
    componentPin: string,
    arduinoPin: string,
): void {
    const list = byComponent.get(partId) ?? [];
    if (!list.some((entry) => entry.arduinoPin === arduinoPin && entry.componentPin === componentPin)) {
        list.push({ arduinoPin, componentPin });
        byComponent.set(partId, list);
    }
}

/**
 * Trace through passive components (resistors, etc.) to resolve
 * the Arduino pin that drives (or is driven by) each component pin.
 *
 * Algorithm: BFS starting at a component pin node, traversing the
 * connection graph.  The traversal crosses through passives by also
 * queuing every other pin that belongs to the same passive part,
 * because those pins are electrically shorted inside the passive.
 * Traversal stops (does not enter) at non-passive, non-Arduino nodes.
 */
function resolveConnections(
    diagram: WokwiDiagram,
    arduinoId: string,
): Map<string, ResolvedConn[]> {
    const partTypeMap = new Map(diagram.parts.map((part) => [part.id, part.type]));
    const graph = buildConnectionGraph(diagram);
    const touchPointsByPart = buildTouchPointsByPart(diagram);
    const byComponent = new Map<string, ResolvedConn[]>();

    for (const part of diagram.parts) {
        if (!shouldResolvePart(part.id, arduinoId, partTypeMap)) continue;

        for (const touchPoint of (touchPointsByPart.get(part.id) ?? [])) {
            const arduinoPin = findArduinoPinFromNode(touchPoint.startNode, arduinoId, partTypeMap, graph);
            if (!arduinoPin || POWER_PIN_RE.test(arduinoPin)) continue;

            pushResolvedConnection(byComponent, part.id, touchPoint.componentPin, arduinoPin);
        }
    }

    return byComponent;
}

// ══════════════════════════════════════
// OUTPUT Handlers
// ══════════════════════════════════════

interface PinDutyTracker {
    sampleDuty: () => number;
}

function createPinDutyTracker(
    pi: PortBitInfo,
    runner: AVRRunner,
    activeLow = false,
): PinDutyTracker {
    const readOn = () => {
        const isHigh = pi.port.pinState(pi.bit) === 1;
        return activeLow ? !isHigh : isHigh;
    };

    let lastOn = readOn();
    let lastCycle = runner.cpu.cycles;
    let onCycles = 0;
    let totalCycles = 0;

    pi.port.addListener(() => {
        const now = runner.cpu.cycles;
        const dt = now - lastCycle;
        if (dt > 0) {
            totalCycles += dt;
            if (lastOn) {
                onCycles += dt;
            }
            lastCycle = now;
        }
        lastOn = readOn();
    });

    return {
        sampleDuty: () => {
            const now = runner.cpu.cycles;
            const dt = now - lastCycle;
            if (dt > 0) {
                totalCycles += dt;
                if (lastOn) {
                    onCycles += dt;
                }
                lastCycle = now;
            }

            const duty = totalCycles > 0
                ? Math.max(0, Math.min(1, onCycles / totalCycles))
                : (lastOn ? 1 : 0);

            onCycles = 0;
            totalCycles = 0;
            return duty;
        },
    };
}

function wireLED({ el, conns, ports, boardProfile, runner, flushers }: HandlerCtx): void {
    const led = el as HTMLElement & { value: boolean; brightness?: number };
    let flushedValue = Boolean(led.value);
    const hasBrightness = 'brightness' in led;
    let flushedBrightness = hasBrightness ? Number(led.brightness ?? 0) : 0;

    let tracker: PinDutyTracker | null = null;
    for (const c of conns) {
        const pi = getPortAndBit(c.arduinoPin, ports, boardProfile);
        if (!pi) continue;
        if (c.componentPin === 'A') {
            tracker = createPinDutyTracker(pi, runner, false);
            break;
        }
        if (c.componentPin === 'C') {
            tracker = createPinDutyTracker(pi, runner, true);
            break;
        }
    }

    flushers.push(() => {
        if (!tracker) return;
        const duty = Math.round(tracker.sampleDuty() * 100) / 100;
        const nextValue = duty > 0.005;
        const nextBrightness = nextValue ? duty : 0;
        if (nextValue !== flushedValue) {
            flushedValue = nextValue;
            led.value = nextValue;
        }
        if (hasBrightness && nextBrightness !== flushedBrightness) {
            flushedBrightness = nextBrightness;
            led.brightness = nextBrightness;
        }
    });
}

function wireRGBLed({ el, attrs, conns, ports, boardProfile, runner, flushers }: HandlerCtx): void {
    const rgb = el as WokwiElement;
    const commonAttr = (attrs?.common ?? el.getAttribute?.('common') ?? 'cathode').toLowerCase();
    const isCommonAnode = commonAttr === 'anode';

    const trackers: Partial<Record<'R' | 'G' | 'B', PinDutyTracker>> = {};
    for (const c of conns) {
        const pin = c.componentPin.toUpperCase();
        if (pin !== 'R' && pin !== 'G' && pin !== 'B') continue;
        const pi = getPortAndBit(c.arduinoPin, ports, boardProfile);
        if (!pi) continue;
        trackers[pin] = createPinDutyTracker(pi, runner, isCommonAnode);
    }

    let flushedR = Number(rgb.ledRed ?? 0);
    let flushedG = Number(rgb.ledGreen ?? 0);
    let flushedB = Number(rgb.ledBlue ?? 0);

    flushers.push(() => {
        if (trackers.R) {
            const nextR = Math.round(trackers.R.sampleDuty() * 100) / 100;
            if (nextR !== flushedR) {
                flushedR = nextR;
                rgb.ledRed = nextR;
            }
        }
        if (trackers.G) {
            const nextG = Math.round(trackers.G.sampleDuty() * 100) / 100;
            if (nextG !== flushedG) {
                flushedG = nextG;
                rgb.ledGreen = nextG;
            }
        }
        if (trackers.B) {
            const nextB = Math.round(trackers.B.sampleDuty() * 100) / 100;
            if (nextB !== flushedB) {
                flushedB = nextB;
                rgb.ledBlue = nextB;
            }
        }
    });
}

interface RelayLoadTarget {
    kind: 'led' | 'buzzer';
    el: WokwiElement;
}

function isNodePoweredByRail(
    startNode: string,
    arduinoId: string,
    partTypeMap: Map<string, string>,
    graph: ConnectionGraph,
): boolean {
    const visited = new Set<string>([startNode]);
    const queue = [startNode];
    let head = 0;

    while (head < queue.length) {
        const node = queue[head++];
        const { partId, pinName } = parseNodeRef(node);
        if (partId === arduinoId && POSITIVE_POWER_RE.test(pinName)) {
            return true;
        }
        for (const neighbor of (graph.adjacency.get(node) ?? [])) {
            if (visited.has(neighbor)) continue;
            const neighborPart = parseNodeRef(neighbor).partId;
            if (neighborPart === arduinoId || PASSIVE_TYPES.has(partTypeMap.get(neighborPart) ?? '')) {
                visited.add(neighbor);
                queue.push(neighbor);
            }
        }
        if (PASSIVE_TYPES.has(partTypeMap.get(partId) ?? '')) {
            enqueuePassivePins(partId, graph.pinsByPart, visited, queue);
        }
    }

    return false;
}

function findRelaySwitchedLoads(
    startNode: string,
    relayPartId: string,
    partTypeMap: Map<string, string>,
    graph: ConnectionGraph,
    partMap: Record<string, PartEntry>,
): RelayLoadTarget[] {
    const visited = new Set<string>([startNode]);
    const queue = [startNode];
    const loads: RelayLoadTarget[] = [];
    const seenEls = new Set<HTMLElement>();
    let head = 0;

    while (head < queue.length) {
        const node = queue[head++];
        const { partId, pinName } = parseNodeRef(node);
        const partType = partTypeMap.get(partId) ?? '';

        if (partId !== relayPartId && !PASSIVE_TYPES.has(partType)) {
            const entry = partMap[partId];
            if (entry && !seenEls.has(entry.el)) {
                if (partType === 'wokwi-led' && pinName === 'A') {
                    seenEls.add(entry.el);
                    loads.push({ kind: 'led', el: entry.el as WokwiElement });
                } else if (partType === 'wokwi-buzzer' && (pinName === '1' || pinName === 'SIG')) {
                    seenEls.add(entry.el);
                    loads.push({ kind: 'buzzer', el: entry.el as WokwiElement });
                }
            }
            continue;
        }

        for (const neighbor of (graph.adjacency.get(node) ?? [])) {
            if (visited.has(neighbor)) continue;
            const neighborPart = parseNodeRef(neighbor).partId;
            if (neighborPart === relayPartId) continue;
            visited.add(neighbor);
            queue.push(neighbor);
        }

        if (PASSIVE_TYPES.has(partType)) {
            enqueuePassivePins(partId, graph.pinsByPart, visited, queue);
        }
    }

    return loads;
}

function wireRelay({ partId, el, conns, ports, boardProfile, diagram, partMap, flushers }: HandlerCtx): void {
    const target = el as WokwiElement;
    const arduinoPart = diagram.parts.find((p) => p.type.startsWith('wokwi-arduino-'));
    const partTypeMap = new Map(diagram.parts.map((p) => [p.id, p.type]));
    const graph = buildConnectionGraph(diagram);

    const coilPins = new Map<string, PortBitInfo>();
    for (const c of conns) {
        const upper = c.componentPin.toUpperCase();
        if (upper === 'COIL1' || upper === 'COIL2' || upper === 'IN' || upper === 'SIG') {
            const pi = getPortAndBit(c.arduinoPin, ports, boardProfile);
            if (pi) coilPins.set(upper, pi);
        }
    }

    const coil1 = coilPins.get('COIL1');
    const coil2 = coilPins.get('COIL2');
    const singleCoil = coil1 ?? coil2 ?? coilPins.get('IN') ?? coilPins.get('SIG') ?? null;

    let activeLow = false;
    if (arduinoPart && singleCoil && !(coil1 && coil2)) {
        const otherCoilPin = coil1 ? `${partId}:COIL2` : coil2 ? `${partId}:COIL1` : null;
        if (otherCoilPin && isNodePoweredByRail(otherCoilPin, arduinoPart.id, partTypeMap, graph)) {
            activeLow = true;
        }
    }

    const readEnergized = () => {
        if (coil1 && coil2) {
            return (coil1.port.pinState(coil1.bit) === 1) !== (coil2.port.pinState(coil2.bit) === 1);
        }
        if (!singleCoil) return false;
        const high = singleCoil.port.pinState(singleCoil.bit) === 1;
        return activeLow ? !high : high;
    };

    const noLoads: RelayLoadTarget[] = [];
    const ncLoads: RelayLoadTarget[] = [];
    if (arduinoPart) {
        const contactGroups: Array<[string, string, string]> = [
            ['P1', 'NO1', 'NC1'],
            ['P2', 'NO2', 'NC2'],
            ['COM', 'NO', 'NC'],
        ];
        for (const [polePin, noPin, ncPin] of contactGroups) {
            if (!isNodePoweredByRail(`${partId}:${polePin}`, arduinoPart.id, partTypeMap, graph)) {
                continue;
            }
            noLoads.push(...findRelaySwitchedLoads(`${partId}:${noPin}`, partId, partTypeMap, graph, partMap));
            ncLoads.push(...findRelaySwitchedLoads(`${partId}:${ncPin}`, partId, partTypeMap, graph, partMap));
        }
    }

    let desiredEnergized = readEnergized();
    let dirty = noLoads.length > 0 || ncLoads.length > 0;
    const onCoilChange = () => {
        const nextEnergized = readEnergized();
        if (nextEnergized !== desiredEnergized) {
            desiredEnergized = nextEnergized;
            dirty = true;
        }
    };

    const listened = new Set<AVRIOPort>();
    for (const pi of coilPins.values()) {
        if (!listened.has(pi.port)) {
            pi.port.addListener(onCoilChange);
            listened.add(pi.port);
        }
    }

    flushers.push(() => {
        if (!dirty) return;
        dirty = false;
        if ('hasSignal' in target) {
            target.hasSignal = desiredEnergized;
        }
        for (const load of noLoads) {
            if (load.kind === 'led') load.el.value = desiredEnergized;
            else load.el.hasSignal = desiredEnergized;
        }
        for (const load of ncLoads) {
            if (load.kind === 'led') load.el.value = !desiredEnergized;
            else load.el.hasSignal = !desiredEnergized;
        }
    });
}

function wireSignalOutput({ el, conns, ports, boardProfile, runner, flushers }: HandlerCtx): void {
    const target = el as WokwiElement;
    let desiredSignal = Boolean(target.hasSignal);

    let tracker: PinDutyTracker | null = null;
    for (const c of conns) {
        const pi = getPortAndBit(c.arduinoPin, ports, boardProfile);
        if (!pi) continue;
        tracker = createPinDutyTracker(pi, runner, false);
        break;
    }

    flushers.push(() => {
        if (!tracker) return;
        const nextSignal = tracker.sampleDuty() > 0.005;
        if (nextSignal !== desiredSignal) {
            desiredSignal = nextSignal;
            target.hasSignal = nextSignal;
        }
    });
}

function wireLEDBarGraph({ el, conns, ports, boardProfile, flushers }: HandlerCtx): void {
    const target = el as WokwiElement;
    const values: boolean[] = Array.isArray(target.values)
        ? [...(target.values as boolean[])]
        : Array.from({ length: 10 }, () => false);
    let dirty = false;

    for (const c of conns) {
        const pi = getPortAndBit(c.arduinoPin, ports, boardProfile);
        if (!pi) continue;
        const pinMatch = /^([AC])(\d+)$/.exec(c.componentPin);
        if (!pinMatch) continue;
        const isAnode = pinMatch[1] === 'A';
        const ledIndex = Number.parseInt(pinMatch[2], 10) - 1;
        pi.port.addListener(() => {
            const high = pi.port.pinState(pi.bit) === 1;
            const nextLit = isAnode ? high : !high;
            if (values[ledIndex] !== nextLit) {
                values[ledIndex] = nextLit;
                dirty = true;
            }
        });
    }

    flushers.push(() => {
        if (!dirty) return;
        dirty = false;
        target.values = [...values];
    });
}

/** Index in the `values` array for each segment pin name */
const SEGMENT_INDEX: Record<string, number> = {
    A: 0, B: 1, C: 2, D: 3, E: 4, F: 5, G: 6, DP: 7,
};

function wire7Segment({ el, attrs, conns, ports, boardProfile, flushers }: HandlerCtx): void {
    const seg7 = el as WokwiElement;

    // common cathode → HIGH = segment ON; common anode → LOW = segment ON
    const commonAttr = (attrs?.common ?? seg7.getAttribute?.('common') ?? 'cathode').toLowerCase();
    const isAnode = commonAttr === 'anode';

    // Initialise values array if not already present
    if (!Array.isArray(seg7.values)) {
        seg7.values = [0, 0, 0, 0, 0, 0, 0, 0];
    }
    const values: number[] = [...(seg7.values as number[])];
    let dirty = false;

    for (const c of conns) {
        const pi = getPortAndBit(c.arduinoPin, ports, boardProfile);
        if (!pi) continue;
        const upperPin = c.componentPin.toUpperCase();
        // Skip COM / DIG select pins — not individual segment signals
        if (upperPin.startsWith('COM') || upperPin.startsWith('DIG')) continue;
        const idx = SEGMENT_INDEX[upperPin];
        if (idx === undefined) continue;

        pi.port.addListener(() => {
            const high = pi.port.pinState(pi.bit) === 1;
            const lit = isAnode ? !high : high;
            const nextVal = lit ? 1 : 0;
            if (values[idx] !== nextVal) {
                values[idx] = nextVal;
                dirty = true;
            }
        });
    }

    flushers.push(() => {
        if (!dirty) return;
        dirty = false;
        seg7.values = [...values];
    });
}

// ══════════════════════════════════════
// INPUT Handlers
// ══════════════════════════════════════

function wirePushbutton({ el, conns, ports, cleanups, boardProfile }: HandlerCtx): void {
    for (const c of conns) {
        const pi = getPortAndBit(c.arduinoPin, ports, boardProfile);
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

function wireSwitch({ el, conns, ports, cleanups, boardProfile }: HandlerCtx): void {
    for (const c of conns) {
        const pi = getPortAndBit(c.arduinoPin, ports, boardProfile);
        if (!pi) continue;
        const readSwitch = () => {
            const val = Number((el as WokwiElement).value) || 0;
            // val=1 means switch is closed → pin connected to GND → LOW (false)
            // val=0 means switch is open  → pin pulled HIGH by INPUT_PULLUP → HIGH (true)
            pi.port.setPin(pi.bit, val !== 1);
        };
        readSwitch();
        const onChange = () => readSwitch();
        el.addEventListener('input', onChange);
        el.addEventListener('change', onChange);
        cleanups.push(() => {
            el.removeEventListener('input', onChange);
            el.removeEventListener('change', onChange);
        });
    }
}

function wireDipSwitch({ el, conns, ports, cleanups, boardProfile }: HandlerCtx): void {
    for (const c of conns) {
        const pi = getPortAndBit(c.arduinoPin, ports, boardProfile);
        if (!pi) continue;
        const dipMatch = /^(\d+)(a?)$/i.exec(c.componentPin);
        if (!dipMatch) continue;
        const switchIndex = Number.parseInt(dipMatch[1], 10) - 1;
        const readDip = () => {
            const target = el as WokwiElement;
            if (target.values && Array.isArray(target.values)) {
                // switch ON (true/1) → connected to GND → LOW (false); OFF → pull-up HIGH (true)
                pi.port.setPin(pi.bit, !target.values[switchIndex]);
            }
        };
        readDip();
        const onChange = () => readDip();
        el.addEventListener('switch-change', onChange);
        el.addEventListener('change', onChange);
        cleanups.push(() => {
            el.removeEventListener('switch-change', onChange);
            el.removeEventListener('change', onChange);
        });
    }
}

// ══════════════════════════════════════
// ANALOG Handlers
// ══════════════════════════════════════

function wireAnalogInput({ el, partType, attrs, conns, runner, boardProfile }: HandlerCtx): void {
    const target = el as WokwiElement;
    const defaultMax = partType === 'wokwi-slide-potentiometer' ? 100 : 1023;
    const attrMin = attrs?.min !== undefined ? Number(attrs.min) : undefined;
    const attrMax = attrs?.max !== undefined ? Number(attrs.max) : undefined;
    const min = typeof target.min === 'number' && Number.isFinite(target.min)
        ? target.min
        : (attrMin !== undefined && Number.isFinite(attrMin) ? attrMin : 0);
    const max = typeof target.max === 'number' && Number.isFinite(target.max)
        ? target.max
        : (attrMax !== undefined && Number.isFinite(attrMax) ? attrMax : defaultMax);
    const span = max - min || 1;
    const scale = 1023 / span;
    const offset = -min * scale;

    for (const c of conns) {
        if (c.componentPin !== 'SIG') continue;
        const ch = getADCChannel(c.arduinoPin, boardProfile);
        if (ch === null) continue;
        runner.adcRegistry.bindElement(ch, el, 'value', scale, offset);
    }
}

function wireJoystick({ el, conns, ports, runner, cleanups, boardProfile }: HandlerCtx): void {
    for (const c of conns) {
        if (c.componentPin === 'HORZ' || c.componentPin === 'VERT' || c.componentPin === 'VER') {
            const ch = getADCChannel(c.arduinoPin, boardProfile);
            if (ch === null) continue;
            const prop = c.componentPin === 'HORZ' ? 'xValue' : 'yValue';
            // Wokwi joystick reports [-1, +1]; map linearly to [0, 1023] (center 0 -> 512)
            runner.adcRegistry.bindElement(ch, el, prop, 511.5, 511.5);
        } else if (c.componentPin === 'SEL') {
            const pi = getPortAndBit(c.arduinoPin, ports, boardProfile);
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

/** Pure analog sensor — single OUT pin wired to ADC (NTC, Heartbeat, etc.) */
function wireAnalogSensor({ el, partType, conns, runner, boardProfile }: HandlerCtx): void {
    const target = el as WokwiElement;
    if ('ledPower' in target) {
        target.ledPower = true;
    }
    const defaultAdc = partType === 'wokwi-heart-beat-sensor' ? 300 : 512;
    for (const c of conns) {
        if (c.componentPin !== 'OUT') continue;
        const ch = getADCChannel(c.arduinoPin, boardProfile);
        if (ch !== null) {
            runner.adcRegistry.setValue(ch, defaultAdc);
        }
    }
}

function syncSensorIndicatorLeds(el: WokwiElement, detected: boolean): void {
    if ('ledD0' in el) el.ledD0 = detected;
    if ('ledDO' in el) el.ledDO = detected;
    if ('ledSignal' in el) el.ledSignal = detected;
}

/**
 * Analog + Digital sensor (Photoresistor, Flame, Gas, Sound sensors).
 * AOUT/AO → ADC with configurable value, DOUT/DO → digital threshold.
 */
function setupAnalogMirroredDigital(
    el: WokwiElement,
    pi: PortBitInfo,
    ch: number,
    runner: AVRRunner,
    cleanups: Array<() => void>,
): void {
    const updateDigital = () => {
        const detected = runner.adcRegistry.getChannel(ch) > 512;
        pi.port.setPin(pi.bit, !detected);
        syncSensorIndicatorLeds(el, detected);
    };
    updateDigital();
    const intervalId = setInterval(updateDigital, 50);
    cleanups.push(() => clearInterval(intervalId));
}

function wireAnalogDigitalSensor({ el, conns, ports, runner, cleanups, boardProfile }: HandlerCtx): void {
    const target = el as WokwiElement;
    if ('ledPower' in target) {
        target.ledPower = true;
    }
    // Pass 1: resolve ADC channel from AOUT/AO pin
    let adcChannel: number | null = null;
    for (const c of conns) {
        const pin = c.componentPin.toUpperCase();
        if (pin === 'AOUT' || pin === 'AO') {
            const ch = getADCChannel(c.arduinoPin, boardProfile);
            if (ch !== null) { runner.adcRegistry.setValue(ch, 512); adcChannel = ch; }
        }
    }
    // Pass 2: wire DOUT/DO — adcChannel is now resolved regardless of connection order
    for (const c of conns) {
        const pin = c.componentPin.toUpperCase();
        if (pin === 'DOUT' || pin === 'DO') {
            const pi = getPortAndBit(c.arduinoPin, ports, boardProfile);
            if (pi && adcChannel !== null) { setupAnalogMirroredDigital(target, pi, adcChannel, runner, cleanups); }
            else if (pi) { pi.port.setPin(pi.bit, true); }
        }
    }
}

/** Pure digital sensor — single OUT pin (PIR, Heartbeat). Default LOW. */
function wireDigitalSensor({ conns, ports, boardProfile }: HandlerCtx): void {
    for (const c of conns) {
        if (c.componentPin !== 'OUT') continue;
        const pi = getPortAndBit(c.arduinoPin, ports, boardProfile);
        if (pi) {
            pi.port.setPin(pi.bit, false);
        }
    }
}

// ══════════════════════════════════════
// DIALER: Rotary Dialer
// ══════════════════════════════════════

/** Rotary dialer — DIAL goes HIGH while dialing, PULSE emits N pulses for digit N */
function wireRotaryDialer({ el, conns, ports, cleanups, boardProfile }: HandlerCtx): void {
    let dialPin: PortBitInfo | null = null;
    let pulsePin: PortBitInfo | null = null;
    const pulseTimers = new Set<ReturnType<typeof setTimeout>>();

    for (const c of conns) {
        const pi = getPortAndBit(c.arduinoPin, ports, boardProfile);
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
        emitPulses(pulsePin, pulseCount, pulseTimers);
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
        for (const timer of pulseTimers) {
            clearTimeout(timer);
        }
        pulseTimers.clear();
    });
}

/** Emit N pulses on a pin (60ms LOW, 40ms HIGH per pulse) */
function emitPulses(
    pin: PortBitInfo | null,
    count: number,
    timers: Set<ReturnType<typeof setTimeout>>,
): void {
    if (!pin) return;
    let i = 0;
    function schedule(fn: () => void, delayMs: number) {
        const timer = setTimeout(() => {
            timers.delete(timer);
            fn();
        }, delayMs);
        timers.add(timer);
    }
    function step() {
        if (i >= count) { pin.port.setPin(pin.bit, true); return; }
        pin.port.setPin(pin.bit, false);
        schedule(() => {
            pin.port.setPin(pin.bit, true);
            i++;
            schedule(step, 40);
        }, 60);
    }
    step();
}

// ══════════════════════════════════════
// SCAN: Membrane Keypad
// ══════════════════════════════════════

/** 4×4 keypad: Arduino scans rows LOW, reads columns */
function wireKeypad({ el, conns, ports, cleanups, boardProfile }: HandlerCtx): void {
    const { rowPins, colPins } = parseKeypadPins(conns, ports, boardProfile);
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

function parseKeypadPins(conns: ResolvedConn[], ports: Ports, boardProfile: BoardProfile) {
    const rowPins: Array<PortBitInfo | null> = [null, null, null, null];
    const colPins: Array<PortBitInfo | null> = [null, null, null, null];
    for (const c of conns) {
        const pi = getPortAndBit(c.arduinoPin, ports, boardProfile);
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
    detail: { row?: number; col?: number; column?: number; key?: string } | undefined,
    add: boolean,
): void {
    const col = detail?.column ?? detail?.col;
    if (detail?.row !== undefined && col !== undefined) {
        const k = `${detail.row},${col}`;
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
function wireRotaryEncoder({ el, conns, ports, cleanups, boardProfile }: HandlerCtx): void {
    let clkPin: PortBitInfo | null = null;
    let dtPin: PortBitInfo | null = null;
    let swPin: PortBitInfo | null = null;

    for (const c of conns) {
        const pi = getPortAndBit(c.arduinoPin, ports, boardProfile);
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
    let stepTimer: ReturnType<typeof setTimeout> | null = null;

    function processSteps() {
        stepTimer = null;
        if (pendingSteps.length === 0) { stepping = false; return; }
        stepping = true;
        const dir = pendingSteps.shift() ?? 1;
        quadStep = (quadStep + dir + 4) % 4;
        const [clk, dt] = QUAD[quadStep % 4];
        if (clkPin) clkPin.port.setPin(clkPin.bit, clk);
        if (dtPin) dtPin.port.setPin(dtPin.bit, dt);
        stepTimer = setTimeout(processSteps, 1);
    }

    const onRotate = (e: Event) => {
        const d = (e as CustomEvent).detail;
        const direction = e.type === 'rotate-ccw' || d?.direction === 'ccw' ? -1 : 1;
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
        if (stepTimer !== null) {
            clearTimeout(stepTimer);
            stepTimer = null;
        }
        pendingSteps = [];
        stepping = false;
    });
}

// ══════════════════════════════════════
// OUTPUT: Servo (PWM → angle)
// ══════════════════════════════════════

function wireServo({ el, conns, ports, runner, boardProfile, flushers }: HandlerCtx): void {
    const target = el as WokwiElement;
    let desiredAngle: number | null = null;
    let dirty = false;

    for (const c of conns) {
        if (c.componentPin !== 'PWM') continue;
        const pi = getPortAndBit(c.arduinoPin, ports, boardProfile);
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
                    const nextAngle = Math.max(
                        0,
                        Math.min(180, ((pw - 0.0005) / 0.002) * 180),
                    );
                    if (nextAngle !== desiredAngle) {
                        desiredAngle = nextAngle;
                        dirty = true;
                    }
                }
            }
            lastState = high;
        });
    }

    flushers.push(() => {
        if (!dirty || desiredAngle === null) return;
        dirty = false;
        target.angle = desiredAngle;
    });
}

// ══════════════════════════════════════
// OUTPUT: Stepper Motor (4-phase → angle)
// ══════════════════════════════════════

/** Detects 4-phase full-step sequence and updates element angle */
function wireStepperMotor({ el, attrs, conns, ports, boardProfile, flushers }: HandlerCtx): void {
    const pinMap: Record<string, PortBitInfo | null> = {
        'A-': null, 'A+': null, 'B+': null, 'B-': null,
    };
    for (const c of conns) {
        if (c.componentPin in pinMap) {
            pinMap[c.componentPin] = getPortAndBit(c.arduinoPin, ports, boardProfile);
        }
    }

    const stepsAttr = attrs?.stepsPerRev
        ?? attrs?.stepsperrev
        ?? el.getAttribute('stepsperrev')
        ?? el.getAttribute('stepsPerRev');
    const stepsPerRev = stepsAttr ? (Number.parseInt(stepsAttr, 10) || 200) : 200;
    const stepper = new StepperController();
    stepper.stepsPerRevolution = stepsPerRev;
    const readPin = (pi: PortBitInfo | null) => pi ? pi.port.pinState(pi.bit) === 1 : false;
    let lastFlushedAngle = stepper.angle;

    const updateStepper = () => {
        stepper.feedPhase(
            readPin(pinMap['A+']),
            readPin(pinMap['A-']),
            readPin(pinMap['B+']),
            readPin(pinMap['B-']),
        );
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

    flushers.push(() => {
        if (stepper.angle !== lastFlushedAngle) {
            lastFlushedAngle = stepper.angle;
            (el as unknown as Record<string, unknown>).angle = lastFlushedAngle;
        }
    });
}
