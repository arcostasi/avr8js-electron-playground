import { describe, expect, it } from 'vitest';
import {
    appendBuildLogLines,
    classifyBuildLogLine,
    extractArduinoMemorySummary,
    getBuildStageProgress,
    MAX_BUILD_LOG_LINES,
    splitChunkToLines,
    stripAnsiCodes,
    type BuildLogLine,
} from './build-overlay-utils';

describe('build-overlay-utils', () => {
    it('splits streaming chunks cleanly across partial lines and CRLF boundaries', () => {
        const first = splitChunkToLines('', 'Compiling sketch...\r\nSketch ');
        expect(first.lines).toEqual(['Compiling sketch...']);
        expect(first.remainder).toBe('Sketch ');

        const second = splitChunkToLines(first.remainder, 'uses 924 bytes (2%) of program storage space.\nDone');
        expect(second.lines).toEqual(['Sketch uses 924 bytes (2%) of program storage space.']);
        expect(second.remainder).toBe('Done');
    });

    it('appends non-empty lines with monotonic IDs and enforces the log cap', () => {
        const nextIdRef = { current: 1 };
        const entries = Array.from({ length: MAX_BUILD_LOG_LINES + 15 }, (_, index) => `Line ${index + 1}`);
        const result = appendBuildLogLines([], ['', '   ', ...entries], 'stdout', nextIdRef);

        expect(result).toHaveLength(MAX_BUILD_LOG_LINES);
        expect(result[0]?.text).toBe('Line 16');
        expect(result[result.length - 1]?.text).toBe(`Line ${MAX_BUILD_LOG_LINES + 15}`);
        expect(nextIdRef.current).toBe(MAX_BUILD_LOG_LINES + 16);
    });

    it('classifies status, warnings, errors, and Arduino memory lines accurately', () => {
        expect(classifyBuildLogLine({ id: 1, stream: 'status', text: 'Preparing...' })).toBe('status');
        expect(classifyBuildLogLine({ id: 2, stream: 'stderr', text: "sketch.ino:4:1: error: 'x' was not declared" })).toBe('error');
        expect(classifyBuildLogLine({ id: 3, stream: 'stderr', text: 'arduino-cli exited with code 1' })).toBe('error');
        expect(classifyBuildLogLine({ id: 4, stream: 'stderr', text: 'sketch.ino:2:9: warning: unused variable' })).toBe('warning');
        expect(classifyBuildLogLine({ id: 5, stream: 'stdout', text: 'Sketch uses 924 bytes (2%) of program storage space.' })).toBe('memory');
        expect(classifyBuildLogLine({ id: 6, stream: 'stdout', text: 'Using library Wire at version 1.0' })).toBe('normal');
    });

    it('extracts Arduino memory summary lines and computes stage progress', () => {
        const logs: BuildLogLine[] = [
            { id: 1, stream: 'status', text: 'Running arduino-cli compile...' },
            { id: 2, stream: 'stdout', text: 'Sketch uses 924 bytes (2%) of program storage space. Maximum is 32256 bytes.' },
            { id: 3, stream: 'stdout', text: 'Global variables use 9 bytes (0%) of dynamic memory, leaving 2039 bytes for local variables.' },
        ];

        expect(extractArduinoMemorySummary(logs)).toHaveLength(2);
        expect(getBuildStageProgress('prepare', 'building')).toBe(18);
        expect(getBuildStageProgress('compile', 'building')).toBe(74);
        expect(getBuildStageProgress('compile', 'error')).toBe(100);
        expect(getBuildStageProgress('done', 'success')).toBe(100);
    });

    it('strips ANSI color escape sequences from compiler output lines', () => {
        const esc = String.fromCharCode(27);
        const raw = `${esc}[92mUsed platform${esc}[0m ${esc}[93marduino:avr${esc}[0m`;
        expect(stripAnsiCodes(raw)).toBe('Used platform arduino:avr');

        const nextIdRef = { current: 1 };
        const lines = appendBuildLogLines([], [raw], 'stdout', nextIdRef);
        expect(lines).toHaveLength(1);
        expect(lines[0]?.text).toBe('Used platform arduino:avr');
    });
});
