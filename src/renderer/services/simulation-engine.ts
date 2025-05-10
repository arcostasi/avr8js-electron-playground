/**
 * Simulation Engine
 * Factory for hardware controllers from diagram parts.
 * Handles: LCD (1602/2004), SSD1306, NeoPixel (single/ring/matrix),
 *          Speaker/Buzzer audio, DHT22, HC-SR04, IR Receiver/Remote.
 * Pure TypeScript — no React dependency.
 */
import type { WokwiDiagram, HardwareController } from '../types/wokwi.types';
import type { AVRRunner } from '../../shared/execute';
import { I2CBus } from '../../shared/i2c-bus';
import { LCD1602Controller } from '../../shared/lcd1602';
import { LCD2004Controller } from '../../shared/lcd2004';
import { SSD1306Controller } from '../../shared/ssd1306';
import { WS2812Controller } from '../../shared/ws2812';
import { DHT22Controller } from '../../shared/dht22';
import { HCSR04Controller } from '../../shared/hc-sr04';
import { IRController } from '../../shared/ir';
import { DS1307Controller } from '../../shared/ds1307';
import { MPU6050Controller, MPU6050_ADDR } from '../../shared/mpu6050';
import { ILI9341Controller } from '../../shared/ili9341';
import { getPortAndBit } from '../utils/pin-mapping';
import type { AVRIOPort } from 'avr8js';
import { attachCustomChipControllers } from './custom-chips';
import type { CustomChipArtifacts, CustomChipControl, CustomChipManifests } from './custom-chips';
import { buildNetlist } from './netlist-builder';
import type { NetlistEntry } from './netlist-builder';

/** Port set shorthand used throughout the engine */
interface PortSet {
    portB: AVRIOPort;
    portC: AVRIOPort;
    portD: AVRIOPort;
}

// ── Connection resolution helpers ──

interface ResolvedPin {
    arduinoPin: string;
    componentPin: string;
}

export interface CompiledSimulationSetup {
    arduinoId: string;
    netlist: NetlistEntry[];
    componentPinsById: Map<string, ResolvedPin[]>;
    structuralHash: string;
}

/**
 * Get the Arduino pin connected to a specific component pin name (e.g., "DIN", "TRIG").
 */
function findArduinoPin(pins: ResolvedPin[], componentPin: string): string | null {
    const match = pins.find(p => p.componentPin === componentPin);
    return match?.arduinoPin ?? null;
}

export function compileSimulationSetup(diagram: WokwiDiagram): CompiledSimulationSetup {
    const arduinoPart = diagram.parts.find(p =>
        p.type === 'wokwi-arduino-uno' ||
        p.type === 'wokwi-arduino-mega' ||
        p.type === 'wokwi-arduino-nano'
    );
    const netlist = buildNetlist(diagram);
    const componentPinsById = new Map<string, ResolvedPin[]>();

    for (const entry of netlist) {
        const pins = componentPinsById.get(entry.componentId) ?? [];
        pins.push({ arduinoPin: entry.arduinoPin, componentPin: entry.componentPin });
        componentPinsById.set(entry.componentId, pins);
    }

    const structuralHash = JSON.stringify({
        parts: diagram.parts.map((part) => ({
            id: part.id,
            type: part.type,
            rotate: part.rotate,
            attrs: part.attrs ?? {},
            hide: part.hide ?? false,
        })),
        connections: diagram.connections.map((connection) => ({
            id: connection.id,
            from: connection.from,
            to: connection.to,
            color: connection.color,
            waypoints: connection.waypoints ?? [],
            routeHints: connection.routeHints ?? [],
        })),
    });

    return {
        arduinoId: arduinoPart?.id ?? '',
        netlist,
        componentPinsById,
        structuralHash,
    };
}

// ── NeoPixel helpers ──

function getNeoPixelCount(part: { type: string; attrs?: Record<string, string> }): number {
    if (part.type === 'wokwi-neopixel') return 1;
    if (part.type === 'wokwi-led-ring') {
        return Number.parseInt(part.attrs?.pixels ?? '16', 10) || 16;
    }
    if (part.type === 'wokwi-neopixel-matrix') {
        const rows = Number.parseInt(part.attrs?.rows ?? '8', 10) || 8;
        const cols = Number.parseInt(part.attrs?.cols ?? '8', 10) || 8;
        return rows * cols;
    }
    return 0;
}

