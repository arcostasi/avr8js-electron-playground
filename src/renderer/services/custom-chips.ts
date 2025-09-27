import type { AVRRunner } from '../../shared/execute';
import type { HardwareController, WokwiDiagram } from '../types/wokwi.types';
import type { I2CBus, I2CDevice } from '../../shared/i2c-bus';
import {
    buildChipPinBridge,
    parseCustomChipI2CAddress,
} from './custom-chip-pin-bridge';
import {
    createCustomChipRuntime,
    type ChipPinBridge,
    type CustomChipControlBridge,
    type CustomChipI2CBridge,
    type CustomChipRuntime,
} from './custom-chip-runtime';

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
                .filter((c) => c?.type === 'range' && typeof c.id === 'string' && c.id.length > 0)
                .map((c) => {
                    const min = typeof c.min === 'number' ? c.min : 0;
                    const max = typeof c.max === 'number' ? c.max : 100;
                    const step = typeof c.step === 'number' && c.step > 0 ? c.step : 1;
                    const defaultValue = typeof c.defaultValue === 'number' ? c.defaultValue : min;
                    return {
                        key: c.id,
                        label: c.label?.trim() || c.id,
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

interface AdjustableRuntimeDevice {
    partId: string;
    partType: string;
    label?: string;
    properties?: CustomChipControl[];
    get: (key: string) => number;
    set: (key: string, value: number) => void;
}

export interface AttachCustomChipControllersOptions {
    diagram: WokwiDiagram;
    runner: AVRRunner;
    i2cBus: I2CBus;
    controllers: HardwareController[];
    adjustableDevices: AdjustableRuntimeDevice[];
    cleanups: Array<() => void>;
    artifacts: CustomChipArtifacts;
    manifests?: CustomChipManifests;
    onChipLog?: (text: string) => void;
}

function logPinBridgeMappings(
    chipName: string,
    partId: string,
    pinBridge: ChipPinBridge[],
    onChipLog?: (text: string) => void,
): void {
    if (pinBridge.length === 0) {
        onChipLog?.(`[chip:${chipName}] no GPIO bridge mappings found for ${partId}.\n`);
        return;
    }

    const mapText = pinBridge
        .map((mapping, index) => `#${index}:${mapping.chipPinName}->${mapping.arduinoPin}`)
        .join(', ');
    onChipLog?.(`[chip:${chipName}] GPIO bridge mapped (${mapText}).\n`);
}

function addControlAdjustableDevice(
    manifest: CustomChipManifest,
    part: { id: string; type: string },
    controlsBridge: CustomChipControlBridge,
    adjustableDevices: AdjustableRuntimeDevice[],
    onChipLog?: (text: string) => void,
): void {
    const controlIndex = new Map<string, number>();
    manifest.controls.forEach((control, index) => controlIndex.set(control.key, index));

    adjustableDevices.push({
        partId: part.id,
        partType: part.type,
        label: manifest.title,
        properties: manifest.controls,
        get: (key) => {
            const index = controlIndex.get(key);
            if (index === undefined) return 0;
            return controlsBridge.getControl(index);
        },
        set: (key, value) => {
            const index = controlIndex.get(key);
            if (index === undefined) return;
            controlsBridge.setControl(index, value);
        },
    });
    onChipLog?.(`[chip:${manifest.chipName}] controls bridge enabled (${manifest.controls.length} control(s)).\n`);
}

function addFallbackControlAdjustableDevice(
    manifest: CustomChipManifest,
    part: { id: string; type: string },
    adjustableDevices: AdjustableRuntimeDevice[],
    onChipLog?: (text: string) => void,
): void {
    const controlIndex = new Map<string, number>();
    const localValues = manifest.controls.map((control) => control.defaultValue);
    manifest.controls.forEach((control, index) => controlIndex.set(control.key, index));

    adjustableDevices.push({
        partId: part.id,
        partType: part.type,
        label: manifest.title,
        properties: manifest.controls,
        get: (key) => {
            const index = controlIndex.get(key);
            if (index === undefined) return 0;
            return localValues[index];
        },
        set: (key, value) => {
            const index = controlIndex.get(key);
            if (index === undefined) return;
            localValues[index] = value;
        },
    });
    onChipLog?.(`[chip:${manifest.chipName}] controls declared in .chip.json, but no control ABI exports were found. Using fallback local state.\n`);
}

function registerRuntimeI2CBridge(
    chipName: string,
    partId: string,
    i2cAddress: number | null,
    i2cBridge: CustomChipI2CBridge | null,
    i2cBus: I2CBus,
    onChipLog?: (text: string) => void,
): void {
    if (i2cAddress === null) {
        return;
    }

    if (!i2cBridge) {
        onChipLog?.(`[chip:${chipName}] i2cAddress=${i2cAddress} configured, but chip has no I2C ABI exports (chip_i2c_*). Skipping I2C registration.\n`);
        return;
    }

    if (i2cBus.devices[i2cAddress]) {
        onChipLog?.(`[chip:${chipName}] I2C address 0x${i2cAddress.toString(16)} already in use. Skipping registration for ${partId}.\n`);
        return;
    }

    const device: I2CDevice = {
        i2cConnect: (addr, write) => i2cBridge.i2cConnect(addr, write),
        i2cReadByte: (acked) => i2cBridge.i2cReadByte(acked),
        i2cWriteByte: (value) => i2cBridge.i2cWriteByte(value),
        i2cDisconnect: () => i2cBridge.i2cDisconnect(),
    };
    i2cBus.registerDevice(i2cAddress, device);
    onChipLog?.(`[chip:${chipName}] I2C bridge registered at 0x${i2cAddress.toString(16)} for ${partId}.\n`);
}

function createFramebufferUpdater(partId: string) {
    return (frame: { width: number; height: number; pixels: Uint8Array }) => {
        const host = document.getElementById(partId) as (HTMLElement & {
            __avr8jsFramebufferUpdate?: (next: { width: number; height: number; pixels: Uint8Array }) => void;
        }) | null;
        host?.__avr8jsFramebufferUpdate?.(frame);
    };
}

function attachRuntimeController(
    runtime: CustomChipRuntime,
    controllers: HardwareController[],
    cleanups: Array<() => void>,
): void {
    controllers.push({
        element: document.body,
        update: () => {
            runtime.tick();
            return null;
        },
        type: 'custom-chip',
    });
    cleanups.push(() => runtime.dispose());
}

export function attachCustomChipControllers({
    diagram,
    runner,
    i2cBus,
    controllers,
    adjustableDevices,
    cleanups,
    artifacts,
    manifests = {},
    onChipLog,
}: AttachCustomChipControllersOptions): void {
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
            logPinBridgeMappings(chipName, part.id, pinBridge, onChipLog);

            const runtime = createCustomChipRuntime({
                wasmBase64,
                runner,
                chipName,
                partId: part.id,
                pinBridge,
                manifest,
                attrs: part.attrs,
                i2cBus,
                onFramebuffer: createFramebufferUpdater(part.id),
                onChipLog,
            });
            const controlsBridge = runtime.controls;
            const i2cBridge = runtime.i2c;

            if (manifest && manifest.controls.length > 0 && controlsBridge) {
                addControlAdjustableDevice(manifest, part, controlsBridge, adjustableDevices, onChipLog);
            } else if (manifest && manifest.controls.length > 0) {
                addFallbackControlAdjustableDevice(manifest, part, adjustableDevices, onChipLog);
            }

            registerRuntimeI2CBridge(
                chipName,
                part.id,
                parseCustomChipI2CAddress(part.attrs),
                i2cBridge,
                i2cBus,
                onChipLog,
            );

            attachRuntimeController(runtime, controllers, cleanups);
            onChipLog?.(`[chip:${chipName}] runtime initialized for part ${part.id}.\n`);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'unknown runtime error';
            onChipLog?.(`[chip:${chipName}] runtime init failed: ${msg}\n`);
        }
    }
}
