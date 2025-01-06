/**
 * useSimulation
 * Manages the AVR simulation lifecycle: start, execute, stop.
 */
import { useRef, useState, useEffect, useCallback } from 'react';
import type { WokwiDiagram } from '../types/wokwi.types';
import type { AVRRunner } from '../../shared/execute';
import {
    createHardwareControllers, updateControllerStates,
} from '../services/simulation-engine';
import type { AdjustableDevice } from '../services/simulation-engine';
import { setupGPIORouting } from '../services/gpio-router';
import type { GPIOCleanup } from '../services/gpio-router';

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
    handlePlay: () => Promise<void>;
    handleStop: () => void;
    serialWrite: (text: string) => void;
    adjustableDevices: AdjustableDevice[];
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
    }, [hex, diagram, onSerialOutput, setIsEditMode]);

    const handleStop = useCallback(() => {
        stopSimulation();
    }, [stopSimulation]);

    const serialWrite = useCallback((text: string) => {
        runnerRef.current?.serialWrite(text);
    }, []);

    return {
        isPlaying, simTime, simSpeed,
        handlePlay, handleStop, serialWrite,
        adjustableDevices,
    };
}
