import type { AVRRunner } from '../../shared/execute';
import type { I2CBus } from '../../shared/i2c-bus';
import type { CustomChipManifest } from './custom-chips';
import { createCustomChipCompatLayer } from './custom-chip-runtime-compat';
import type {
    ChipPinBridge,
    CustomChipControlBridge,
    CustomChipI2CBridge,
    CustomChipRuntime,
} from './custom-chip-runtime-types';

export type {
    ChipPinBridge,
    CustomChipControlBridge,
    CustomChipI2CBridge,
    CustomChipRuntime,
} from './custom-chip-runtime-types';

export interface CreateCustomChipRuntimeOptions {
    wasmBase64: string;
    runner: AVRRunner;
    chipName: string;
    partId: string;
    pinBridge: ChipPinBridge[];
    manifest?: CustomChipManifest;
    attrs?: Record<string, string>;
    i2cBus: I2CBus;
    onFramebuffer?: (frame: { width: number; height: number; pixels: Uint8Array }) => void;
    onChipLog?: (text: string) => void;
}

function decodeBase64(base64: string): Uint8Array {
    const str = atob(base64);
    const out = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
        out[i] = str.codePointAt(i) ?? 0;
    }
    return out;
}

function toWasmBufferSource(bytes: Uint8Array): ArrayBuffer {
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    return buffer;
}

export function createCustomChipRuntime({
    wasmBase64,
    runner,
    chipName,
    partId,
    pinBridge,
    manifest,
    attrs,
    i2cBus,
    onFramebuffer,
    onChipLog,
}: CreateCustomChipRuntimeOptions): CustomChipRuntime {
    const bytes = decodeBase64(wasmBase64);
    const module = new WebAssembly.Module(toWasmBufferSource(bytes));
    const compat = createCustomChipCompatLayer(module, {
        runner,
        chipName,
        partId,
        pinBridge,
        manifest,
        attrs,
        i2cBus,
        onChipLog,
    });
    const instance = new WebAssembly.Instance(module, compat.imports);
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

    const controlValues = (manifest?.controls ?? []).map((control) => control.defaultValue);
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