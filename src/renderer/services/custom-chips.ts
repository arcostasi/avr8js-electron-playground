import type { AVRRunner } from '../../shared/execute';
import type { HardwareController, WokwiDiagram } from '../types/wokwi.types';
import { getPortAndBit } from '../utils/pin-mapping';
import type { AVRIOPort } from 'avr8js';
import type { I2CBus, I2CDevice } from '../../shared/i2c-bus';

export interface CustomChipSource {
    name: string;
    sourceFile: string;
    sourceContent: string;
    manifestFile: string;
    manifestContent: string;
    wasmFile: string;
}

export type CustomChipArtifacts = Record<string, string>;

export interface CustomChipControl {
    key: string;
    label: string;
    min: number;
    max: number;
    step: number;
    unit: string;
    defaultValue: number;
}

export interface CustomChipManifest {
    chipName: string;
    title: string;
    pins: string[];
    controls: CustomChipControl[];
    framebuffer?: {
        width: number;
        height: number;
    };
}

export type CustomChipManifests = Record<string, CustomChipManifest>;

type SpiMuxSession = {
    id: string;
    handleByte: (value: number) => boolean;
};

type UsartMuxSession = {
    id: string;
    onByte: (value: number) => void;
};

const SPI_MUX_KEY = '__avr8jsCustomChipSpiMux';
const USART_MUX_KEY = '__avr8jsCustomChipUsartMux';

function registerSpiMuxSession(runner: AVRRunner, session: SpiMuxSession): () => void {
    const spiHost = runner.spi as typeof runner.spi & {
        [SPI_MUX_KEY]?: {
            previous: ((value: number) => void) | null;
            sessions: SpiMuxSession[];
        };
    };

    if (!spiHost[SPI_MUX_KEY]) {
        const previous = typeof runner.spi.onByte === 'function' ? runner.spi.onByte : null;
        spiHost[SPI_MUX_KEY] = { previous, sessions: [] };
        runner.spi.onByte = (value: number) => {
            const mux = spiHost[SPI_MUX_KEY];
            if (!mux) {
                runner.spi.completeTransfer(0xFF);
                return;
            }
            for (const candidate of mux.sessions) {
                if (candidate.handleByte(value)) return;
            }
            if (mux.previous) {
                mux.previous(value);
            } else {
                runner.spi.completeTransfer(0xFF);
            }
        };
    }

    spiHost[SPI_MUX_KEY]!.sessions.push(session);
    return () => {
        const mux = spiHost[SPI_MUX_KEY];
        if (!mux) return;
        mux.sessions = mux.sessions.filter((s) => s.id !== session.id);
        if (mux.sessions.length === 0) {
            runner.spi.onByte = mux.previous;
            delete spiHost[SPI_MUX_KEY];
        }
    };
}

function registerUsartMuxSession(runner: AVRRunner, session: UsartMuxSession): () => void {
    const usartHost = runner.usart as typeof runner.usart & {
        [USART_MUX_KEY]?: {
            previous: ((value: number) => void) | null;
            sessions: UsartMuxSession[];
        };
    };

    if (!usartHost[USART_MUX_KEY]) {
        const previous = typeof runner.usart.onByteTransmit === 'function'
            ? runner.usart.onByteTransmit
            : null;
        usartHost[USART_MUX_KEY] = { previous, sessions: [] };
        runner.usart.onByteTransmit = (value: number) => {
            const mux = usartHost[USART_MUX_KEY];
            if (!mux) return;
            for (const candidate of mux.sessions) {
                candidate.onByte(value & 0xFF);
            }
            if (mux.previous) mux.previous(value);
        };
    }

    usartHost[USART_MUX_KEY]!.sessions.push(session);
    return () => {
        const mux = usartHost[USART_MUX_KEY];
        if (!mux) return;
        mux.sessions = mux.sessions.filter((s) => s.id !== session.id);
        if (mux.sessions.length === 0) {
            runner.usart.onByteTransmit = mux.previous;
            delete usartHost[USART_MUX_KEY];
        }
    };
}

interface ChipPinBridge {
    chipPinName: string;
    arduinoPin: string;
    port: AVRIOPort;
    bit: number;
}

interface CustomChipBridgeContext {
    chipName: string;
    partId: string;
    pinBridge: ChipPinBridge[];
}

interface CustomChipI2CBridge {
    i2cConnect: (addr: number, write: boolean) => boolean;
    i2cReadByte: (acked: boolean) => number;
    i2cWriteByte: (value: number) => boolean;
    i2cDisconnect: () => void;
}

interface CustomChipControlBridge {
    getControl: (index: number) => number;
    setControl: (index: number, value: number) => void;
}

interface CustomChipBuildResultItem {
    name: string;
    wasmFile: string;
    wasmBase64?: string;
    success: boolean;
}

export function discoverCustomChipSources(files: Array<{ name: string; content: string }>): CustomChipSource[] {
    const manifests = files.filter(f => f.name.endsWith('.chip.json'));
    const chips: CustomChipSource[] = [];

    for (const manifest of manifests) {
        const chipName = manifest.name.slice(0, -'.chip.json'.length);
        const source = files.find(f =>
            f.name === `${chipName}.chip.c`
            || f.name === `${chipName}.chip.cpp`
            || f.name === `${chipName}.chip.cc`,
        );
        if (!source) continue;

        chips.push({
            name: chipName,
            sourceFile: source.name,
            sourceContent: source.content,
            manifestFile: manifest.name,
            manifestContent: manifest.content,
            wasmFile: `${chipName}.chip.wasm`,
        });
    }

    return chips;
}