/** Extract RGB from WS2812 GRB-ordered uint32 (bits 23-16=G, 15-8=R, 7-0=B) */
function grb2rgb(pixel: number): { r: number; g: number; b: number } {
    return {
        g: ((pixel >> 16) & 0xFF) / 255,
        r: ((pixel >> 8) & 0xFF) / 255,
        b: (pixel & 0xFF) / 255,
    };
}

// ── LCD state interface ──

interface LcdState {
    characters: Uint8Array;
    blink: boolean;
    cursor: boolean;
    cursorX: number;
    cursorY: number;
}

// ── Adjustable device tracking ──

/** A runtime device whose properties can be adjusted via the property editor */
export interface AdjustableDevice {
    partId: string;
    partType: string;
    label?: string;
    properties?: CustomChipControl[];
    /** Get a property value. Keys depend on device type. */
    get: (key: string) => number;
    /** Set a property value. */
    set: (key: string, value: number) => void;
}

// ── Main API ──

const NEOPIXEL_TYPES = new Set(['wokwi-neopixel', 'wokwi-led-ring', 'wokwi-neopixel-matrix']);

/**
 * Creates hardware controllers for I2C and pin-based components found in the diagram.
 * Returns a list of controllers that should be updated every simulation tick,
 * a list of adjustable devices for the property editor,
 * plus a cleanup function for event listeners.
 */
