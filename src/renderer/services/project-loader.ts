/**
 * Project Loader Service
 * Loads project metadata and file contents through async IPC in the main process.
 */
import { parseDiagram } from '../types/wokwi.types';
import type { WokwiDiagram } from '../types/wokwi.types';
import { markPerf, measureAsync, measureSync } from '../utils/perf';

/* eslint-disable @typescript-eslint/no-require-imports */
const { ipcRenderer } = require('electron') as typeof import('electron');

export interface DiscoveredProject {
    name: string;
    slug: string;
    category: string;
    board: string;
    description: string;
    dirPath: string;
    tags: string[];
}

export interface ProjectFile {
    name: string;
    content: string;
    language: string;
}

export interface LoadedProject {
    name: string;
    board: string;
    files: ProjectFile[];
    hex: string | null;
    diagram: WokwiDiagram | null;
}

export interface ProjectOperationProgress {
    requestId: string;
    kind: 'discover' | 'load';
    phase: 'start' | 'progress' | 'done' | 'cancelled';
    message: string;
    completed?: number;
    total?: number;
    target?: string;
}

export class ProjectOperationAbortedError extends Error {
    constructor(message = 'Project operation cancelled') {
        super(message);
        this.name = 'ProjectOperationAbortedError';
    }
}

type ProjectDescriptor = Pick<DiscoveredProject, 'name' | 'board' | 'dirPath'>;

interface LoadProjectOptions {
    preferCache?: boolean;
    signal?: AbortSignal;
    onProgress?: (progress: ProjectOperationProgress) => void;
}

interface ProjectDiscoveryOptions {
    signal?: AbortSignal;
    onProgress?: (progress: ProjectOperationProgress) => void;
}

interface ProjectDiscoveryStats {
    cacheHits: number;
    cacheMisses: number;
    cacheInvalidations: number;
    cacheEvictions: number;
    projectCount: number;
}

function logProjectDiscoveryStats(scope: string, stats?: ProjectDiscoveryStats): void {
    if (!stats) return;

    markPerf(
        `project-discovery-cache:${scope}`,
        `hits=${stats.cacheHits},misses=${stats.cacheMisses},invalidations=${stats.cacheInvalidations},evictions=${stats.cacheEvictions},projects=${stats.projectCount}`,
    );
}

const projectLoadCache = new Map<string, Promise<LoadedProject>>();
const progressSubscribers = new Map<string, (progress: ProjectOperationProgress) => void>();
let progressListenerRegistered = false;

function registerProgressListener(): void {
    if (progressListenerRegistered) return;

    ipcRenderer.on('project:progress', (_event: unknown, progress: ProjectOperationProgress) => {
        const subscriber = progressSubscribers.get(progress.requestId);
        subscriber?.(progress);
        if (progress.phase === 'done' || progress.phase === 'cancelled') {
            progressSubscribers.delete(progress.requestId);
        }
    });
    progressListenerRegistered = true;
}

function createRequestId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createAbortError(): ProjectOperationAbortedError {
    return new ProjectOperationAbortedError();
}

function throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
        throw createAbortError();
    }
}

async function cancelProjectOperation(requestId: string): Promise<void> {
    try {
        await ipcRenderer.invoke('project:cancel', { requestId });
    } catch {
        // ignore cancellation transport failures
    }
}

async function invokeCancellableProjectOperation<TResult>(
    channel: 'project:discover' | 'project:load',
    payload: Record<string, unknown>,
    options: { signal?: AbortSignal; onProgress?: (progress: ProjectOperationProgress) => void },
): Promise<TResult & { canceled?: boolean }> {
    throwIfAborted(options.signal);
    registerProgressListener();

    const requestId = createRequestId(channel.replace(':', '-'));
    if (options.onProgress) {
        progressSubscribers.set(requestId, options.onProgress);
    }

    const abortHandler = () => {
        void cancelProjectOperation(requestId);
    };
    options.signal?.addEventListener('abort', abortHandler, { once: true });

    try {
        const result = await ipcRenderer.invoke(channel, { ...payload, requestId }) as TResult & { canceled?: boolean };
        throwIfAborted(options.signal);
        if (result.canceled) {
            throw createAbortError();
        }
        return result;
    } finally {
        options.signal?.removeEventListener('abort', abortHandler);
        progressSubscribers.delete(requestId);
    }
}

function projectCacheKey(projectInfo: Pick<DiscoveredProject, 'dirPath'>): string {
    return projectInfo.dirPath.trim().split('\\').join('/').toLowerCase();
}

function cloneLoadedProject(project: LoadedProject): LoadedProject {
    return {
        ...project,
        files: project.files.map((file) => ({ ...file })),
        diagram: project.diagram
            ? structuredClone(project.diagram)
            : null,
    };
}

