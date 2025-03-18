import * as path from 'node:path';
import * as fs from 'node:fs/promises';

export interface ProjectDiscoveryItem {
  name: string;
  slug: string;
  category: string;
  board: string;
  description: string;
  dirPath: string;
  tags: string[];
}

export interface ProjectFileRecord {
  name: string;
  content: string;
  language: string;
}

export interface LoadedProjectPayload {
  name: string;
  board: string;
  files: ProjectFileRecord[];
  hex: string | null;
}

export interface ProjectArchive {
  format: 'avr8js-project';
  version: 1;
  name: string;
  board: string;
  files: ProjectFileRecord[];
  exportedAt: string;
}

interface CachedProjectMetadataEntry {
  signature: string;
  project: ProjectDiscoveryItem;
}

interface ProjectDiscoveryRootCache {
  projectsByDir: Record<string, CachedProjectMetadataEntry>;
  updatedAt: number;
}

interface ProjectDiscoveryIndex {
  version: 1;
  roots: Record<string, ProjectDiscoveryRootCache>;
}

export interface ProjectDiscoveryStats {
  cacheHits: number;
  cacheMisses: number;
  cacheInvalidations: number;
  cacheEvictions: number;
  projectCount: number;
}

export interface ProjectIoProgress {
  kind: 'discover' | 'load';
  phase: 'start' | 'progress' | 'done' | 'cancelled';
  message: string;
  completed?: number;
  total?: number;
  target?: string;
}

export interface ProjectIoOperationOptions {
  isCancelled?: () => boolean;
  onProgress?: (progress: ProjectIoProgress) => void;
}

export class ProjectIoCancelledError extends Error {
  constructor(message = 'Project operation cancelled') {
    super(message);
    this.name = 'ProjectIoCancelledError';
  }
}

const PROJECT_DISCOVERY_INDEX_VERSION = 1;
const PROJECT_DISCOVERY_INDEX_FILE = 'project-discovery-index.json';

function detectLanguage(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case '.ino':
    case '.cpp':
    case '.c':
    case '.h':
      return 'cpp';
    case '.json':
      return 'json';
    default:
      return 'plaintext';
  }
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function tryReadJson<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function tryStat(targetPath: string): Promise<import('node:fs').Stats | null> {
  try {
    return await fs.stat(targetPath);
  } catch {
    return null;
  }
}

function emptyProjectDiscoveryIndex(): ProjectDiscoveryIndex {
  return {
    version: PROJECT_DISCOVERY_INDEX_VERSION,
    roots: {},
  };
}

function rootCacheKey(rootDir: string, defaultCategory: string): string {
  return `${path.normalize(rootDir).toLowerCase()}::${defaultCategory}`;
}

function buildProjectFromMetadata(
  dir: string,
  category: string,
  meta: Partial<ProjectDiscoveryItem>,
): ProjectDiscoveryItem {
  return {
    name: meta.name || path.basename(dir),
    slug: meta.slug || path.basename(dir),
    category: meta.category || category,
    board: meta.board || 'uno',
    description: meta.description || '',
    dirPath: dir,
    tags: meta.tags || [],
  };
}

function buildDiagramFallbackProject(
  dir: string,
  category: string,
  defaultCategory: string,
): ProjectDiscoveryItem {
  return {
    name: path.basename(dir),
    slug: path.basename(dir),
    category: category || defaultCategory,
    board: 'uno',
    description: '',
    dirPath: dir,
    tags: [],
  };
}

function sortProjectFiles(files: ProjectFileRecord[]): ProjectFileRecord[] {
  return [...files].sort((a, b) => {
    const order = (nameStr: string) => {
      if (nameStr === 'diagram.json') return 0;
      if (nameStr.endsWith('.ino')) return 1;
      return 2;
    };
    return order(a.name) - order(b.name);
  });
}

function isProjectFileRecord(value: unknown): value is ProjectFileRecord {
  if (!value || typeof value !== 'object') return false;

  const candidate = value as Partial<ProjectFileRecord>;
  return typeof candidate.name === 'string'
    && typeof candidate.content === 'string'
    && typeof candidate.language === 'string';
}

export function parseProjectArchive(raw: string, fallbackFilePath: string): {
  name: string;
  board: string;
  files: ProjectFileRecord[];
} {
  const parsed = JSON.parse(raw) as Partial<ProjectArchive>;
  if (parsed.format !== 'avr8js-project' || !Array.isArray(parsed.files) || parsed.files.length === 0) {
    throw new Error('Invalid project archive format');
  }

  const files = parsed.files.filter(isProjectFileRecord);
  if (files.length !== parsed.files.length) {
    throw new Error('Invalid project archive files');
  }

  return {
    name: parsed.name || path.basename(fallbackFilePath, path.extname(fallbackFilePath)),
    board: parsed.board || 'uno',
    files,
  };
}

