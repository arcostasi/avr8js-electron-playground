import type { AVRRunner } from '../../shared/execute';
import type { I2CBus } from '../../shared/i2c-bus';
import type { CustomChipManifest } from './custom-chips';
import type { ChipPinBridge } from './custom-chip-runtime-types';
import { installCoreRuntimeAbi } from './custom-chip-runtime-core-abi';
import { installFramebufferRuntimeAbi } from './custom-chip-runtime-framebuffer-abi';
import { installPeripheralRuntimeAbi } from './custom-chip-runtime-peripheral-abi';

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

interface CustomChipBridgeContext {
	chipName: string;
	partId: string;
	pinBridge: ChipPinBridge[];
}

export interface CreateCustomChipCompatOptions {
	runner: AVRRunner;
	chipName: string;
	partId: string;
	pinBridge: ChipPinBridge[];
	manifest?: CustomChipManifest;
	attrs?: Record<string, string>;
	i2cBus: I2CBus;
	onChipLog?: (text: string) => void;
}

export interface CustomChipCompatLayer {
	imports: WebAssembly.Imports;
	bindInstance: (instance: WebAssembly.Instance) => void;
	poll: () => void;
	pullFramebuffer: () => { width: number; height: number; pixels: Uint8Array } | null;
	dispose: () => void;
}

export interface RuntimeImportModule {
	[key: string]: unknown;
}

export interface RuntimePinWatcher {
	edge: number;
	callback: number;
	userData: number;
	lastValue: number;
}

export interface RuntimeTimerState {
	callback: number;
	userData: number;
	active: boolean;
	repeat: boolean;
	periodNs: bigint;
	nextNs: bigint;
}

export interface RuntimeUartState {
	writeDone: number;
	rxData: number;
	userData: number;
	busy: boolean;
	rxPin: number;
	txPin: number;
	linkedToUsart: boolean;
}

export interface RuntimeSpiState {
	done: number;
	userData: number;
}

export interface RuntimeSpiTransferState {
	devId: number;
	bufferPtr: number;
	count: number;
	transferred: number;
}

export interface RuntimeFramebufferState {
	handle: number;
	width: number;
	height: number;
	bytes: Uint8Array;
	dirty: boolean;
}

export interface RuntimeCompatState {
	readonly basePinCount: number;
	readonly chipRuntimeId: string;
	readonly pinModes: number[];
	readonly pinAnalogVolts: number[];
	readonly virtualPinValues: Map<number, number>;
	readonly dynamicPinByName: Map<string, number>;
	readonly pinWatchers: Map<number, RuntimePinWatcher>;
	nextTimerId: number;
	readonly timers: Map<number, RuntimeTimerState>;
	nextAttrHandle: number;
	readonly intAttrs: Map<number, number>;
	readonly floatAttrs: Map<number, number>;
	nextI2CDevId: number;
	nextUartId: number;
	readonly uartState: Map<number, RuntimeUartState>;
	nextSpiId: number;
	readonly spiState: Map<number, RuntimeSpiState>;
	spiActive: RuntimeSpiTransferState | null;
	unregisterSpiMux: (() => void) | null;
	readonly uartUnsubscribers: Array<() => void>;
	readonly framebuffer: RuntimeFramebufferState;
}

export interface RuntimeAbiContext {
	runner: AVRRunner;
	bridge: CustomChipBridgeContext;
	manifest?: CustomChipManifest;
	attrs?: Record<string, string>;
	i2cBus: I2CBus;
	onChipLog?: (text: string) => void;
	state: RuntimeCompatState;
	getMemory: () => WebAssembly.Memory | null;
	readU8: (ptr: number) => number;
	writeU8: (ptr: number, value: number) => void;
	readU32: (ptr: number) => number;
	writeU32: (ptr: number, value: number) => void;
	readCString: (ptr: number) => string;
	callIndirect: (funcIndex: number, args?: unknown[]) => unknown;
	millis: () => number;
	micros: () => number;
	simNanos: () => bigint;
	gpioRead: (pin: number) => number;
	gpioWrite: (pin: number, value: number) => void;
	syncAnalogChannel: (pin: number, adcValue: number) => void;
	applyPinMode: (pin: number, mode: number) => void;
	ensureSpiHook: () => void;
	subscribeUsartByteSink: (id: string, onByte: (value: number) => void) => void;
}