export function mergeChipArtifacts(
    current: CustomChipArtifacts,
    items: CustomChipBuildResultItem[],
): CustomChipArtifacts {
    const next = { ...current };
    for (const item of items) {
        if (!item.success || !item.wasmBase64) continue;
        next[item.name] = item.wasmBase64;
        next[item.wasmFile] = item.wasmBase64;
    }
    return next;
}

export function discoverCustomChipManifests(files: Array<{ name: string; content: string }>): CustomChipManifests {
    const manifests: CustomChipManifests = {};

    for (const file of files) {
        if (!file.name.endsWith('.chip.json')) continue;
        const chipName = file.name.slice(0, -'.chip.json'.length);

        try {
            const parsed = JSON.parse(file.content) as {
                name?: string;
                pins?: Array<string | { name?: string }>;
                display?: {
                    width?: number;
                    height?: number;
                };
                controls?: Array<{
                    id?: string;
                    label?: string;
                    type?: string;
                    min?: number;
                    max?: number;
                    step?: number;
                    unit?: string;
                    defaultValue?: number;
                }>;
            };

            const pins: string[] = (parsed.pins ?? [])
                .map((pin) => {
                    if (typeof pin === 'string') return pin.trim();
                    if (pin && typeof pin === 'object' && typeof pin.name === 'string') return pin.name.trim();
                    return '';
                })
                .filter((pin) => pin.length > 0);

            const controls: CustomChipControl[] = (parsed.controls ?? [])
                .filter((c) => c && c.type === 'range' && typeof c.id === 'string' && c.id.length > 0)
                .map((c) => {
                    const min = typeof c.min === 'number' ? c.min : 0;
                    const max = typeof c.max === 'number' ? c.max : 100;
                    const step = typeof c.step === 'number' && c.step > 0 ? c.step : 1;
                    const defaultValue = typeof c.defaultValue === 'number' ? c.defaultValue : min;
                    return {
                        key: c.id!,
                        label: c.label?.trim() || c.id!,
                        min,
                        max,
                        step,
                        unit: c.unit ?? '',
                        defaultValue,
                    };
                });

            manifests[chipName] = {
                chipName,
                title: parsed.name?.trim() || chipName,
                pins,
                controls,
                framebuffer: parsed.display
                    && typeof parsed.display.width === 'number'
                    && typeof parsed.display.height === 'number'
                    && parsed.display.width > 0
                    && parsed.display.height > 0
                    ? {
                        width: parsed.display.width,
                        height: parsed.display.height,
                    }
                    : undefined,
            };
        } catch {
            // ignore invalid JSON while typing in editor
        }
    }

    return manifests;
}

function decodeBase64(base64: string): Uint8Array {
    const str = atob(base64);
    const out = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
        out[i] = str.codePointAt(i) ?? 0;
    }
    return out;
}