export function createHardwareControllers( // NOSONAR: central hardware factory kept flat for device registration clarity
    diagram: WokwiDiagram,
    runner: AVRRunner,
    i2cBus: I2CBus,
    customChipArtifacts: CustomChipArtifacts = {},
    customChipManifests: CustomChipManifests = {},
    onChipLog?: (text: string) => void,
    compiledSetup?: CompiledSimulationSetup,
): {
    controllers: HardwareController[];
    adjustable: AdjustableDevice[];
    cleanup: () => void;
} {
    const controllers: HardwareController[] = [];
    const adjustable: AdjustableDevice[] = [];
    const cleanups: Array<() => void> = [];
    const cpuMillis = () => (runner.cpu.cycles / runner.frequency) * 1000;
    const ports = { portB: runner.portB, portC: runner.portC, portD: runner.portD };
    const resolvedSetup = compiledSetup ?? compileSimulationSetup(diagram);
    const elementById = new Map<string, HTMLElement>();
    for (const part of diagram.parts) {
        const element = document.getElementById(part.id);
        if (element) {
            elementById.set(part.id, element);
        }
    }
    const componentPinsFor = (partId: string) => resolvedSetup.componentPinsById.get(partId) ?? [];

    // Collect IR controllers so IR remotes can link to them
    const irControllers: IRController[] = [];

    for (const part of diagram.parts) {
        const el = elementById.get(part.id);
        if (!el) continue;

        // ── I2C displays ──
        if (part.type === 'wokwi-lcd1602') {
            setupLCD1602(el, cpuMillis, i2cBus, controllers);
        } else if (part.type === 'wokwi-lcd2004') {
            setupLCD2004(el, cpuMillis, i2cBus, controllers);
        } else if (part.type === 'wokwi-ssd1306') {
            setupSSD1306(el, cpuMillis, i2cBus, controllers);
        } else if (part.type === 'wokwi-ili9341') {
            setupILI9341(part, el, componentPinsFor(part.id), runner, ports, controllers);
        }

        // ── NeoPixel (single, ring, matrix) ──
        else if (NEOPIXEL_TYPES.has(part.type)) {
            setupNeopixel(part, el, componentPinsFor(part.id), runner, ports, controllers);
        }

        // ── Speaker / Buzzer audio ──
        else if (part.type === 'wokwi-buzzer') {
            setupSpeaker(part, el, componentPinsFor(part.id), runner, ports);
        }

        // ── DHT22 sensor ──
        else if (part.type === 'wokwi-dht22') {
            const dht = setupDHT22(part, componentPinsFor(part.id), runner, ports);
            if (dht) {
                adjustable.push({
                    partId: part.id, partType: part.type,
                    get: (k) => k === 'temperature' ? dht.temperature : dht.humidity,
                    set: (k, v) => {
                        if (k === 'temperature') dht.temperature = v;
                        else if (k === 'humidity') dht.humidity = v;
                    },
                });
            }
        }

        // ── HC-SR04 ultrasonic ──
        else if (part.type === 'wokwi-hc-sr04') {
            const sr = setupHCSR04(part, componentPinsFor(part.id), runner, ports);
            if (sr) {
                adjustable.push({
                    partId: part.id, partType: part.type,
                    get: () => sr.distance,
                    set: (_k, v) => { sr.distance = v; },
                });
            }
        }

        // ── IR Receiver ──
        else if (part.type === 'wokwi-ir-receiver') {
            const ctrl = setupIRReceiver(part, componentPinsFor(part.id), runner, ports);
            if (ctrl) irControllers.push(ctrl);
        }

        // ── DS1307 RTC ──
        else if (part.type === 'wokwi-ds1307') {
            const rtc = new DS1307Controller();
            i2cBus.registerDevice(0x68, rtc);
        } else if (part.type === 'wokwi-mpu6050') {
            const mpu6050 = new MPU6050Controller(cpuMillis);
            i2cBus.registerDevice(MPU6050_ADDR, mpu6050);
            adjustable.push({
                partId: part.id,
                partType: part.type,
                label: 'MPU6050 IMU',
                properties: [
                    { key: 'accelX', label: 'Accel X', min: -8, max: 8, step: 0.1, unit: 'g', defaultValue: 0 },
                    { key: 'accelY', label: 'Accel Y', min: -8, max: 8, step: 0.1, unit: 'g', defaultValue: 0 },
                    { key: 'accelZ', label: 'Accel Z', min: -8, max: 8, step: 0.1, unit: 'g', defaultValue: 1 },
                    { key: 'gyroX', label: 'Gyro X', min: -500, max: 500, step: 1, unit: 'dps', defaultValue: 0 },
                    { key: 'gyroY', label: 'Gyro Y', min: -500, max: 500, step: 1, unit: 'dps', defaultValue: 0 },
                    { key: 'gyroZ', label: 'Gyro Z', min: -500, max: 500, step: 1, unit: 'dps', defaultValue: 0 },
                    { key: 'temperature', label: 'Temperature', min: -40, max: 85, step: 0.1, unit: 'C', defaultValue: 24 },
                ],
                get: (key) => {
                    switch (key) {
                        case 'accelX':
                            return mpu6050.getAccel('x');
                        case 'accelY':
                            return mpu6050.getAccel('y');
                        case 'accelZ':
                            return mpu6050.getAccel('z');
                        case 'gyroX':
                            return mpu6050.getGyro('x');
                        case 'gyroY':
                            return mpu6050.getGyro('y');
                        case 'gyroZ':
                            return mpu6050.getGyro('z');
                        default:
                            return mpu6050.getTemperatureC();
                    }
                },
                set: (key, value) => {
                    switch (key) {
                        case 'accelX':
                            mpu6050.setAccel('x', value);
                            break;
                        case 'accelY':
                            mpu6050.setAccel('y', value);
                            break;
                        case 'accelZ':
                            mpu6050.setAccel('z', value);
                            break;
                        case 'gyroX':
                            mpu6050.setGyro('x', value);
                            break;
                        case 'gyroY':
                            mpu6050.setGyro('y', value);
                            break;
                        case 'gyroZ':
                            mpu6050.setGyro('z', value);
                            break;
                        case 'temperature':
                            mpu6050.setTemperatureC(value);
                            break;
                        default:
                            break;
                    }
                },
            });
        }
    }

    // ── IR Remote → all IR Receivers ──
    for (const part of diagram.parts) {
        if (part.type !== 'wokwi-ir-remote') continue;
        const el = elementById.get(part.id);
        if (!el) continue;
        setupIRRemote(el, irControllers, cleanups);
    }

    // ── Analog sensor adjustable entries ──
    // These sensors are wired via ADC in gpio-router; track them for UI
    const ANALOG_SENSOR_TYPES = new Set([
        'wokwi-ntc-temperature-sensor',
        'wokwi-photoresistor-sensor',
        'wokwi-flame-sensor',
        'wokwi-gas-sensor',
        'wokwi-big-sound-sensor',
        'wokwi-small-sound-sensor',
        'wokwi-heart-beat-sensor',
    ]);
    const DIGITAL_SENSOR_TYPES = new Set([
        'wokwi-pir-motion-sensor',
    ]);

    for (const part of diagram.parts) {
        if (ANALOG_SENSOR_TYPES.has(part.type)) {
            // Find which ADC channel this sensor's OUT/AO pin is connected to
            const compPins = componentPinsFor(part.id);
            let adcCh: number | null = null;
            for (const cp of compPins) {
                const pin = cp.componentPin.toUpperCase();
                if (pin === 'OUT' || pin === 'AO' || pin === 'AOUT') {
                    const pinNum = cp.arduinoPin.replace(/^A/, '');
                    const ch = Number.parseInt(pinNum, 10);
                    if (!Number.isNaN(ch) && ch >= 0 && ch < 8) {
                        adcCh = ch;
                        break;
                    }
                }
            }
            if (adcCh !== null) {
                const ch = adcCh;
                adjustable.push({
                    partId: part.id, partType: part.type,
                    get: () => runner.adcRegistry.getChannel(ch),
                    set: (_k, v) => runner.adcRegistry.setValue(ch, v),
                });
            }
        } else if (DIGITAL_SENSOR_TYPES.has(part.type)) {
            // Digital sensors: find the OUT/SIG pin
            const compPins = componentPinsFor(part.id);
            for (const cp of compPins) {
                const pin = cp.componentPin.toUpperCase();
                if (pin === 'OUT' || pin === 'SIG') {
                    const pi = getPortAndBit(cp.arduinoPin, ports);
                    if (pi) {
                        adjustable.push({
                            partId: part.id, partType: part.type,
                            get: () => pi.port.pinState(pi.bit) === 1 ? 1 : 0,
                            set: (_k, v) => pi.port.setPin(pi.bit, v > 0),
                        });
                    }
                    break;
                }
            }
        }
    }

    // ── Custom chip WASM runtime (MVP) ──
    attachCustomChipControllers(
        diagram,
        runner,
        i2cBus,
        controllers,
        adjustable,
        cleanups,
        customChipArtifacts,
        customChipManifests,
        onChipLog,
    );

    return {
        controllers,
        adjustable,
        cleanup: () => {
            for (const fn of cleanups) {
                fn();
            }
            cleanups.length = 0;
        },
    };
}

