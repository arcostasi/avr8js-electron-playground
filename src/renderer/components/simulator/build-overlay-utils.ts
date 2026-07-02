export type BuildOverlayStatus = 'building' | 'success' | 'error';

export type BuildOverlayStage = 'prepare' | 'chips' | 'compile' | 'save' | 'done' | 'error';

export type BuildLogStream = 'status' | 'stdout' | 'stderr';

export interface BuildLogLine {
    id: number;
    stream: BuildLogStream;
    text: string;
}

export interface BuildOverlayState {
    buildId: string;
    status: BuildOverlayStatus;
    stage: BuildOverlayStage;
    backend: 'local' | 'cloud';
    projectName: string;
    board: string;
    fqbn?: string;
    startedAt: number;
    finishedAt?: number;
    headline: string;
    logs: BuildLogLine[];
    errorSummary?: string;
}

export type BuildLogTone = 'error' | 'warning' | 'memory' | 'status' | 'normal';

export const MAX_BUILD_LOG_LINES = 250;

const STAGE_PROGRESS_MAP: Record<BuildOverlayStage, number> = {
    prepare: 18,
    chips: 38,
    compile: 74,
    save: 92,
    done: 100,
    error: 100,
};

const ANSI_ESCAPE_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*[a-zA-Z]`, 'g');

/**
 * Strips ANSI terminal color/formatting escape sequences from process output.
 */
export function stripAnsiCodes(input: string): string {
    return input.replace(ANSI_ESCAPE_PATTERN, '');
}

/**
 * Splits incoming process output chunks across line breaks without dropping partial lines.
 */
export function splitChunkToLines(
    pending: string,
    chunk: string,
): { lines: string[]; remainder: string } {
    const combined = `${pending}${chunk}`.split('\r\n').join('\n');
    const parts = combined.split('\n');
    const remainder = parts.pop() ?? '';
    return {
        lines: parts.map((line: string) => line.replace(/\r$/, '')),
        remainder,
    };
}

/**
 * Appends new log lines while skipping redundant empty whitespace lines and capping history length.
 */
export function appendBuildLogLines(
    existing: BuildLogLine[],
    nextTexts: string[],
    stream: BuildLogStream,
    nextIdRef: { current: number },
): BuildLogLine[] {
    if (nextTexts.length === 0) return existing;

    const additions: BuildLogLine[] = [];
    for (const raw of nextTexts) {
        const cleaned = stripAnsiCodes(raw).replace(/\r$/, '');
        if (!cleaned.trim()) continue;
        additions.push({
            id: nextIdRef.current++,
            stream,
            text: cleaned,
        });
    }

    if (additions.length === 0) return existing;

    const merged = [...existing, ...additions];
    if (merged.length <= MAX_BUILD_LOG_LINES) {
        return merged;
    }
    return merged.slice(merged.length - MAX_BUILD_LOG_LINES);
}

/**
 * Classifies an output line for semantic color highlighting in the build HUD.
 */
export function classifyBuildLogLine(line: BuildLogLine): BuildLogTone {
    if (line.stream === 'status') {
        return 'status';
    }

    if (
        /\b(fatal error|error):/i.test(line.text)
        || (line.stream === 'stderr' && (/exited with code/i.test(line.text) || /failed/i.test(line.text)))
    ) {
        return 'error';
    }

    if (/\bwarning:/i.test(line.text)) {
        return 'warning';
    }

    if (/^(Sketch uses|Global variables use)\b/i.test(line.text.trim())) {
        return 'memory';
    }

    return 'normal';
}

/**
 * Extracts Arduino CLI memory utilization lines (`Sketch uses...`, `Global variables use...`).
 */
export function extractArduinoMemorySummary(logs: BuildLogLine[]): string[] {
    return logs
        .map((line) => line.text.trim())
        .filter((text) => /^(Sketch uses|Global variables use)\b/i.test(text));
}

/**
 * Maps current build stage + terminal status to a percentage progress value.
 */
export function getBuildStageProgress(
    stage: BuildOverlayStage,
    status: BuildOverlayStatus,
): number {
    if (status === 'success' || status === 'error') {
        return 100;
    }
    return STAGE_PROGRESS_MAP[stage] ?? 18;
}
