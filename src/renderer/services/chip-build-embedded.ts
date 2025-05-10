import type { CustomChipSource } from './custom-chips';

export interface ChipBuildResultItem {
    name: string;
    sourceFile: string;
    wasmFile: string;
    success: boolean;
    stdout: string;
    stderr: string;
    wasmBase64?: string;
    error?: string;
}

export interface ChipBuildBatchResult {
    success: boolean;
    results: ChipBuildResultItem[];
}

interface EmbeddedBuildRequest {
    type: 'build-batch';
    chips: CustomChipSource[];
    existingWasmByFile: Record<string, string>;
}

export async function buildCustomChipsEmbedded(
    chips: CustomChipSource[],
    existingWasmByFile: Record<string, string> = {},
): Promise<ChipBuildBatchResult> {
    if (chips.length === 0) {
        return { success: true, results: [] };
    }

    const workerSource = `
function extractEmbeddedWasmBase64(source) {
    const pattern = /^\\s*\\/\\/\\s*@wasm-base64\\s+([A-Za-z0-9+/=]+)\\s*$/m;
    const match = pattern.exec(source || '');
    return (match && match[1]) || null;
}

function decodeBase64(base64) {
    const str = atob(base64);
    const out = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
        out[i] = str.codePointAt(i) || 0;
    }
    return out;
}

function validateWasm(base64) {
    try {
        const bytes = decodeBase64(base64);
        const moduleBytes = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        const mod = new WebAssembly.Module(moduleBytes);
        const exportsList = WebAssembly.Module.exports(mod)
            .filter((entry) => entry.kind === 'function')
            .map((entry) => entry.name)
            .sort((a, b) => a.localeCompare(b));
        return { ok: true, exportsList };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : 'Unknown embedded compiler error' };
    }
}

function formatRuntimeHints(exportsList) {
    const hasInit = exportsList.includes('chip_init');
    const hasTick = exportsList.includes('chip_tick');
    if (hasInit && hasTick) return '';
    const hints = [];
    if (!hasInit) hints.push('missing optional export chip_init');
    if (!hasTick) hints.push('missing optional export chip_tick');
    return '[embedded] ABI hint: ' + hints.join(', ') + '.\\n';
}

globalThis.onmessage = (ev) => {
    const req = ev.data;
    if (!req || req.type !== 'build-batch') return;
    const existingWasmByFile = req.existingWasmByFile || {};

    const results = (req.chips || []).map((chip) => {
        const wasmFile = chip.wasmFile || (chip.name + '.chip.wasm');
        const inlineWasm = extractEmbeddedWasmBase64(chip.sourceContent || '');
        const projectWasm = existingWasmByFile[wasmFile];
        const wasmCandidate = inlineWasm || projectWasm || null;

        if (wasmCandidate) {
            const validation = validateWasm(wasmCandidate);
            if (!validation.ok) {
                return {
                    name: chip.name,
                    sourceFile: chip.sourceFile,
                    wasmFile,
                    success: false,
                    stdout: '',
                    stderr: '[embedded] Invalid WASM artifact for ' + wasmFile + ': ' + validation.error + '\\n',
                    error: 'Embedded artifact validation failed for ' + wasmFile + '.',
                };
            }

            const sourceLabel = inlineWasm
                ? 'inline @wasm-base64 directive'
                : ('project artifact ' + wasmFile);

            return {
                name: chip.name,
                sourceFile: chip.sourceFile,
                wasmFile,
                success: true,
                stdout: '[embedded] Using ' + sourceLabel + '.\\n' + formatRuntimeHints(validation.exportsList),
                stderr: '',
                wasmBase64: wasmCandidate,
            };
        }

        return {
            name: chip.name,
            sourceFile: chip.sourceFile,
            wasmFile,
            success: false,
            stdout: '',
            stderr: '[embedded] No embedded compiler runtime is bundled in this build and no reusable .chip.wasm artifact was found.\\n',
            error: 'Embedded compiler unavailable. Provide // @wasm-base64 <...>, keep a valid <name>.chip.wasm in the project, or switch to External toolchain.',
        };
    });

    const success = results.every((r) => r.success);
    globalThis.postMessage({ success, results });
};`;

    const workerUrl = URL.createObjectURL(new Blob([workerSource], { type: 'application/javascript' }));
    const worker = new Worker(workerUrl);

    const result = await new Promise<ChipBuildBatchResult>((resolve) => {
        const timeout = globalThis.setTimeout(() => {
            resolve({
                success: false,
                results: chips.map((chip) => ({
                    name: chip.name,
                    sourceFile: chip.sourceFile,
                    wasmFile: chip.wasmFile,
                    success: false,
                    stdout: '',
                    stderr: 'Embedded build worker timed out.',
                    error: 'Embedded build timed out.',
                })),
            });
        }, 45_000);

        worker.onmessage = (ev: MessageEvent<ChipBuildBatchResult>) => {
            globalThis.clearTimeout(timeout);
            resolve(ev.data);
        };

        worker.onerror = (ev: ErrorEvent) => {
            globalThis.clearTimeout(timeout);
            resolve({
                success: false,
                results: chips.map((chip) => ({
                    name: chip.name,
                    sourceFile: chip.sourceFile,
                    wasmFile: chip.wasmFile,
                    success: false,
                    stdout: '',
                    stderr: ev.message,
                    error: 'Embedded build worker error.',
                })),
            });
        };

        const request: EmbeddedBuildRequest = {
            type: 'build-batch',
            chips,
            existingWasmByFile,
        };
        worker.postMessage(request);
    });

    worker.terminate();
    URL.revokeObjectURL(workerUrl);
    return result;
}