export type RuntimeAbiInstaller = (
	importName: string,
	mod: RuntimeImportModule,
	context: RuntimeAbiContext,
) => boolean;

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

	const spiMux = spiHost[SPI_MUX_KEY];
	if (spiMux) {
		spiMux.sessions.push(session);
	}
	return () => {
		const mux = spiHost[SPI_MUX_KEY];
		if (!mux) return;
		mux.sessions = mux.sessions.filter((candidate) => candidate.id !== session.id);
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

	const usartMux = usartHost[USART_MUX_KEY];
	if (usartMux) {
		usartMux.sessions.push(session);
	}
	return () => {
		const mux = usartHost[USART_MUX_KEY];
		if (!mux) return;
		mux.sessions = mux.sessions.filter((candidate) => candidate.id !== session.id);
		if (mux.sessions.length === 0) {
			runner.usart.onByteTransmit = mux.previous;
			delete usartHost[USART_MUX_KEY];
		}
	};
}

function createRuntimeState(
	bridge: CustomChipBridgeContext,
	manifest: CustomChipManifest | undefined,
): RuntimeCompatState {
	const basePinCount = Math.max(bridge.pinBridge.length, manifest?.pins.length ?? 0);
	const width = manifest?.framebuffer?.width ?? 128;
	const height = manifest?.framebuffer?.height ?? 64;

	return {
		basePinCount,
		chipRuntimeId: `${bridge.partId}:${bridge.chipName}:${Math.random().toString(36).slice(2)}`,
		pinModes: Array.from({ length: basePinCount }, () => 0),
		pinAnalogVolts: Array.from({ length: basePinCount }, () => 0),
		virtualPinValues: new Map<number, number>(),
		dynamicPinByName: new Map<string, number>(),
		pinWatchers: new Map<number, RuntimePinWatcher>(),
		nextTimerId: 1,
		timers: new Map<number, RuntimeTimerState>(),
		nextAttrHandle: 1,
		intAttrs: new Map<number, number>(),
		floatAttrs: new Map<number, number>(),
		nextI2CDevId: 1,
		nextUartId: 1,
		uartState: new Map<number, RuntimeUartState>(),
		nextSpiId: 1,
		spiState: new Map<number, RuntimeSpiState>(),
		spiActive: null,
		unregisterSpiMux: null,
		uartUnsubscribers: [],
		framebuffer: {
			handle: 1,
			width,
			height,
			bytes: new Uint8Array(Math.max(1, width * height * 4)),
			dirty: false,
		},
	};
}

function processPinWatchers(context: RuntimeAbiContext): void {
	const LOW = 0;
	const HIGH = 1;
	const RISING = 1;
	const FALLING = 2;
	const BOTH = 3;

	for (const [pin, watch] of context.state.pinWatchers) {
		const current = context.gpioRead(pin);
		if (current === watch.lastValue) continue;
		const rising = watch.lastValue === LOW && current === HIGH;
		const falling = watch.lastValue === HIGH && current === LOW;
		watch.lastValue = current;
		if (
			watch.edge === BOTH
			|| (watch.edge === RISING && rising)
			|| (watch.edge === FALLING && falling)
		) {
			context.callIndirect(watch.callback, [watch.userData, pin, current]);
		}
	}
}

function processTimers(context: RuntimeAbiContext): void {
	const now = context.simNanos();
	for (const [, timer] of context.state.timers) {
		if (!timer.active) continue;
		let guard = 0;
		while (timer.active && now >= timer.nextNs && guard < 32) {
			guard++;
			context.callIndirect(timer.callback, [timer.userData]);
			if (timer.repeat) {
				timer.nextNs += timer.periodNs;
			} else {
				timer.active = false;
			}
		}
	}
}