export function createProjectIoService(options: { userDataPath: string }) {
  let projectDiscoveryIndexPromise: Promise<ProjectDiscoveryIndex> | null = null;
  let projectDiscoveryIndexWriteChain = Promise.resolve();

  function getProjectDiscoveryIndexPath(): string {
    return path.join(options.userDataPath, PROJECT_DISCOVERY_INDEX_FILE);
  }

  async function loadProjectDiscoveryIndex(): Promise<ProjectDiscoveryIndex> {
    projectDiscoveryIndexPromise ??= (async () => {
      const indexPath = getProjectDiscoveryIndexPath();
      const parsed = await tryReadJson<ProjectDiscoveryIndex>(indexPath);
      if (parsed?.version !== PROJECT_DISCOVERY_INDEX_VERSION || typeof parsed?.roots !== 'object') {
        return emptyProjectDiscoveryIndex();
      }
      return parsed;
    })();

    return projectDiscoveryIndexPromise;
  }

  async function saveProjectDiscoveryIndex(index: ProjectDiscoveryIndex): Promise<void> {
    projectDiscoveryIndexPromise = Promise.resolve(index);
    const indexPath = getProjectDiscoveryIndexPath();
    projectDiscoveryIndexWriteChain = projectDiscoveryIndexWriteChain.then(async () => {
      await fs.mkdir(path.dirname(indexPath), { recursive: true });
      await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8');
    }).catch(() => {
      /* ignore prior write failure and continue */
    });
    await projectDiscoveryIndexWriteChain;
  }

  async function resolveCachedProjectMetadata(params: {
    dir: string;
    category: string;
    defaultCategory: string;
    rootCache: ProjectDiscoveryRootCache;
  }): Promise<{
    project: ProjectDiscoveryItem | null;
    changed: boolean;
    cacheStatus: 'hit' | 'miss' | 'invalidated' | 'none';
  }> {
    const { dir, category, defaultCategory, rootCache } = params;
    const normalizedDir = path.normalize(dir).toLowerCase();
    const cached = rootCache.projectsByDir[normalizedDir];

    const metaPath = path.join(dir, 'metadata.json');
    const metaStat = await tryStat(metaPath);
    if (metaStat) {
      const signature = `meta:${metaStat.mtimeMs}:${metaStat.size}:${category}`;
      if (cached?.signature === signature) {
        return { project: cached.project, changed: false, cacheStatus: 'hit' };
      }

      const meta = await tryReadJson<Partial<ProjectDiscoveryItem>>(metaPath);
      if (!meta) {
        const hadCachedEntry = Boolean(cached);
        delete rootCache.projectsByDir[normalizedDir];
        return {
          project: null,
          changed: hadCachedEntry,
          cacheStatus: hadCachedEntry ? 'invalidated' : 'none',
        };
      }

      const project = buildProjectFromMetadata(dir, category, meta);
      rootCache.projectsByDir[normalizedDir] = { signature, project };
      return { project, changed: true, cacheStatus: 'miss' };
    }

    const diagramPath = path.join(dir, 'diagram.json');
    const diagramStat = await tryStat(diagramPath);
    if (!diagramStat) {
      const hadCachedEntry = Boolean(cached);
      delete rootCache.projectsByDir[normalizedDir];
      return {
        project: null,
        changed: hadCachedEntry,
        cacheStatus: hadCachedEntry ? 'invalidated' : 'none',
      };
    }

    const fallbackCategory = category || defaultCategory;
    const signature = `diagram:${diagramStat.mtimeMs}:${diagramStat.size}:${fallbackCategory}`;
    if (cached?.signature === signature) {
      return { project: cached.project, changed: false, cacheStatus: 'hit' };
    }

    const project = buildDiagramFallbackProject(dir, category, defaultCategory);
    rootCache.projectsByDir[normalizedDir] = { signature, project };
    return { project, changed: true, cacheStatus: 'miss' };
  }

  async function discoverProjectsFromRoot(
    rootDir: string,
    defaultCategory = 'external',
    operationOptions?: ProjectIoOperationOptions,
  ): Promise<{
    projects: ProjectDiscoveryItem[];
    stats: ProjectDiscoveryStats;
  }> {
    emitProgress(operationOptions, {
      kind: 'discover',
      phase: 'start',
      message: `Scanning projects in ${rootDir}`,
      target: rootDir,
    });

    if (!(await pathExists(rootDir))) {
      return {
        projects: [],
        stats: {
          cacheHits: 0,
          cacheMisses: 0,
          cacheInvalidations: 0,
          cacheEvictions: 0,
          projectCount: 0,
        },
      };
    }

    const discoveryIndex = await loadProjectDiscoveryIndex();
    const cacheKey = rootCacheKey(rootDir, defaultCategory);
    const hadRootCache = Boolean(discoveryIndex.roots[cacheKey]);
    const rootCache = discoveryIndex.roots[cacheKey] ?? { projectsByDir: {}, updatedAt: 0 };
    discoveryIndex.roots[cacheKey] = rootCache;

    const projects: ProjectDiscoveryItem[] = [];
    const seen = new Set<string>();
    const visitedDirs = new Set<string>();
    let changed = !hadRootCache;
    const stats: ProjectDiscoveryStats = {
      cacheHits: 0,
      cacheMisses: 0,
      cacheInvalidations: 0,
      cacheEvictions: 0,
      projectCount: 0,
    };
    let completed = 0;

    const pushProject = async (dir: string, category: string) => {
      throwIfCancelled(operationOptions, 'discover');
      const normalized = path.normalize(dir).toLowerCase();
      visitedDirs.add(normalized);
      if (seen.has(normalized)) return;

      const result = await resolveCachedProjectMetadata({
        dir,
        category,
        defaultCategory,
        rootCache,
      });
      changed = changed || result.changed;
      if (result.cacheStatus === 'hit') stats.cacheHits += 1;
      if (result.cacheStatus === 'miss') stats.cacheMisses += 1;
      if (result.cacheStatus === 'invalidated') stats.cacheInvalidations += 1;
      if (!result.project) return;

      projects.push(result.project);
      seen.add(normalized);
      completed += 1;
      emitProgress(operationOptions, {
        kind: 'discover',
        phase: 'progress',
        message: `Indexed ${result.project.name}`,
        completed,
        target: result.project.dirPath,
      });
    };

    await pushProject(rootDir, defaultCategory);

    const entries = await fs.readdir(rootDir, { withFileTypes: true });
    for (const entry of entries) {
      throwIfCancelled(operationOptions, 'discover');
      if (!entry.isDirectory()) continue;

      const entryPath = path.join(rootDir, entry.name);
      await pushProject(entryPath, defaultCategory);

      const subEntries = await fs.readdir(entryPath, { withFileTypes: true });
      for (const sub of subEntries) {
        throwIfCancelled(operationOptions, 'discover');
        if (sub.isDirectory()) {
          await pushProject(path.join(entryPath, sub.name), entry.name);
        }
      }
    }

    for (const cachedDir of Object.keys(rootCache.projectsByDir)) {
      if (!visitedDirs.has(cachedDir)) {
        delete rootCache.projectsByDir[cachedDir];
        changed = true;
        stats.cacheEvictions += 1;
      }
    }

    if (changed) {
      rootCache.updatedAt = Date.now();
      await saveProjectDiscoveryIndex(discoveryIndex);
    }

    stats.projectCount = projects.length;
    emitProgress(operationOptions, {
      kind: 'discover',
      phase: 'done',
      message: `Indexed ${projects.length} project(s)`,
      completed: projects.length,
      total: projects.length,
      target: rootDir,
    });
    return { projects, stats };
  }

  async function loadProjectFromDisk(
    project: Pick<ProjectDiscoveryItem, 'name' | 'board' | 'dirPath'>,
    operationOptions?: ProjectIoOperationOptions,
  ): Promise<LoadedProjectPayload> {
    const { name, board, dirPath } = project;
    const files: ProjectFileRecord[] = [];
    let hex: string | null = null;

    emitProgress(operationOptions, {
      kind: 'load',
      phase: 'start',
      message: `Loading ${name}`,
      target: dirPath,
    });

    if (!(await pathExists(dirPath))) {
      return { name, board, files, hex };
    }

    const dirEntries = await fs.readdir(dirPath, { withFileTypes: true });
    const fileEntries = dirEntries.filter((entry) => entry.isFile());
    let completed = 0;
    for (const entry of fileEntries) {
      throwIfCancelled(operationOptions, 'load');

      const ext = path.extname(entry.name).toLowerCase();
      const fullPath = path.join(dirPath, entry.name);

      if (ext === '.hex') {
        hex = await fs.readFile(fullPath, 'utf-8');
        completed += 1;
        emitProgress(operationOptions, {
          kind: 'load',
          phase: 'progress',
          message: `Read ${entry.name}`,
          completed,
          total: fileEntries.length,
          target: fullPath,
        });
        continue;
      }

      if (['.ino', '.cpp', '.c', '.h', '.json'].includes(ext) && entry.name !== 'metadata.json') {
        const content = await fs.readFile(fullPath, 'utf-8');
        files.push({
          name: entry.name,
          content,
          language: detectLanguage(entry.name),
        });
      }

      completed += 1;
      emitProgress(operationOptions, {
        kind: 'load',
        phase: 'progress',
        message: `Read ${entry.name}`,
        completed,
        total: fileEntries.length,
        target: fullPath,
      });
    }

    emitProgress(operationOptions, {
      kind: 'load',
      phase: 'done',
      message: `Loaded ${name}`,
      completed: fileEntries.length,
      total: fileEntries.length,
      target: dirPath,
    });

    return { name, board, files: sortProjectFiles(files), hex };
  }

  return {
    discoverProjectsFromRoot,
    loadProjectFromDisk,
  };
}

function emitProgress(options: ProjectIoOperationOptions | undefined, progress: ProjectIoProgress): void {
  options?.onProgress?.(progress);
}

function throwIfCancelled(options: ProjectIoOperationOptions | undefined, kind: ProjectIoProgress['kind']): void {
  if (!options?.isCancelled?.()) return;

  emitProgress(options, {
    kind,
    phase: 'cancelled',
    message: 'Project operation cancelled.',
  });
  throw new ProjectIoCancelledError();
}