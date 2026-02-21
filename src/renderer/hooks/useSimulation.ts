import { useRef, useState, useEffect, useCallback } from 'react';
import type { WokwiDiagram } from '../types/wokwi.types';
import type { AVRRunner } from '../../shared/execute';
import {
    createHardwareControllers, updateControllerStates,
} from '../services/simulation-engine';
import type { AdjustableDevice } from '../services/simulation-engine';
import { setupGPIORouting } from '../services/gpio-router';
import type { GPIOCleanup } from '../services/gpio-router';

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
    /** Port B data register */
    portB: number;
    /** Port C data register */
    portC: number;
    /** Port D data register */
    portD: number;
}

interface UseSimulationParams {
    diagram?: WokwiDiagram;
    hex?: string | null;
    onSerialOutput: (text: string) => void;
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
    serialWrite: (text: string) => void;
    adjustableDevices: AdjustableDevice[];
    /** Returns current CPU registers snapshot (null if not running) */
    getCpuSnapshot: () => CpuSnapshot | null;
}

export function useSimulation({
    diagram,
    hex,
    onSerialOutput,
    setIsEditMode,
}: UseSimulationParams): UseSimulationReturn {
    const [isPlaying, setIsPlaying] = useState(false);
    const [simTime, setSimTime] = useState('00:00.000');
    const [simSpeed, setSimSpeed] = useState('0%');
    const [adjustableDevices, setAdjustableDevices] = useState<AdjustableDevice[]>([]);
    const [speedMultiplier, setSpeedMultiplierState] = useState(1.0);
    const runnerRef = useRef<AVRRunner | null>(null);
    const gpioCleanupRef = useRef<GPIOCleanup | null>(null);

    const stopSimulation = useCallback(() => {
        if (gpioCleanupRef.current) {
            gpioCleanupRef.current();
            gpioCleanupRef.current = null;
        }
        if (runnerRef.current) {
            runnerRef.current.stop();
            runnerRef.current = null;
        }
        setAdjustableDevices([]);
        setIsPlaying(false);
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => stopSimulation();
    }, [stopSimulation]);

    const handlePlay = useCallback(async () => {
        if (!hex) {
            alert('Please compile the code first.');
            return;
        }

        setIsEditMode(false);
        setIsPlaying(true);

        const { AVRRunner } = await import('../../shared/execute');
        const { formatTime } = await import('../../shared/format-time');
        const { I2CBus } = await import('../../shared/i2c-bus');
        const { CPUPerformance } = await import('../../shared/cpu-performance');

        if (runnerRef.current) runnerRef.current.stop();

        const runner = new AVRRunner(hex);
        runnerRef.current = runner;
        runner.speedMultiplier = speedMultiplier;

        runner.usart.onByteTransmit = (value: number) => {
            onSerialOutput(String.fromCodePoint(value));
        };

        // Initialize hardware
        const i2cBus = new I2CBus(runner.twi);
        const { controllers, adjustable, cleanup: hwCleanup } = diagram
            ? createHardwareControllers(diagram, runner, i2cBus)
            : { controllers: [], adjustable: [], cleanup: () => {} };

        setAdjustableDevices(adjustable);

        if (diagram) {
            const gpioClean = setupGPIORouting(diagram, runner);
            gpioCleanupRef.current = () => { gpioClean(); hwCleanup(); };
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
            updateControllerStates(controllers);

            // Throttle UI React state updates
            if (millis - previousTimeMillis > 50) {
                const timeStr = formatTime(cpu.cycles / runner.frequency);
                setSimTime(timeStr);
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
    }, [hex, diagram, onSerialOutput, setIsEditMode, speedMultiplier]);

    const handleStop = useCallback(() => {
        stopSimulation();
    }, [stopSimulation]);

    const serialWrite = useCallback((text: string) => {
        runnerRef.current?.serialWrite(text);
    }, []);

    /** Apply speed multiplier to the running AVRRunner (or remember for next run) */
    const setSpeedMultiplier = useCallback((v: number) => {
        const clamped = Math.max(0.05, Math.min(8, v));
        setSpeedMultiplierState(clamped);
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
            // Port data output regs: PORTB=0x25, PORTC=0x28, PORTD=0x2B
            portB: data[0x25],
            portC: data[0x28],
            portD: data[0x2B],
        };
    }, []);

    return {
        isPlaying, simTime, simSpeed,
        speedMultiplier, setSpeedMultiplier,
        handlePlay, handleStop, serialWrite,
        adjustableDevices,
        getCpuSnapshot,
    };
}