export function createCustomChipCompatLayer(
	module: WebAssembly.Module,
	{
		runner,
		chipName,
		partId,
		pinBridge,
		manifest,
		attrs,
		i2cBus,
		onChipLog,
	}: CreateCustomChipCompatOptions,
): CustomChipCompatLayer {
	const bridge: CustomChipBridgeContext = { chipName, partId, pinBridge };
	const state = createRuntimeState(bridge, manifest);
	const importObject: WebAssembly.Imports = {};
	let importedMemory: WebAssembly.Memory | null = null;
	let instanceRef: WebAssembly.Instance | null = null;

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
			return (fn as (...innerArgs: unknown[]) => unknown)(...args);
		} catch (error: unknown) {
			onChipLog?.(`[chip:${bridge.chipName}] indirect callback #${funcIndex} failed: ${error instanceof Error ? error.message : 'unknown error'}\n`);
			return 0;
		}
	};

	const gpioRead = (pin: number) => {
		const LOW = 0;
		const HIGH = 1;
		const map = bridge.pinBridge[pin];
		if (!map) return (state.virtualPinValues.get(pin) ?? LOW) ? HIGH : LOW;
		return map.port.pinState(map.bit) === 1 ? HIGH : LOW;
	};

	const syncAnalogChannel = (pin: number, adcValue: number) => {
		const map = bridge.pinBridge[pin];
		const channel = map?.adcChannel;
		if (typeof channel === 'number') {
			runner.adcRegistry.setValue(channel, adcValue);
		}
	};

	const gpioWrite = (pin: number, value: number) => {
		const LOW = 0;
		const HIGH = 1;
		const map = bridge.pinBridge[pin];
		if (!map) {
			state.virtualPinValues.set(pin, value === LOW ? LOW : HIGH);
			return;
		}
		map.port.setPin(map.bit, value !== LOW);
		syncAnalogChannel(pin, value === LOW ? 0 : 1023);
	};

	const applyPinMode = (pin: number, mode: number) => {
		const OUTPUT_LOW = 4;
		const OUTPUT_HIGH = 5;
		if (pin >= 0 && pin < state.pinModes.length) state.pinModes[pin] = mode;
		if (mode === OUTPUT_LOW) gpioWrite(pin, 0);
		if (mode === OUTPUT_HIGH) gpioWrite(pin, 1);
	};

	const context: RuntimeAbiContext = {
		runner,
		bridge,
		manifest,
		attrs,
		i2cBus,
		onChipLog,
		state,
		getMemory,
		readU8,
		writeU8,
		readU32,
		writeU32,
		readCString,
		callIndirect,
		millis,
		micros,
		simNanos,
		gpioRead,
		gpioWrite,
		syncAnalogChannel,
		applyPinMode,
		ensureSpiHook: () => {
			if (state.unregisterSpiMux) return;
			state.unregisterSpiMux = registerSpiMuxSession(runner, {
				id: state.chipRuntimeId,
				handleByte: (value: number) => {
					if (!state.spiActive) return false;
					const txPtr = state.spiActive.bufferPtr + state.spiActive.transferred;
					const txByte = readU8(txPtr);
					writeU8(txPtr, value & 0xFF);
					runner.spi.completeTransfer(txByte);
					state.spiActive.transferred++;

					if (state.spiActive.transferred >= state.spiActive.count) {
						const done = state.spiState.get(state.spiActive.devId)?.done ?? 0;
						const user = state.spiState.get(state.spiActive.devId)?.userData ?? 0;
						const bufferPtr = state.spiActive.bufferPtr;
						const transferred = state.spiActive.transferred;
						state.spiActive = null;
						callIndirect(done, [user, bufferPtr, transferred]);
					}
					return true;
				},
			});
		},
		subscribeUsartByteSink: (id, onByte) => {
			const unsubscribe = registerUsartMuxSession(runner, { id, onByte });
			state.uartUnsubscribers.push(unsubscribe);
		},
	};

	const installers: RuntimeAbiInstaller[] = [
		installCoreRuntimeAbi,
		installPeripheralRuntimeAbi,
		installFramebufferRuntimeAbi,
	];

	for (const imp of WebAssembly.Module.imports(module)) {
		if (!importObject[imp.module]) importObject[imp.module] = {};
		const mod = importObject[imp.module] as RuntimeImportModule;

		if (imp.kind === 'function') {
			const handled = installers.some((install) => install(imp.name, mod, context));
			if (!handled) {
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
			processPinWatchers(context);
			processTimers(context);
		},
		pullFramebuffer: () => {
			if (!state.framebuffer.dirty) return null;
			state.framebuffer.dirty = false;
			return {
				width: state.framebuffer.width,
				height: state.framebuffer.height,
				pixels: new Uint8Array(state.framebuffer.bytes),
			};
		},
		dispose: () => {
			if (state.unregisterSpiMux) {
				state.unregisterSpiMux();
				state.unregisterSpiMux = null;
			}
			for (const unsubscribe of state.uartUnsubscribers) {
				unsubscribe();
			}
			state.uartUnsubscribers.length = 0;
		},
	};
}