// ── Setup functions (keep cognitive complexity low) ──

function setupLCD1602(
    el: HTMLElement, cpuMillis: () => number, i2cBus: I2CBus, controllers: HardwareController[],
): void {
    const lcd = new LCD1602Controller(cpuMillis);
    i2cBus.registerDevice(0x27, lcd);
    controllers.push({ element: el, update: () => lcd.update(), type: 'lcd' });
}

function setupLCD2004(
    el: HTMLElement, cpuMillis: () => number, i2cBus: I2CBus, controllers: HardwareController[],
): void {
    const lcd = new LCD2004Controller(cpuMillis);
    i2cBus.registerDevice(0x27, lcd);
    controllers.push({ element: el, update: () => lcd.update(), type: 'lcd' });
}

function setupSSD1306(
    el: HTMLElement, cpuMillis: () => number, i2cBus: I2CBus, controllers: HardwareController[],
): void {
    const oled = new SSD1306Controller(cpuMillis);
    i2cBus.registerDevice(0x3C, oled);
    type OledEl = HTMLElement & { imageData: ImageData; redraw: () => void };
    controllers.push({
        element: el,
        update: () => {
            if (!oled.update()) { return null; }
            const oledEl = el as OledEl;
            oled.toImageData(oledEl.imageData);
            oledEl.redraw();
            return true;
        },
        type: 'oled',
    });
}