function createImportObject(
    module: WebAssembly.Module,
    runner: AVRRunner,
    bridge: CustomChipBridgeContext,
    manifest: CustomChipManifest | undefined,
    attrs: Record<string, string> | undefined,
    i2cBus: I2CBus,
    onChipLog?: (text: string) => void,
): {
    imports: WebAssembly.Imports;
    bindInstance: (instance: WebAssembly.Instance) => void;
    poll: () => void;
    pullFramebuffer: () => { width: number; height: number; pixels: Uint8Array } | null;
    dispose: () => void;
} {
    const importObject: WebAssembly.Imports = {};
    let importedMemory: WebAssembly.Memory | null = null;
    let instanceRef: WebAssembly.Instance | null = null;

    const LOW = 0;
    const HIGH = 1;
    const INPUT = 0;
    const OUTPUT_LOW = 4;
    const OUTPUT_HIGH = 5;
    const RISING = 1;
    const FALLING = 2;
    const BOTH = 3;

    const basePinCount = Math.max(bridge.pinBridge.length, manifest?.pins.length ?? 0);
    const pinModes = Array.from({ length: basePinCount }, () => INPUT);
    const pinAnalogVolts = Array.from({ length: basePinCount }, () => 0);
    const virtualPinValues = new Map<number, number>();
    const dynamicPinByName = new Map<string, number>();
    const pinWatchers = new Map<number, { edge: number; callback: number; userData: number; lastValue: number }>();

    let nextTimerId = 1;
    const timers = new Map<number, {
        callback: number;
        userData: number;
        active: boolean;
        repeat: boolean;
        periodNs: bigint;
        nextNs: bigint;
    }>();

    let nextAttrHandle = 1;
    const intAttrs = new Map<number, number>();
    const floatAttrs = new Map<number, number>();

    let nextI2CDevId = 1;

    let nextUartId = 1;
    const uartState = new Map<number, {
        writeDone: number;
        rxData: number;
        userData: number;
        busy: boolean;
        rxPin: number;
        txPin: number;
        linkedToUsart: boolean;
    }>();

    let nextSpiId = 1;
    const spiState = new Map<number, { done: number; userData: number }>();
    let spiActive: { devId: number; bufferPtr: number; count: number; transferred: number } | null = null;
    const chipRuntimeId = `${bridge.partId}:${bridge.chipName}:${Math.random().toString(36).slice(2)}`;
    let unregisterSpiMux: (() => void) | null = null;
    const uartUnsubscribers: Array<() => void> = [];

    const framebufferHandle = 1;
    const framebufferSize = {
        width: manifest?.framebuffer?.width ?? 128,
        height: manifest?.framebuffer?.height ?? 64,
    };
    const framebufferBytes = new Uint8Array(Math.max(1, framebufferSize.width * framebufferSize.height * 4));
    let framebufferDirty = false;

    const millis = () => Math.floor((runner.cpu.cycles / runner.frequency) * 1000);
    const micros = () => Math.floor((runner.cpu.cycles / runner.frequency) * 1_000_000);
    const simNanos = () => BigInt(Math.floor((runner.cpu.cycles / runner.frequency) * 1_000_000_000));

    const getMemory = () => {
        if (importedMemory) return importedMemory;
        if (!instanceRef) return null;
        const mem = (instanceRef.exports as Record<string, unknown>).memory;
        return mem instanceof WebAssembly.Memory ? mem : null;
    };

    const getTable = () => {
        if (!instanceRef) return null;
        const table = (instanceRef.exports as Record<string, unknown>).__indirect_function_table;
        return table instanceof WebAssembly.Table ? table : null;
    };

    const readU8 = (ptr: number): number => {
        const mem = getMemory();
        if (!mem || ptr < 0) return 0;
        return new Uint8Array(mem.buffer)[ptr] ?? 0;
    };
    const writeU8 = (ptr: number, value: number): void => {
        const mem = getMemory();
        if (!mem || ptr < 0) return;
        new Uint8Array(mem.buffer)[ptr] = value & 0xFF;
    };
    const readU32 = (ptr: number): number => {
        const mem = getMemory();
        if (!mem || ptr < 0) return 0;
        return new DataView(mem.buffer).getUint32(ptr, true);
    };
    const writeU32 = (ptr: number, value: number): void => {
        const mem = getMemory();
        if (!mem || ptr < 0) return;
        new DataView(mem.buffer).setUint32(ptr, value >>> 0, true);
    };
    const readCString = (ptr: number): string => {
        const mem = getMemory();
        if (!mem || ptr <= 0) return '';
        const bytes = new Uint8Array(mem.buffer);
        let end = ptr;
        while (end < bytes.length && bytes[end] !== 0) end++;
        return new TextDecoder().decode(bytes.slice(ptr, end));
    };

    const callIndirect = (funcIndex: number, args: unknown[] = []): unknown => {
        if (!funcIndex) return 0;
        const table = getTable();
        if (!table) return 0;
        const fn = table.get(funcIndex);
        if (typeof fn !== 'function') return 0;
        try {
            return (fn as (...a: unknown[]) => unknown)(...args);
        } catch (e: unknown) {
            onChipLog?.(`[chip:${bridge.chipName}] indirect callback #${funcIndex} failed: ${e instanceof Error ? e.message : 'unknown error'}\n`);
            return 0;
        }
    };

    const resolvePinIndexByName = (name: string): number => {
        const normalized = name.trim().toLowerCase();
        if (!normalized) return -1;
        const staticIdx = bridge.pinBridge.findIndex((m) => m.chipPinName.trim().toLowerCase() === normalized);
        if (staticIdx >= 0) return staticIdx;

        const manifestIdx = (manifest?.pins ?? []).findIndex((p) => p.trim().toLowerCase() === normalized);
        if (manifestIdx >= 0 && manifestIdx < bridge.pinBridge.length) return manifestIdx;

        const existing = dynamicPinByName.get(normalized);
        if (existing !== undefined) return existing;

        const newIdx = basePinCount + dynamicPinByName.size;
        dynamicPinByName.set(normalized, newIdx);
        virtualPinValues.set(newIdx, LOW);
        return newIdx;
    };

    const gpioRead = (pin: number) => {
        const map = bridge.pinBridge[pin];
        if (!map) return (virtualPinValues.get(pin) ?? LOW) ? HIGH : LOW;
        return map.port.pinState(map.bit) === 1 ? HIGH : LOW;
    };
    const gpioWrite = (pin: number, value: number) => {
        const map = bridge.pinBridge[pin];
        if (!map) {
            virtualPinValues.set(pin, value !== 0 ? HIGH : LOW);
            return;
        }
        map.port.setPin(map.bit, value !== 0);
    };

    const applyPinMode = (pin: number, mode: number) => {
        if (pin >= 0 && pin < pinModes.length) pinModes[pin] = mode;
        if (mode === OUTPUT_LOW) gpioWrite(pin, LOW);
        if (mode === OUTPUT_HIGH) gpioWrite(pin, HIGH);
    };

    const parseAttrNumber = (raw: string | undefined, fallback: number) => {
        if (raw === undefined) return fallback;
        const normalized = raw.trim().toLowerCase();
        const parsed = normalized.startsWith('0x')
            ? Number.parseInt(normalized.slice(2), 16)
            : Number.parseFloat(normalized);
        return Number.isFinite(parsed) ? parsed : fallback;
    };

    const processPinWatchers = () => {
        for (const [pin, watch] of pinWatchers) {
            const current = gpioRead(pin);
            if (current === watch.lastValue) continue;
            const rising = watch.lastValue === LOW && current === HIGH;
            const falling = watch.lastValue === HIGH && current === LOW;
            watch.lastValue = current;
            if (
                watch.edge === BOTH
                || (watch.edge === RISING && rising)
                || (watch.edge === FALLING && falling)
            ) {
                void callIndirect(watch.callback, [watch.userData, pin, current]);
            }
        }
    };

    const processTimers = () => {
        const now = simNanos();
        for (const [, timer] of timers) {
            if (!timer.active) continue;
            let guard = 0;
            while (timer.active && now >= timer.nextNs && guard < 32) {
                guard++;
                void callIndirect(timer.callback, [timer.userData]);
                if (timer.repeat) {
                    timer.nextNs += timer.periodNs;
                } else {
                    timer.active = false;
                }
            }
        }
    };

    const installSpiHook = () => {
        if (unregisterSpiMux) return;
        unregisterSpiMux = registerSpiMuxSession(runner, {
            id: chipRuntimeId,
            handleByte: (value: number) => {
                if (!spiActive) return false;

                const txPtr = spiActive.bufferPtr + spiActive.transferred;
                const txByte = readU8(txPtr);
                writeU8(txPtr, value & 0xFF);
                runner.spi.completeTransfer(txByte);
                spiActive.transferred++;

                if (spiActive.transferred >= spiActive.count) {
                    const done = spiState.get(spiActive.devId)?.done ?? 0;
                    const user = spiState.get(spiActive.devId)?.userData ?? 0;
                    const bufferPtr = spiActive.bufferPtr;
                    const transferred = spiActive.transferred;
                    spiActive = null;
                    callIndirect(done, [user, bufferPtr, transferred]);
                }
                return true;
            },
        });
    };

    for (const imp of WebAssembly.Module.imports(module)) {
        if (!importObject[imp.module]) importObject[imp.module] = {};
        const mod = importObject[imp.module] as WebAssembly.ModuleImports;

        if (imp.kind === 'function') {
            if (imp.name === 'millis' || imp.name === 'avr8js_millis') {
                mod[imp.name] = millis;
            } else if (imp.name === 'micros' || imp.name === 'avr8js_micros') {
                mod[imp.name] = micros;
            } else if (imp.name === 'get_sim_nanos') {
                mod[imp.name] = simNanos;
            } else if (imp.name === 'avr8js_gpio_read') {
                mod[imp.name] = gpioRead;
            } else if (imp.name === 'avr8js_gpio_write') {
                mod[imp.name] = gpioWrite;
            } else if (imp.name === 'avr8js_gpio_mode') {
                mod[imp.name] = (pin: number, mode: number) => { applyPinMode(pin, mode); return 0; };
            } else if (imp.name === 'pin_init') {
                mod[imp.name] = (namePtr: number, mode: number) => {
                    const name = readCString(namePtr);
                    const pin = resolvePinIndexByName(name);
                    applyPinMode(pin, mode);
                    return pin;
                };
            } else if (imp.name === 'pin_mode') {
                mod[imp.name] = (pin: number, mode: number) => { applyPinMode(pin, mode); };
            } else if (imp.name === 'pin_write') {
                mod[imp.name] = (pin: number, value: number) => { gpioWrite(pin, value); };
            } else if (imp.name === 'pin_read') {
                mod[imp.name] = (pin: number) => gpioRead(pin);
            } else if (imp.name === 'pin_watch') {
                mod[imp.name] = (pin: number, configPtr: number) => {
                    if (pinWatchers.has(pin)) return 0;
                    const edge = readU32(configPtr);
                    const callback = readU32(configPtr + 4);
                    const userData = readU32(configPtr + 8);
                    pinWatchers.set(pin, {
                        edge,
                        callback,
                        userData,
                        lastValue: gpioRead(pin),
                    });
                    return 1;
                };
            } else if (imp.name === 'pin_watch_stop') {
                mod[imp.name] = (pin: number) => { pinWatchers.delete(pin); };
            } else if (imp.name === 'pin_adc_read') {
                mod[imp.name] = (pin: number) => {
                    if (pin >= 0 && pin < pinAnalogVolts.length) {
                        const v = pinAnalogVolts[pin];
                        if (Number.isFinite(v) && v !== 0) return v;
                    }
                    return gpioRead(pin) === HIGH ? 5 : 0;
                };
            } else if (imp.name === 'pin_dac_write') {
                mod[imp.name] = (pin: number, voltage: number) => {
                    const clamped = Math.max(0, Math.min(5, Number(voltage) || 0));
                    if (pin >= 0 && pin < pinAnalogVolts.length) {
                        pinAnalogVolts[pin] = clamped;
                    }
                    gpioWrite(pin, clamped >= 2.5 ? HIGH : LOW);
                };
            } else if (imp.name === 'timer_init') {
                mod[imp.name] = (configPtr: number) => {
                    const id = nextTimerId++;
                    timers.set(id, {
                        callback: readU32(configPtr),
                        userData: readU32(configPtr + 4),
                        active: false,
                        repeat: false,
                        periodNs: 0n,
                        nextNs: 0n,
                    });
                    return id;
                };
            } else if (imp.name === 'timer_start') {
                mod[imp.name] = (timerId: number, microsDelay: number, repeat: number) => {
                    const timer = timers.get(timerId);
                    if (!timer) return;
                    timer.repeat = repeat !== 0;
                    timer.periodNs = BigInt(Math.max(0, microsDelay | 0)) * 1000n;
                    timer.nextNs = simNanos() + timer.periodNs;
                    timer.active = true;
                };
            } else if (imp.name === 'timer_start_ns') {
                mod[imp.name] = (timerId: number, nanosDelay: bigint, repeat: number) => {
                    const timer = timers.get(timerId);
                    if (!timer) return;
                    timer.repeat = repeat !== 0;
                    timer.periodNs = nanosDelay > 0n ? nanosDelay : 0n;
                    timer.nextNs = simNanos() + timer.periodNs;
                    timer.active = true;
                };
            } else if (imp.name === 'timer_stop') {
                mod[imp.name] = (timerId: number) => {
                    const timer = timers.get(timerId);
                    if (!timer) return;
                    timer.active = false;
                };
            } else if (imp.name === 'attr_init') {
                mod[imp.name] = (namePtr: number, defaultValue: number) => {
                    const handle = nextAttrHandle++;
                    const name = readCString(namePtr);
                    const value = parseAttrNumber(attrs?.[name], defaultValue);
                    intAttrs.set(handle, Math.trunc(value));
                    return handle;
                };
            } else if (imp.name === 'attr_init_float') {
                mod[imp.name] = (namePtr: number, defaultValue: number) => {
                    const handle = nextAttrHandle++;
                    const name = readCString(namePtr);
                    const value = parseAttrNumber(attrs?.[name], defaultValue);
                    floatAttrs.set(handle, value);
                    return handle;
                };
            } else if (imp.name === 'attr_read') {
                mod[imp.name] = (handle: number) => Math.trunc(intAttrs.get(handle) ?? 0);
            } else if (imp.name === 'attr_read_float') {
                mod[imp.name] = (handle: number) => floatAttrs.get(handle) ?? 0;
            } else if (imp.name === 'i2c_init') {
                mod[imp.name] = (configPtr: number) => {
                    const address = readU32(configPtr) & 0x7F;
                    const connect = readU32(configPtr + 12);
                    const read = readU32(configPtr + 16);
                    const write = readU32(configPtr + 20);
                    const disconnect = readU32(configPtr + 24);
                    const userData = readU32(configPtr + 28);
                    if (address !== 0 && i2cBus.devices[address]) {
                        onChipLog?.(`[chip:${bridge.chipName}] i2c_init address 0x${address.toString(16)} already in use.\n`);
                        return 0;
                    }
                    const devId = nextI2CDevId++;
                    const dev: I2CDevice = {
                        i2cConnect: (addr, rw) => connect ? Number(callIndirect(connect, [userData, addr, rw])) !== 0 : true,
                        i2cReadByte: (acked) => read ? (Number(callIndirect(read, [userData, acked])) & 0xFF) : 0xFF,
                        i2cWriteByte: (value) => write ? Number(callIndirect(write, [userData, value & 0xFF])) !== 0 : true,
                        i2cDisconnect: () => { if (disconnect) callIndirect(disconnect, [userData]); },
                    };
                    if (address === 0) {
                        i2cBus.registerWildcardDevice(dev);
                    } else {
                        i2cBus.registerDevice(address, dev);
                    }
                    return devId;
                };
            } else if (imp.name === 'uart_init') {
                mod[imp.name] = (configPtr: number) => {
                    const id = nextUartId++;
                    const rxPin = readU32(configPtr);
                    const txPin = readU32(configPtr + 4);
                    const rxData = readU32(configPtr + 12);
                    uartState.set(id, {
                        writeDone: readU32(configPtr + 16),
                        rxData,
                        userData: readU32(configPtr + 20),
                        busy: false,
                        rxPin,
                        txPin,
                        linkedToUsart: false,
                    });

                    const uart = uartState.get(id)!;
                    const rxMap = bridge.pinBridge[rxPin];
                    const connectedToMcuTx = rxMap?.arduinoPin === '1';
                    if (rxData && connectedToMcuTx) {
                        const unsubscribe = registerUsartMuxSession(runner, {
                            id: `${chipRuntimeId}:uart:${id}`,
                            onByte: (value: number) => {
                                callIndirect(uart.rxData, [uart.userData, value & 0xFF]);
                            },
                        });
                        uart.linkedToUsart = true;
                        uartUnsubscribers.push(unsubscribe);
                    }
                    return id;
                };
            } else if (imp.name === 'uart_write') {
                mod[imp.name] = (uartId: number, bufferPtr: number, count: number) => {
                    const uart = uartState.get(uartId);
                    if (!uart || uart.busy) return 0;
                    uart.busy = true;
                    const bytes: number[] = [];
                    for (let i = 0; i < count; i++) bytes.push(readU8(bufferPtr + i));

                    const txMap = bridge.pinBridge[uart.txPin];
                    const connectedToMcuRx = txMap?.arduinoPin === '0';
                    if (connectedToMcuRx && bytes.length > 0) {
                        const text = String.fromCharCode(...bytes.map((b) => b & 0xFF));
                        runner.serialWrite(text);
                    }

                    onChipLog?.(`[chip:${bridge.chipName}] uart_write(${count} byte(s)): ${bytes.map((b) => b.toString(16).padStart(2, '0')).join(' ')}\n`);
                    queueMicrotask(() => {
                        uart.busy = false;
                        if (uart.writeDone) callIndirect(uart.writeDone, [uart.userData]);
                    });
                    return 1;
                };
            } else if (imp.name === 'spi_init') {
                mod[imp.name] = (configPtr: number) => {
                    const devId = nextSpiId++;
                    spiState.set(devId, {
                        done: readU32(configPtr + 16),
                        userData: readU32(configPtr + 20),
                    });
                    installSpiHook();
                    return devId;
                };
            } else if (imp.name === 'spi_start') {
                mod[imp.name] = (devId: number, bufferPtr: number, count: number) => {
                    if (!spiState.has(devId)) return;
                    spiActive = {
                        devId,
                        bufferPtr,
                        count: Math.max(0, count | 0),
                        transferred: 0,
                    };
                };
            } else if (imp.name === 'spi_stop') {
                mod[imp.name] = (devId: number) => {
                    if (!spiActive || spiActive.devId !== devId) return;
                    const done = spiState.get(devId)?.done ?? 0;
                    const user = spiState.get(devId)?.userData ?? 0;
                    const bufferPtr = spiActive.bufferPtr;
                    const transferred = spiActive.transferred;
                    spiActive = null;
                    if (done) void callIndirect(done, [user, bufferPtr, transferred]);
                };
            } else if (imp.name === 'framebuffer_init') {
                mod[imp.name] = (pixelWidthPtr: number, pixelHeightPtr: number) => {
                    writeU32(pixelWidthPtr, framebufferSize.width);
                    writeU32(pixelHeightPtr, framebufferSize.height);
                    return framebufferHandle;
                };
            } else if (imp.name === 'buffer_write') {
                mod[imp.name] = (bufferHandle: number, offset: number, dataPtr: number, dataLen: number) => {
                    if (bufferHandle !== framebufferHandle) return;
                    const mem = getMemory();
                    if (!mem) return;
                    const src = new Uint8Array(mem.buffer, dataPtr, dataLen);
                    const start = Math.max(0, offset | 0);
                    const end = Math.min(framebufferBytes.length, start + src.length);
                    framebufferBytes.set(src.subarray(0, Math.max(0, end - start)), start);
                    framebufferDirty = true;
                };
            } else if (imp.name === 'buffer_read') {
                mod[imp.name] = (bufferHandle: number, offset: number, dataPtr: number, dataLen: number) => {
                    if (bufferHandle !== framebufferHandle) return;
                    const mem = getMemory();
                    if (!mem) return;
                    const dst = new Uint8Array(mem.buffer, dataPtr, dataLen);
                    const start = Math.max(0, offset | 0);
                    const end = Math.min(framebufferBytes.length, start + dataLen);
                    dst.fill(0);
                    dst.set(framebufferBytes.subarray(start, end), 0);
                };
            } else if (imp.name === 'printf') {
                mod[imp.name] = () => {
                    onChipLog?.('[chip] printf() called (MVP runtime stub)\n');
                    return 0;
                };
            } else {
                mod[imp.name] = () => 0;
            }
            continue;
        }

        if (imp.kind === 'memory') {
            importedMemory = new WebAssembly.Memory({ initial: 2 });
            mod[imp.name] = importedMemory;
            continue;
        }

        if (imp.kind === 'table') {
            mod[imp.name] = new WebAssembly.Table({ initial: 0, element: 'anyfunc' });
            continue;
        }

        if (imp.kind === 'global') {
            mod[imp.name] = new WebAssembly.Global({ value: 'i32', mutable: true }, 0);
        }
    }

    return {
        imports: importObject,
        bindInstance: (instance) => {
            instanceRef = instance;
        },
        poll: () => {
            processPinWatchers();
            processTimers();
        },
        pullFramebuffer: () => {
            if (!framebufferDirty) return null;
            framebufferDirty = false;
            return {
                width: framebufferSize.width,
                height: framebufferSize.height,
                pixels: new Uint8Array(framebufferBytes),
            };
        },
        dispose: () => {
            if (unregisterSpiMux) {
                unregisterSpiMux();
                unregisterSpiMux = null;
            }
            for (const unsubscribe of uartUnsubscribers) unsubscribe();
            uartUnsubscribers.length = 0;
        },
    };
}

