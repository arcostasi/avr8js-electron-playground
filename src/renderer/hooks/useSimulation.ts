import { useRef, useState, useEffect, useCallback } from 'react';
import type { WokwiDiagram } from '../types/wokwi.types';
import type { AVRRunner } from '../../shared/execute';
import {
    compileSimulationSetup, createHardwareControllers, updateControllerStates,
} from '../services/simulation-engine';
import type { AdjustableDevice, CompiledSimulationSetup } from '../services/simulation-engine';
import type { CustomChipArtifacts, CustomChipManifests } from '../services/custom-chips';
import { setupGPIORouting } from '../services/gpio-router';
import type { GPIOCleanup } from '../services/gpio-router';
import { markPerf, measureAsync, measureSync } from '../utils/perf';

export interface CpuPortSnapshot {
    id: string;
    label: string;
    value: number;
}

/** Snapshot of AVR CPU state for the inspector panel */
export interface CpuSnapshot {
    /** General-purpose registers R0–R31 */
    registers: Uint8Array;
    /** Stack pointer (SPL | SPH<<8) */
    sp: number;
    /** Program counter (word address) */
    pc: number;
    /** Status register (SREG) */
    sreg: number;
    /** Dynamic collection of MCU output ports derived from the active profile */
    ports: CpuPortSnapshot[];
}

interface UseSimulationParams {
    projectKey?: string;
    diagram?: WokwiDiagram;
    hex?: string | null;
    customChipArtifacts?: CustomChipArtifacts;
    customChipManifests?: CustomChipManifests;
    onSerialOutput: (text: string, usartId?: string) => void;
    onChipOutput?: (text: string) => void;
    onNeoPixelsUpdate?: (partId: string, pixels: Uint32Array) => void;
    setIsEditMode: (edit: boolean) => void;
}

interface UseSimulationReturn {
    isPlaying: boolean;
    simTime: string;
    simSpeed: string;
    /** Current speed multiplier (0.1–8). Default is 1.0. */
    speedMultiplier: number;
    /** Change simulation speed. Takes effect immediately even mid-simulation. */
    setSpeedMultiplier: (v: number) => void;
    handlePlay: () => Promise<void>;
    handleStop: () => void;
    serialWrite: (text: string, usartId?: string) => void;
    adjustableDevices: AdjustableDevice[];
    /** Returns current CPU registers snapshot (null if not running) */
    getCpuSnapshot: () => CpuSnapshot | null;
}

const SERIAL_FLUSH_INTERVAL_MS = 50;
const SERIAL_IMMEDIATE_FLUSH_CHARS = 4096;

