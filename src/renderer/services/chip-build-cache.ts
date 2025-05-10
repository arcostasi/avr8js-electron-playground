import type { CustomChipSource } from './custom-chips';
import { readPersistedJson, writePersistedJson } from './renderer-persist';
import { markPerf } from '../utils/perf';

export interface ChipBuildCacheContext {
    backend: string;
    commandSignature: string;
}

interface CacheEntry {
    hash: string;
    wasmBase64: string;
    timestamp: number;
}

interface PersistedCache {
    entries: Record<string, CacheEntry>;
}

const CACHE_KEY = 'avr8js-chip-build-cache-v1';
const MAX_ENTRIES = 200;
const CACHE_SCOPE = 'chip-build-cache';
const CACHE_FILE = 'entries-v1.json';
let cacheLoadPromise: Promise<PersistedCache> | null = null;
let cacheWriteChain = Promise.resolve();
let chipCacheLimitWarningIssued = false;

function fnv1aHash(input: string): string {
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
        hash ^= input.codePointAt(i) ?? 0;
        hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

async function readCache(): Promise<PersistedCache> {
    cacheLoadPromise ??= (async () => {
        const persisted = await readPersistedJson<PersistedCache>(CACHE_SCOPE, CACHE_FILE, { entries: {} });
        if (!persisted || typeof persisted !== 'object' || !persisted.entries) {
            return { entries: {} };
        }
        return persisted;
    })();

    return cacheLoadPromise;
}

async function writeCache(cache: PersistedCache): Promise<void> {
    cacheLoadPromise = Promise.resolve(cache);
    cacheWriteChain = cacheWriteChain.then(async () => {
        await writePersistedJson(CACHE_SCOPE, CACHE_FILE, cache);
        try {
            localStorage.removeItem(CACHE_KEY);
        } catch {
            // ignore migration cleanup failures
        }
    });
    await cacheWriteChain;
}

function cacheKey(chip: CustomChipSource, ctx: ChipBuildCacheContext): string {
    return `${ctx.backend}:${chip.name}`;
}

export function computeChipBuildHash(
    chip: CustomChipSource,
    ctx: ChipBuildCacheContext,
): string {
    const payload = JSON.stringify({
        backend: ctx.backend,
        commandSignature: ctx.commandSignature,
        name: chip.name,
        sourceFile: chip.sourceFile,
        sourceContent: chip.sourceContent,
        manifestFile: chip.manifestFile,
        manifestContent: chip.manifestContent,
        wasmFile: chip.wasmFile,
    });
    return fnv1aHash(payload);
}

export function readCachedChipArtifact(
    chip: CustomChipSource,
    ctx: ChipBuildCacheContext,
    hash: string,
): Promise<{ wasmBase64: string } | null> {
    return readCache().then((cache) => {
    const entry = cache.entries[cacheKey(chip, ctx)];
    if (!entry) return null;
    if (entry.hash !== hash) return null;
    return { wasmBase64: entry.wasmBase64 };
    });
}

export function writeCachedChipArtifact(
    chip: CustomChipSource,
    ctx: ChipBuildCacheContext,
    hash: string,
    wasmBase64: string,
): Promise<void> {
    return readCache().then(async (cache) => {
        cache.entries[cacheKey(chip, ctx)] = {
            hash,
            wasmBase64,
            timestamp: Date.now(),
        };

        const keys = Object.keys(cache.entries);
        if (keys.length > MAX_ENTRIES) {
            const sortedKeys = [...keys].sort((a, b) => (cache.entries[a].timestamp - cache.entries[b].timestamp));
            const evictedCount = keys.length - MAX_ENTRIES;
            sortedKeys
                .slice(0, evictedCount)
                .forEach((k) => { delete cache.entries[k]; });

            if (!chipCacheLimitWarningIssued) {
                chipCacheLimitWarningIssued = true;
                const detail = `entries=${keys.length},limit=${MAX_ENTRIES},evicted=${evictedCount}`;
                console.warn(`[chip-cache] cache limit reached (${detail})`);
                markPerf('warning:chip-build-cache-limit', detail);
            }
        }

        await writeCache(cache);
    });
}