function setupILI9341(
    part: { id: string },
    el: HTMLElement,
    compPins: ResolvedPin[],
    runner: AVRRunner,
    ports: PortSet,
    controllers: HardwareController[],
): void {
    // Resolve D/C pin (Data/Command select)
    const dcArduino = findArduinoPin(compPins, 'D/C');
    if (!dcArduino) {
        console.warn('[ILI9341] D/C pin not connected — display disabled');
        return;
    }
    const dcPi = getPortAndBit(dcArduino, ports);
    if (!dcPi) {
        console.warn('[ILI9341] D/C pin could not be resolved — display disabled');
        return;
    }

    const ctrl = new ILI9341Controller(dcPi);

    // Attach the canvas — the element exposes it via a `canvas` getter,
    // and fires a `canvas-ready` CustomEvent from firstUpdated().
    type TFTEl = HTMLElement & { canvas: HTMLCanvasElement | null };
    const attachCanvas = () => {
        const canvas = (el as TFTEl).canvas;
        if (canvas) ctrl.attachCanvas(canvas);
    };
    attachCanvas();                                          // canvas is usually ready by now
    el.addEventListener('canvas-ready', attachCanvas, { once: true });

    // Hook the SPI bus: receive every MOSI byte, return MISO = 0xFF
    runner.spi.onByte = (value: number) => {
        ctrl.receiveByte(value);
        runner.spi.completeTransfer(0xFF);
    };

    // Push a controller that flushes dirty rows every simulation tick
    controllers.push({
        element: el,
        update: () => {
            ctrl.flush();
            return true;
        },
        type: 'ili9341',
    });
}

function setupNeopixel(
    part: { id: string; type: string; attrs?: Record<string, string> },
    el: HTMLElement,
    compPins: ResolvedPin[],
    runner: AVRRunner,
    ports: PortSet,
    controllers: HardwareController[],
): void {
    const numPixels = getNeoPixelCount(part);
    if (numPixels === 0) return;

    const ws = new WS2812Controller(numPixels);
    const dinArduino = findArduinoPin(compPins, 'DIN');

    if (dinArduino) {
        // Resolve to AVR port/bit
        const pi = getPortAndBit(dinArduino, ports);
        if (pi) {
            pi.port.addListener(() => {
                const state = pi.port.pinState(pi.bit);
                ws.feedValue(state, runner.cpu.cycles * (1e9 / runner.frequency));
            });
        }
    }

    let controllerType: HardwareController['type'] = 'neopixel-matrix';
    if (part.type === 'wokwi-neopixel') {
        controllerType = 'neopixel-single';
    } else if (part.type === 'wokwi-led-ring') {
        controllerType = 'neopixel-ring';
    }

    controllers.push({
        element: el,
        update: () => ws.update(runner.cpu.cycles * (1e9 / runner.frequency)),
        type: controllerType,
    });
}

function setupSpeaker(
    part: { id: string },
    _el: HTMLElement,
    compPins: ResolvedPin[],
    runner: AVRRunner,
    ports: PortSet,
): void {
    // Buzzer has pin "1" (signal) and "2" (GND)
    const sigArduino = findArduinoPin(compPins, '1') ?? findArduinoPin(compPins, 'SIG');
    if (!sigArduino) return;

    const pi = getPortAndBit(sigArduino, ports);
    if (!pi) return;

    // Reuse the speaker already created in AVRRunner
    pi.port.addListener(() => {
        const high = pi.port.pinState(pi.bit) === 1;
        runner.speaker.feed(high ? 1 : 0);
    });
}

function setupDHT22(
    part: { id: string },
    compPins: ResolvedPin[],
    runner: AVRRunner,
    ports: PortSet,
): DHT22Controller | null {
    const sdaArduino = findArduinoPin(compPins, 'SDA');
    if (!sdaArduino) return null;

    const pi = getPortAndBit(sdaArduino, ports);
    if (!pi) return null;

    // DHT22Controller self-registers a port listener
    return new DHT22Controller(runner.cpu, pi.port, pi.bit, runner.frequency);
}