function instantiateCustomChip(
    wasmBase64: string,
    runner: AVRRunner,
    bridge: CustomChipBridgeContext,
    manifest: CustomChipManifest | undefined,
    attrs: Record<string, string> | undefined,
    i2cBus: I2CBus,
    onFramebuffer?: (frame: { width: number; height: number; pixels: Uint8Array }) => void,
    onChipLog?: (text: string) => void,
): {
    tick: () => void;
    dispose: () => void;
    i2c: CustomChipI2CBridge | null;
    controls: CustomChipControlBridge | null;
} {
    const bytes = decodeBase64(wasmBase64);
    const bufferSource = new Uint8Array(bytes.byteLength);
    bufferSource.set(bytes);
    const module = new WebAssembly.Module(bufferSource);
    const compat = createImportObject(module, runner, bridge, manifest, attrs, i2cBus, onChipLog);
    const imports = compat.imports;
    const instance = new WebAssembly.Instance(module, imports);
    compat.bindInstance(instance);

    const exportsObj = instance.exports as Record<string, unknown>;
    const chipInit = exportsObj.chip_init as (() => void) | undefined;
    const chipTick = exportsObj.chip_tick as ((t?: number) => void) | undefined;
    const chipDispose = exportsObj.chip_dispose as (() => void) | undefined;
    const chipI2CConnect = exportsObj.chip_i2c_connect as ((a?: number, b?: number) => number) | undefined;
    const chipI2CRead = exportsObj.chip_i2c_read as ((acked?: number) => number) | undefined;
    const chipI2CWrite = exportsObj.chip_i2c_write as ((value?: number) => number) | undefined;
    const chipI2CDisconnect = exportsObj.chip_i2c_disconnect as (() => void) | undefined;
    const chipControlSet =
        (exportsObj.chip_control_set as ((index?: number, value?: number) => number | void) | undefined)
        ?? (exportsObj.chip_set_control as ((index?: number, value?: number) => number | void) | undefined);
    const chipControlGet =
        (exportsObj.chip_control_get as ((index?: number) => number) | undefined)
        ?? (exportsObj.chip_get_control as ((index?: number) => number) | undefined);

    if (typeof chipInit === 'function') {
        chipInit();
    }

    const i2c: CustomChipI2CBridge | null = chipI2CConnect || chipI2CRead || chipI2CWrite || chipI2CDisconnect
        ? {
            i2cConnect: (addr, write) => {
                try {
                    if (typeof chipI2CConnect !== 'function') return true;
                    if (chipI2CConnect.length >= 2) {
                        return chipI2CConnect(addr, write ? 1 : 0) !== 0;
                    }
                    return chipI2CConnect(write ? 1 : 0) !== 0;
                } catch {
                    return false;
                }
            },
            i2cReadByte: (acked) => {
                try {
                    if (typeof chipI2CRead !== 'function') return 0xFF;
                    return chipI2CRead(acked ? 1 : 0) & 0xFF;
                } catch {
                    return 0xFF;
                }
            },
            i2cWriteByte: (value) => {
                try {
                    if (typeof chipI2CWrite !== 'function') return true;
                    return chipI2CWrite(value & 0xFF) !== 0;
                } catch {
                    return false;
                }
            },
            i2cDisconnect: () => {
                try {
                    if (typeof chipI2CDisconnect === 'function') chipI2CDisconnect();
                } catch {
                    // safe fallback: ignore disconnect errors
                }
            },
        }
        : null;

    const controlValues = (manifest?.controls ?? []).map((c) => c.defaultValue);
    const controls: CustomChipControlBridge | null = manifest && manifest.controls.length > 0
        ? {
            getControl: (index) => {
                if (index < 0 || index >= controlValues.length) return 0;
                try {
                    if (typeof chipControlGet === 'function') {
                        return chipControlGet(index);
                    }
                } catch {
                    // fall back to local state
                }
                return controlValues[index];
            },
            setControl: (index, value) => {
                if (index < 0 || index >= controlValues.length) return;
                controlValues[index] = value;
                try {
                    if (typeof chipControlSet === 'function') {
                        chipControlSet(index, value);
                    }
                } catch {
                    // safe fallback: keep local state only
                }
            },
        }
        : null;

    return {
        tick: () => {
            compat.poll();
            const frame = compat.pullFramebuffer();
            if (frame && onFramebuffer) {
                onFramebuffer(frame);
            }
            if (typeof chipTick === 'function') {
                const nowMs = (runner.cpu.cycles / runner.frequency) * 1000;
                chipTick(nowMs);
            }
        },
        dispose: () => {
            compat.dispose();
            if (typeof chipDispose === 'function') chipDispose();
        },
        i2c,
        controls,
    };
}