export function useSimulation({
    projectKey,
    diagram,
    hex,
    customChipArtifacts = {},
    customChipManifests = {},
    onSerialOutput,
    onChipOutput,
    onNeoPixelsUpdate,
    setIsEditMode,
}: UseSimulationParams): UseSimulationReturn {
    const [isPlaying, setIsPlaying] = useState(false);
    const [simTime, setSimTime] = useState('00:00.000');
    const [simSpeed, setSimSpeed] = useState('0%');
    const [adjustableDevices, setAdjustableDevices] = useState<AdjustableDevice[]>([]);
    const [speedMultiplier, setSpeedMultiplier] = useState(1);
    const runnerRef = useRef<AVRRunner | null>(null);
    const gpioCleanupRef = useRef<GPIOCleanup | null>(null);
    const compiledSetupRef = useRef<CompiledSimulationSetup | null>(null);
    const lastDiagramShapeRef = useRef<string | null>(null);
    const lastDiagramLayoutRef = useRef<string | null>(null);
    const serialLineStateRef = useRef<Record<string, boolean>>({});
    const pendingSerialRef = useRef<Map<string, string>>(new Map());
    const onSerialOutputRef = useRef(onSerialOutput);
    onSerialOutputRef.current = onSerialOutput;
    const onNeoPixelsUpdateRef = useRef(onNeoPixelsUpdate);
    onNeoPixelsUpdateRef.current = onNeoPixelsUpdate;
    const playSessionRef = useRef(0);
    const prevProjectKeyRef = useRef<string | undefined>(projectKey);

    const flushPendingSerial = useCallback(() => {
        const pending = pendingSerialRef.current;
        if (pending.size === 0) return;
        const entries = Array.from(pending.entries());
        pending.clear();
        for (const [usartId, text] of entries) {
            if (text.length > 0) {
                onSerialOutputRef.current(text, usartId);
            }
        }
    }, []);

    const getDiagramLayoutHash = useCallback((currentDiagram: WokwiDiagram): string => {
        return JSON.stringify(currentDiagram.parts.map((part) => ({
            id: part.id,
            top: part.top,
            left: part.left,
            rotate: part.rotate,
        })));
    }, []);

    const getCompiledSetup = useCallback((currentDiagram: WokwiDiagram): CompiledSimulationSetup => {
        const nextSetup = compileSimulationSetup(currentDiagram);
        if (compiledSetupRef.current?.structuralHash === nextSetup.structuralHash) {
            return compiledSetupRef.current;
        }
        compiledSetupRef.current = nextSetup;
        return nextSetup;
    }, []);

    const stopSimulation = useCallback(() => {
        playSessionRef.current += 1;
        measureSync('simulation-stop', () => {
            flushPendingSerial();
            if (gpioCleanupRef.current) {
                gpioCleanupRef.current();
                gpioCleanupRef.current = null;
            }
            if (runnerRef.current) {
                runnerRef.current.stop();
                runnerRef.current = null;
            }
            serialLineStateRef.current = {};
            pendingSerialRef.current.clear();
            setAdjustableDevices([]);
            setIsPlaying(false);
            setSimTime('00:00.000');
            setSimSpeed('0%');
        });
    }, [flushPendingSerial]);

    // Stop simulation cleanly whenever active project changes
    useEffect(() => {
        if (prevProjectKeyRef.current === projectKey) return;
        prevProjectKeyRef.current = projectKey;
        stopSimulation();
        compiledSetupRef.current = null;
        lastDiagramShapeRef.current = null;
        lastDiagramLayoutRef.current = null;
    }, [projectKey, stopSimulation]);

    // Stop simulation if firmware is cleared
    useEffect(() => {
        if (!hex && (runnerRef.current || isPlaying)) {
            stopSimulation();
            setIsEditMode(true);
        }
    }, [hex, isPlaying, setIsEditMode, stopSimulation]);

    // Cleanup on unmount
    useEffect(() => {
        return () => stopSimulation();
    }, [stopSimulation]);

    const handlePlay = useCallback(async () => {
        const sessionId = ++playSessionRef.current;
        await measureAsync('simulation-start', async () => {
        if (!hex) {
            alert('Please compile the code first.');
            return;
        }

        setIsEditMode(false);
        setIsPlaying(true);

        try {
        const { AVRRunner } = await import('../../shared/execute');
        const { getBoardSimulationWarning, resolveBoardProfileFromParts } = await import('../../shared/avr/profiles');
        const { formatTime } = await import('../../shared/format-time');
        const { I2CBus } = await import('../../shared/i2c-bus');
        const { CPUPerformance } = await import('../../shared/cpu-performance');

        if (playSessionRef.current !== sessionId) {
            return;
        }

        if (gpioCleanupRef.current) {
            gpioCleanupRef.current();
            gpioCleanupRef.current = null;
        }
        if (runnerRef.current) {
            runnerRef.current.stop();
            runnerRef.current = null;
        }

        const boardProfile = resolveBoardProfileFromParts(diagram?.parts ?? []);
        const simulationWarning = getBoardSimulationWarning(boardProfile);
        if (simulationWarning) {
            onSerialOutputRef.current(`[warning] ${simulationWarning}\n`);
        }
        const runner = new AVRRunner(hex, boardProfile.mcu);
        runnerRef.current = runner;
        runner.speedMultiplier = speedMultiplier;
        serialLineStateRef.current = Object.fromEntries(
            Object.keys(runner.usarts).map((usartId) => [usartId, true]),
        );

        for (const [usartId, usart] of Object.entries(runner.usarts)) {
            usart.onByteTransmit = (value: number) => {
                const char = String.fromCodePoint(value);
                const isPrimary = usartId === runner.mcuProfile.defaults.usart;
                const atLineStart = serialLineStateRef.current[usartId] ?? true;
                const prefix = !isPrimary && atLineStart && char !== '\n' && char !== '\r' ? `[${usartId}] ` : '';
                const nextText = (pendingSerialRef.current.get(usartId) ?? '') + prefix + char;
                pendingSerialRef.current.set(usartId, nextText);
                serialLineStateRef.current[usartId] = char === '\n' || char === '\r';
                if (nextText.length >= SERIAL_IMMEDIATE_FLUSH_CHARS) {
                    flushPendingSerial();
                }
            };
        }

        // Initialize hardware
        const i2cBus = new I2CBus(runner.twi);
        const compiledSetup = diagram ? measureSync(
            'simulation-compile-setup',
            () => getCompiledSetup(diagram),
            `parts=${diagram.parts.length},conns=${diagram.connections.length}`,
        ) : null;

        if (diagram && compiledSetup) {
            const nextLayoutHash = getDiagramLayoutHash(diagram);
            const previousShapeHash = lastDiagramShapeRef.current;
            const previousLayoutHash = lastDiagramLayoutRef.current;
            const dirtyFlags = {
                structure: previousShapeHash !== compiledSetup.structuralHash,
                layout: previousLayoutHash !== nextLayoutHash,
                visualsOnly: previousShapeHash === compiledSetup.structuralHash && previousLayoutHash !== nextLayoutHash,
            };
            markPerf(
                'simulation-dirty-flags',
                `structure=${dirtyFlags.structure},layout=${dirtyFlags.layout},visualsOnly=${dirtyFlags.visualsOnly}`,
            );
            lastDiagramShapeRef.current = compiledSetup.structuralHash;
            lastDiagramLayoutRef.current = nextLayoutHash;
        }

        const { controllers, adjustable, cleanup: hwCleanup } = diagram
            ? measureSync(
                'simulation-create-hardware-controllers',
                () => createHardwareControllers(
                    diagram,
                    runner,
                    i2cBus,
                    customChipArtifacts,
                    customChipManifests,
                    onChipOutput,
                    compiledSetup ?? undefined,
                    (partId, pixels) => onNeoPixelsUpdateRef.current?.(partId, pixels),
                ),
                `parts=${diagram.parts.length},conns=${diagram.connections.length}`,
            )
            : { controllers: [], adjustable: [], cleanup: () => {} };

        setAdjustableDevices(adjustable);

        const gpioRouting = diagram ? setupGPIORouting(diagram, runner, compiledSetup ?? undefined) : null;
        if (gpioRouting) {
            gpioCleanupRef.current = () => { gpioRouting.cleanup(); hwCleanup(); };
        } else {
            gpioCleanupRef.current = hwCleanup;
        }

        // Execute simulation loop
        const cpuPerf = new CPUPerformance(runner.cpu, runner.frequency);
        let previousMillis = 0;
        let previousTimeMillis = 0;

        runner.execute((cpu) => {
            const millis = performance.now();

            // Pump visual state to DOM elements (60fps synced)
            gpioRouting?.flush();
            updateControllerStates(controllers);

            // Throttle UI React state updates & batch serial output every ~50ms
            if (millis - previousTimeMillis > SERIAL_FLUSH_INTERVAL_MS) {
                const timeStr = formatTime(cpu.cycles / runner.frequency);
                setSimTime(timeStr);
                flushPendingSerial();
                previousTimeMillis = millis;
            }

            if ((millis - previousMillis) > 200) {
                const speedCalc = (cpuPerf.update() * 100).toFixed(0);
                if (!Number.isNaN(Number.parseFloat(speedCalc))) {
                    setSimSpeed(speedCalc.padStart(3, '0') + '%');
                }
                previousMillis = millis;
            }
        });
        markPerf('simulation-loop-started');
        } catch (err) {
            if (playSessionRef.current === sessionId) {
                stopSimulation();
                setIsEditMode(true);
                onSerialOutputRef.current(`[error] Failed to start simulation: ${err instanceof Error ? err.message : String(err)}\n`);
            }
        }
        });
    }, [hex, diagram, customChipArtifacts, customChipManifests, onChipOutput, setIsEditMode, speedMultiplier, stopSimulation, getCompiledSetup, getDiagramLayoutHash, flushPendingSerial]);

    const handleStop = useCallback(() => {
        stopSimulation();
        setIsEditMode(true);
    }, [setIsEditMode, stopSimulation]);

    const serialWrite = useCallback((text: string, usartId?: string) => {
        if (!runnerRef.current) return;
        if (usartId) {
            runnerRef.current.serialWriteToUsart(usartId, text);
            return;
        }
        runnerRef.current.serialWrite(text);
    }, []);

    /** Apply speed multiplier to the running AVRRunner (or remember for next run) */
    const updateSpeedMultiplier = useCallback((v: number) => {
        const clamped = Math.max(0.05, Math.min(8, v));
        setSpeedMultiplier(clamped);
        if (runnerRef.current) {
            runnerRef.current.speedMultiplier = clamped;
        }
    }, []);

    /** Capture a lightweight snapshot of the CPU state */
    const getCpuSnapshot = useCallback((): CpuSnapshot | null => {
        const runner = runnerRef.current;
        if (!runner) return null;
        const { data } = runner.cpu;
        return {
            // R0–R31 are bytes 0–31 in data space
            registers: data.slice(0, 32) as Uint8Array,
            // SPL = 0x5D, SPH = 0x5E
            sp: data[0x5D] | (data[0x5E] << 8),
            // PC comes from cpu.pc (word address)
            pc: runner.cpu.pc,
            // SREG = 0x5F
            sreg: data[0x5F],
            ports: Object.values(runner.mcuProfile.ports).map((portProfile) => ({
                id: portProfile.id,
                label: portProfile.label,
                value: runner.getPortOutputValue(portProfile.id),
            })),
        };
    }, []);

    return {
        isPlaying, simTime, simSpeed,
        speedMultiplier, setSpeedMultiplier: updateSpeedMultiplier,
        handlePlay, handleStop, serialWrite,
        adjustableDevices,
        getCpuSnapshot,
    };
}