function setupHCSR04(
    part: { id: string },
    compPins: ResolvedPin[],
    runner: AVRRunner,
    ports: PortSet,
): HCSR04Controller | null {
    const trigArduino = findArduinoPin(compPins, 'TRIG');
    const echoArduino = findArduinoPin(compPins, 'ECHO');
    if (!trigArduino || !echoArduino) return null;

    const trigPi = getPortAndBit(trigArduino, ports);
    const echoPi = getPortAndBit(echoArduino, ports);
    if (!trigPi || !echoPi) return null;

    // HC-SR04 Controller self-registers a port listener
    return new HCSR04Controller(
        runner.cpu, trigPi.port, trigPi.bit, echoPi.port, echoPi.bit, runner.frequency,
    );
}

function setupIRReceiver(
    part: { id: string },
    compPins: ResolvedPin[],
    runner: AVRRunner,
    ports: PortSet,
): IRController | null {
    const datArduino = findArduinoPin(compPins, 'DAT');
    if (!datArduino) return null;

    const pi = getPortAndBit(datArduino, ports);
    if (!pi) return null;

    return new IRController(runner.cpu, pi.port, pi.bit, runner.frequency);
}

function setupIRRemote(
    el: HTMLElement,
    irControllers: IRController[],
    cleanups: Array<() => void>,
): void {
    if (irControllers.length === 0) return;

    const onPress = (e: Event) => {
        const detail = (e as CustomEvent).detail;
        if (detail?.irCode !== undefined) {
            for (const ctrl of irControllers) {
                ctrl.sendNEC(detail.irCode);
            }
        }
    };

    el.addEventListener('button-press', onPress);
    cleanups.push(() => el.removeEventListener('button-press', onPress));
}

/**
 * Pumps visual state from hardware controllers to DOM elements during each simulation tick.
 */
export function updateControllerStates(controllers: HardwareController[]): void {
    for (const ctrl of controllers) {
        const state = ctrl.update();
        if (!state) continue;

        switch (ctrl.type) {
            case 'lcd':
                updateLCD(ctrl.element, state as LcdState);
                break;
            case 'neopixel-single':
                updateNeopixelSingle(ctrl.element, state as Uint32Array);
                break;
            case 'neopixel-ring':
                updateNeopixelRing(ctrl.element, state as Uint32Array);
                break;
            case 'neopixel-matrix':
                updateNeopixelMatrix(ctrl.element, state as Uint32Array);
                break;
            case 'oled':
                // rendering handled inside the update() closure via element.redraw()
                break;
            case 'ili9341':
                // flush() is called inside the update() closure — nothing more to do here
                break;
            default:
                break;
        }
    }
}

// ── Visual state updaters ──

function updateLCD(el: HTMLElement, s: LcdState): void {
    const lcd = el as HTMLElement & LcdState;
    lcd.characters = s.characters;
    lcd.blink = s.blink;
    lcd.cursor = s.cursor;
    lcd.cursorX = s.cursorX;
    lcd.cursorY = s.cursorY;
}

function updateNeopixelSingle(el: HTMLElement, pixels: Uint32Array): void {
    const { r, g, b } = grb2rgb(pixels[0]);
    const neo = el as HTMLElement & { r: number; g: number; b: number };
    neo.r = r;
    neo.g = g;
    neo.b = b;
}

function updateNeopixelRing(el: HTMLElement, pixels: Uint32Array): void {
    const ring = el as HTMLElement & { setPixel: (i: number, c: { r: number; g: number; b: number }) => void };
    if (typeof ring.setPixel !== 'function') return;
    for (let i = 0; i < pixels.length; i++) {
        ring.setPixel(i, grb2rgb(pixels[i]));
    }
}

function updateNeopixelMatrix(el: HTMLElement, pixels: Uint32Array): void {
    const matrix = el as HTMLElement & {
        cols: number;
        setPixel: (row: number, col: number, c: { r: number; g: number; b: number }) => void;
    };
    if (typeof matrix.setPixel !== 'function') return;
    const cols = matrix.cols || 8;
    for (let i = 0; i < pixels.length; i++) {
        const row = Math.floor(i / cols);
        const col = i % cols;
        matrix.setPixel(row, col, grb2rgb(pixels[i]));
    }
}