function parseI2CAddress(attrs?: Record<string, string>): number | null {
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

function buildChipPinBridge(
    diagram: WokwiDiagram,
    runner: AVRRunner,
    partId: string,
): ChipPinBridge[] {
    const arduinoPart = diagram.parts.find(p =>
        p.type === 'wokwi-arduino-uno'
        || p.type === 'wokwi-arduino-mega'
        || p.type === 'wokwi-arduino-nano',
    );
    if (!arduinoPart) return [];

    const ports = {
        portB: runner.portB,
        portC: runner.portC,
        portD: runner.portD,
    };
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

        const pb = getPortAndBit(arduinoPin, ports);
        if (!pb) continue;

        seen.add(chipPinName);
        mappings.push({
            chipPinName,
            arduinoPin,
            port: pb.port,
            bit: pb.bit,
        });
    }

    return mappings;
}

export function attachCustomChipControllers(
    diagram: WokwiDiagram,
    runner: AVRRunner,
    i2cBus: I2CBus,
    controllers: HardwareController[],
    adjustableDevices: Array<{
        partId: string;
        partType: string;
        label?: string;
        properties?: CustomChipControl[];
        get: (key: string) => number;
        set: (key: string, value: number) => void;
    }>,
    cleanups: Array<() => void>,
    artifacts: CustomChipArtifacts,
    manifests: CustomChipManifests = {},
    onChipLog?: (text: string) => void,
): void {
    for (const part of diagram.parts) {
        if (!part.type.startsWith('chip-')) continue;
        const chipName = part.type.slice('chip-'.length);
        const wasmBase64 = artifacts[chipName] ?? artifacts[`${chipName}.chip.wasm`];

        if (!wasmBase64) {
            onChipLog?.(`[chip:${chipName}] WASM artifact not found. Run Build Chips first.\n`);
            continue;
        }

        try {
            const manifest = manifests[chipName];
            const pinBridge = buildChipPinBridge(diagram, runner, part.id);
            if (pinBridge.length === 0) {
                onChipLog?.(`[chip:${chipName}] no GPIO bridge mappings found for ${part.id}.\n`);
            } else {
                const mapText = pinBridge
                    .map((m, i) => `#${i}:${m.chipPinName}->${m.arduinoPin}`)
                    .join(', ');
                onChipLog?.(`[chip:${chipName}] GPIO bridge mapped (${mapText}).\n`);
            }

            const runtime = instantiateCustomChip(wasmBase64, runner, {
                chipName,
                partId: part.id,
                pinBridge,
            }, manifest, part.attrs, i2cBus, (frame) => {
                const host = document.getElementById(part.id) as (HTMLElement & {
                    __avr8jsFramebufferUpdate?: (next: { width: number; height: number; pixels: Uint8Array }) => void;
                }) | null;
                host?.__avr8jsFramebufferUpdate?.(frame);
            }, onChipLog);

            if (manifest && manifest.controls.length > 0 && runtime.controls) {
                const controlIndex = new Map<string, number>();
                manifest.controls.forEach((c, i) => controlIndex.set(c.key, i));

                adjustableDevices.push({
                    partId: part.id,
                    partType: part.type,
                    label: manifest.title,
                    properties: manifest.controls,
                    get: (key) => {
                        const idx = controlIndex.get(key);
                        if (idx === undefined) return 0;
                        return runtime.controls!.getControl(idx);
                    },
                    set: (key, value) => {
                        const idx = controlIndex.get(key);
                        if (idx === undefined) return;
                        runtime.controls!.setControl(idx, value);
                    },
                });
                onChipLog?.(`[chip:${chipName}] controls bridge enabled (${manifest.controls.length} control(s)).\n`);
            } else if (manifest && manifest.controls.length > 0) {
                onChipLog?.(`[chip:${chipName}] controls declared in .chip.json, but no control ABI exports were found. Using fallback local state.\n`);
                const controlIndex = new Map<string, number>();
                const localValues = manifest.controls.map((c) => c.defaultValue);
                manifest.controls.forEach((c, i) => controlIndex.set(c.key, i));
                adjustableDevices.push({
                    partId: part.id,
                    partType: part.type,
                    label: manifest.title,
                    properties: manifest.controls,
                    get: (key) => {
                        const idx = controlIndex.get(key);
                        if (idx === undefined) return 0;
                        return localValues[idx];
                    },
                    set: (key, value) => {
                        const idx = controlIndex.get(key);
                        if (idx === undefined) return;
                        localValues[idx] = value;
                    },
                });
            }

            const i2cAddress = parseI2CAddress(part.attrs);
            if (i2cAddress !== null) {
                if (!runtime.i2c) {
                    onChipLog?.(`[chip:${chipName}] i2cAddress=${i2cAddress} configured, but chip has no I2C ABI exports (chip_i2c_*). Skipping I2C registration.\n`);
                } else if (i2cBus.devices[i2cAddress]) {
                    onChipLog?.(`[chip:${chipName}] I2C address 0x${i2cAddress.toString(16)} already in use. Skipping registration for ${part.id}.\n`);
                } else {
                    const dev: I2CDevice = {
                        i2cConnect: (addr, write) => runtime.i2c!.i2cConnect(addr, write),
                        i2cReadByte: (acked) => runtime.i2c!.i2cReadByte(acked),
                        i2cWriteByte: (value) => runtime.i2c!.i2cWriteByte(value),
                        i2cDisconnect: () => runtime.i2c!.i2cDisconnect(),
                    };
                    i2cBus.registerDevice(i2cAddress, dev);
                    onChipLog?.(`[chip:${chipName}] I2C bridge registered at 0x${i2cAddress.toString(16)} for ${part.id}.\n`);
                }
            }

            controllers.push({
                element: document.body,
                update: () => {
                    runtime.tick();
                    return null;
                },
                type: 'custom-chip',
            });
            cleanups.push(() => runtime.dispose());
            onChipLog?.(`[chip:${chipName}] runtime initialized for part ${part.id}.\n`);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            onChipLog?.(`[chip:${chipName}] runtime init failed: ${msg}\n`);
        }
    }
}