async function fetchProjectFromMainCancellable(
    projectInfo: ProjectDescriptor,
    options: Pick<LoadProjectOptions, 'signal' | 'onProgress'>,
): Promise<LoadedProject> {
    const result = await invokeCancellableProjectOperation<{
        ok?: boolean;
        success: boolean;
        loaded?: { name: string; board: string; files: ProjectFile[]; hex: string | null };
        error?: string;
    }>('project:load', projectInfo, options);

    if (!(result.ok ?? result.success) || !result.loaded) {
        if (result.error) console.error(result.error);
        return {
            name: projectInfo.name,
            board: projectInfo.board,
            files: [],
            hex: null,
            diagram: null,
        };
    }

    const { name, board, files, hex } = result.loaded;
    let diagram: WokwiDiagram | null = null;
    const normalizedFiles = files.map((file) => {
        if (file.name !== 'diagram.json') return file;
        try {
            diagram = measureSync('diagram-parse', () => parseDiagram(JSON.parse(file.content)), file.name);
            return {
                ...file,
                content: JSON.stringify(diagram, null, 2),
            };
        } catch (err) {
            console.error('Failed to parse diagram.json', err);
            return file;
        }
    });

    return { name, board, files: normalizedFiles, hex, diagram };
}

function loadProjectFresh(projectInfo: ProjectDescriptor, options: LoadProjectOptions = {}): Promise<LoadedProject> {
    const cacheKey = projectCacheKey(projectInfo);
    const pending = fetchProjectFromMainCancellable(projectInfo, options)
        .then((loaded) => cloneLoadedProject(loaded))
        .catch((error) => {
            projectLoadCache.delete(cacheKey);
            throw error;
        });
    projectLoadCache.set(cacheKey, pending);
    return pending;
}

export function preloadProject(projectInfo: ProjectDescriptor): void {
    const cacheKey = projectCacheKey(projectInfo);
    if (projectLoadCache.has(cacheKey)) return;

    void measureAsync('project-preload', async () => {
        await loadProject(projectInfo);
    }, projectInfo.name);
}

/**
 * Opens a native folder picker so user can load one project folder
 * or a parent folder that contains multiple projects.
 */
export async function pickProjectsDirectory(): Promise<string | null> {
    const result = await ipcRenderer.invoke('dialog-open', {
        title: 'Open Projects Folder',
        properties: ['openDirectory'],
    });

    if (!result || result.canceled || !result.filePaths?.length) return null;
    return result.filePaths[0] as string;
}

export async function getAppRoot(): Promise<string> {
    try {
        const root = await ipcRenderer.invoke('app:get-root');
        return typeof root === 'string' ? root : process.cwd();
    } catch {
        return process.cwd();
    }
}

/**
 * Discovers projects by scanning the examples directory for subfolders containing metadata.json.
 * Supports categorization (e.g., beginner, advanced) or flat structure.
 */
export async function discoverProjects(options: ProjectDiscoveryOptions = {}): Promise<DiscoveredProject[]> {
    return measureAsync('project-discovery:builtin-root', async () => {
        const result = await invokeCancellableProjectOperation<{
            ok?: boolean;
            success: boolean;
            projects?: DiscoveredProject[];
            stats?: ProjectDiscoveryStats;
            error?: string;
        }>('project:discover', {
            builtIn: true,
            defaultCategory: 'uncategorized',
        }, options);

        logProjectDiscoveryStats('builtin-root', result.stats);

        if (!(result.ok ?? result.success)) {
            if (result.error) console.error(result.error);
            return [];
        }

        return result.projects ?? [];
    });
}

/**
 * Discovers projects from any root folder path.
 */
export async function discoverProjectsFromRoot(
    rootDir: string,
    defaultCategory = 'external',
    options: ProjectDiscoveryOptions = {},
): Promise<DiscoveredProject[]> {
    return measureAsync('project-discovery:scan-root', async () => {
        const result = await invokeCancellableProjectOperation<{
            ok?: boolean;
            success: boolean;
            projects?: DiscoveredProject[];
            stats?: ProjectDiscoveryStats;
            error?: string;
        }>('project:discover', {
            rootDir,
            defaultCategory,
            builtIn: false,
        }, options);

        logProjectDiscoveryStats('external-root', result.stats);

        if (!(result.ok ?? result.success)) {
            if (result.error) console.error(result.error);
            return [];
        }

        return result.projects ?? [];
    }, rootDir);
}

export async function loadProject(
    projectInfo: ProjectDescriptor,
    options: LoadProjectOptions = {},
): Promise<LoadedProject> {
    throwIfAborted(options.signal);
    const cacheKey = projectCacheKey(projectInfo);
    const preferCache = options.preferCache !== false;

    if (preferCache && projectLoadCache.has(cacheKey)) {
        const cachedProject = projectLoadCache.get(cacheKey);
        if (cachedProject !== undefined) {
            markPerf('project-load-cache:hit', projectInfo.dirPath);
            options.onProgress?.({
                requestId: createRequestId('project-load-cache-hit'),
                kind: 'load',
                phase: 'done',
                message: `Loaded ${projectInfo.name} from cache`,
                completed: 1,
                total: 1,
                target: projectInfo.dirPath,
            });
            return cloneLoadedProject(await cachedProject);
        }
    }

    return cloneLoadedProject(await loadProjectFresh(projectInfo, options));
}

export function isProjectOperationAborted(error: unknown): error is ProjectOperationAbortedError {
    return error instanceof ProjectOperationAbortedError
        || (error instanceof Error && error.name === 'ProjectOperationAbortedError');
}
