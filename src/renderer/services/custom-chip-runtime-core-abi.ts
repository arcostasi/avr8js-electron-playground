import type { RuntimeAbiContext, RuntimeImportModule } from './custom-chip-runtime-compat';

const LOW = 0;
const HIGH = 1;

function resolvePinIndexByName(context: RuntimeAbiContext, name: string): number {
    const normalized = name.trim().toLowerCase();
    if (!normalized) return -1;

    const staticIdx = context.bridge.pinBridge.findIndex(
        (mapping) => mapping.chipPinName.trim().toLowerCase() === normalized,
    );
    if (staticIdx >= 0) return staticIdx;

    const manifestIdx = (context.manifest?.pins ?? []).findIndex((pin) => pin.trim().toLowerCase() === normalized);
    if (manifestIdx >= 0 && manifestIdx < context.bridge.pinBridge.length) {
        return manifestIdx;
    }

    const existing = context.state.dynamicPinByName.get(normalized);
    if (existing !== undefined) return existing;

    const newIdx = context.state.basePinCount + context.state.dynamicPinByName.size;
    context.state.dynamicPinByName.set(normalized, newIdx);
    context.state.virtualPinValues.set(newIdx, LOW);
    while (context.state.pinModes.length <= newIdx) {
        context.state.pinModes.push(0);
    }
    while (context.state.pinAnalogVolts.length <= newIdx) {
        context.state.pinAnalogVolts.push(0);
    }
    return newIdx;
}

function parseAttrNumber(raw: string | undefined, fallback: number): number {
    if (raw === undefined) return fallback;
    const normalized = raw.trim().toLowerCase();
    const parsed = normalized.startsWith('0x')
        ? Number.parseInt(normalized.slice(2), 16)
        : Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : fallback;
}

export function installCoreRuntimeAbi(
    importName: string,
    mod: RuntimeImportModule,
    context: RuntimeAbiContext,
): boolean {
    switch (importName) {
        case 'millis':
        case 'avr8js_millis':
            mod[importName] = context.millis;
            return true;

        case 'micros':
        case 'avr8js_micros':
            mod[importName] = context.micros;
            return true;

        case 'get_sim_nanos':
            mod[importName] = context.simNanos;
            return true;

        case 'avr8js_gpio_read':
            mod[importName] = context.gpioRead;
            return true;

        case 'avr8js_gpio_write':
            mod[importName] = context.gpioWrite;
            return true;

        case 'avr8js_gpio_mode':
            mod[importName] = (pin: number, mode: number) => {
                context.applyPinMode(pin, mode);
                return 0;
            };
            return true;

        case 'pin_init':
            mod[importName] = (namePtr: number, mode: number) => {
                const pin = resolvePinIndexByName(context, context.readCString(namePtr));
                context.applyPinMode(pin, mode);
                return pin;
            };
            return true;

        case 'pin_mode':
            mod[importName] = (pin: number, mode: number) => {
                context.applyPinMode(pin, mode);
            };
            return true;

        case 'pin_write':
            mod[importName] = (pin: number, value: number) => {
                context.gpioWrite(pin, value);
            };
            return true;

        case 'pin_read':
            mod[importName] = (pin: number) => context.gpioRead(pin);
            return true;

        case 'pin_watch':
            mod[importName] = (pin: number, configPtr: number) => {
                if (context.state.pinWatchers.has(pin)) return 0;
                context.state.pinWatchers.set(pin, {
                    edge: context.readU32(configPtr),
                    callback: context.readU32(configPtr + 4),
                    userData: context.readU32(configPtr + 8),
                    lastValue: context.gpioRead(pin),
                });
                return 1;
            };
            return true;

        case 'pin_watch_stop':
            mod[importName] = (pin: number) => {
                context.state.pinWatchers.delete(pin);
            };
            return true;

        case 'pin_adc_read':
            mod[importName] = (pin: number) => {
                if (pin >= 0 && pin < context.state.pinAnalogVolts.length) {
                    const voltage = context.state.pinAnalogVolts[pin];
                    if (Number.isFinite(voltage) && voltage !== 0) return voltage;
                }
                return context.gpioRead(pin) === HIGH ? 5 : 0;
            };
            return true;

        case 'pin_dac_write':
            mod[importName] = (pin: number, voltage: number) => {
                const clamped = Math.max(0, Math.min(5, Number(voltage) || 0));
                if (pin >= 0 && pin < context.state.pinAnalogVolts.length) {
                    context.state.pinAnalogVolts[pin] = clamped;
                }
                context.gpioWrite(pin, clamped >= 2.5 ? HIGH : LOW);
                context.syncAnalogChannel(pin, Math.round((clamped / 5) * 1023));
            };
            return true;

        case 'timer_init':
            mod[importName] = (configPtr: number) => {
                const id = context.state.nextTimerId++;
                context.state.timers.set(id, {
                    callback: context.readU32(configPtr),
                    userData: context.readU32(configPtr + 4),
                    active: false,
                    repeat: false,
                    periodNs: 0n,
                    nextNs: 0n,
                });
                return id;
            };
            return true;

        case 'timer_start':
            mod[importName] = (timerId: number, microsDelay: number, repeat: number) => {
                const timer = context.state.timers.get(timerId);
                if (!timer) return;
                timer.repeat = repeat !== 0;
                timer.periodNs = BigInt(Math.max(0, Math.trunc(microsDelay))) * 1000n;
                timer.nextNs = context.simNanos() + timer.periodNs;
                timer.active = true;
            };
            return true;

        case 'timer_start_ns':
            mod[importName] = (timerId: number, nanosDelay: bigint, repeat: number) => {
                const timer = context.state.timers.get(timerId);
                if (!timer) return;
                timer.repeat = repeat !== 0;
                timer.periodNs = nanosDelay > 0n ? nanosDelay : 0n;
                timer.nextNs = context.simNanos() + timer.periodNs;
                timer.active = true;
            };
            return true;

        case 'timer_stop':
            mod[importName] = (timerId: number) => {
                const timer = context.state.timers.get(timerId);
                if (timer) {
                    timer.active = false;
                }
            };
            return true;

        case 'attr_init':
            mod[importName] = (namePtr: number, defaultValue: number) => {
                const handle = context.state.nextAttrHandle++;
                const name = context.readCString(namePtr);
                const value = parseAttrNumber(context.attrs?.[name], defaultValue);
                context.state.intAttrs.set(handle, Math.trunc(value));
                return handle;
            };
            return true;

        case 'attr_init_float':
            mod[importName] = (namePtr: number, defaultValue: number) => {
                const handle = context.state.nextAttrHandle++;
                const name = context.readCString(namePtr);
                const value = parseAttrNumber(context.attrs?.[name], defaultValue);
                context.state.floatAttrs.set(handle, value);
                return handle;
            };
            return true;

        case 'attr_read':
            mod[importName] = (handle: number) => Math.trunc(context.state.intAttrs.get(handle) ?? 0);
            return true;

        case 'attr_read_float':
            mod[importName] = (handle: number) => context.state.floatAttrs.get(handle) ?? 0;
            return true;

        default:
            return false;
    }
}