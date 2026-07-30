import { app, BrowserWindow, ipcMain, nativeTheme, dialog, screen } from "electron";
import type { WebContents } from 'electron';
import { IpcChannelInterface } from "../electron/ipc-channel";
import { SystemInfoChannel } from "../electron/info-channel";

import { setupTitlebar, attachTitlebarToWindow } from 'custom-electron-titlebar/main';
import {
  createProjectIoService,
  parseProjectArchive,
  ProjectIoCancelledError,
  PROJECT_BUILD_DIR,
  saveProjectBuildArtifacts,
} from './project-io';
import type {
  ProjectArchive,
  ProjectBuildChipArtifactInput,
  ProjectFileRecord,
  ProjectIoProgress,
} from './project-io';

import * as path from "node:path";
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as os from 'node:os';
import * as cp from 'node:child_process';
import { registerCanBridgeIpc } from './can-bridge-manager';
import { registerCustomViewIpc } from './custom-view-ipc';

process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown error';
  }
}

function startedAt(): number {
  return performance.now();
}

function okResponse<T extends object>(startTime: number, payload: T, extras: { cacheHit?: boolean } = {}) {
  return {
    ok: true,
    success: true,
    durationMs: performance.now() - startTime,
    cacheHit: extras.cacheHit,
    ...payload,
  };
}

function errorResponse<T extends object>(startTime: number, payload: T, error: unknown, extras: { cacheHit?: boolean } = {}) {
  return {
    ok: false,
    success: false,
    durationMs: performance.now() - startTime,
    cacheHit: extras.cacheHit,
    error: toErrorMessage(error),
    ...payload,
  };
}

const RENDERER_STORAGE_DIR = 'renderer-storage';
const cancellableProjectOperations = new Map<string, { cancelled: boolean }>();

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function resolvePathWithin(baseDir: string, targetPath: string): string {
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(resolvedBase, targetPath);
  if (resolvedTarget !== resolvedBase && !resolvedTarget.startsWith(resolvedBase + path.sep)) {
    throw new Error(`Path "${targetPath}" escapes base directory.`);
  }
  return resolvedTarget;
}

function sanitizeStorageSegment(value: string): string {
  const normalized = value
    .split(/[^a-zA-Z0-9._-]+/g)
    .filter(Boolean)
    .join('-')
    .slice(0, 120);
  return normalized || 'default';
}

function getRendererStoragePath(scope: string, name: string): string {
  const scopeSegments = scope
    .split('/')
    .map((segment) => sanitizeStorageSegment(segment))
    .filter(Boolean);
  return path.join(app.getPath('userData'), RENDERER_STORAGE_DIR, ...scopeSegments, sanitizeStorageSegment(name));
}

function registerProjectOperation(requestId?: string | null): { isCancelled: () => boolean; dispose: () => void } {
  if (!requestId) {
    return {
      isCancelled: () => false,
      dispose: () => undefined,
    };
  }

  const state = { cancelled: false };
  cancellableProjectOperations.set(requestId, state);
  return {
    isCancelled: () => state.cancelled,
    dispose: () => {
      cancellableProjectOperations.delete(requestId);
    },
  };
}

function forwardProjectProgress(
  sender: WebContents,
  requestId: string | null | undefined,
  progress: ProjectIoProgress,
): void {
  if (!requestId) return;
  sender.send('project:progress', {
    requestId,
    ...progress,
  });
}

// Setup the titlebar main process
setupTitlebar();

const MIN_WINDOW_WIDTH = 640;
const MIN_WINDOW_HEIGHT = 480;
const DEFAULT_WINDOW_WIDTH = 1440;
const DEFAULT_WINDOW_HEIGHT = 900;
const WINDOW_STATE_SCOPE = 'window';
const WINDOW_STATE_FILE = 'window-state.json';

interface PersistedWindowState {
  bounds: Electron.Rectangle;
  isMaximized: boolean;
  isFullScreen: boolean;
}

class Main {

  private mainWindow: BrowserWindow | null = null;
  private ipcRegistered = false;
  private wasMaximizedBeforeFullScreen = false;
  private boundsBeforeFullScreen: Electron.Rectangle | null = null;
  private lastNormalBounds: Electron.Rectangle | null = null;
  private windowStateSaveTimer: ReturnType<typeof setTimeout> | null = null;

  private getWindowStateFilePath(): string {
    return getRendererStoragePath(WINDOW_STATE_SCOPE, WINDOW_STATE_FILE);
  }

  private readPersistedWindowState(): PersistedWindowState | null {
    try {
      const raw = fsSync.readFileSync(this.getWindowStateFilePath(), 'utf-8');
      const parsed = JSON.parse(raw) as Partial<PersistedWindowState>;
      const bounds = parsed?.bounds;
      if (
        !bounds
        || typeof bounds.x !== 'number' || !Number.isFinite(bounds.x)
        || typeof bounds.y !== 'number' || !Number.isFinite(bounds.y)
        || typeof bounds.width !== 'number' || !Number.isFinite(bounds.width) || bounds.width <= 0
        || typeof bounds.height !== 'number' || !Number.isFinite(bounds.height) || bounds.height <= 0
      ) {
        return null;
      }

      return {
        bounds: this.clampBoundsToWorkArea({
          x: Math.round(bounds.x),
          y: Math.round(bounds.y),
          width: Math.round(bounds.width),
          height: Math.round(bounds.height),
        }),
        isMaximized: Boolean(parsed.isMaximized),
        isFullScreen: Boolean(parsed.isFullScreen),
      };
    } catch {
      return null;
    }
  }

  private buildCurrentWindowState(): PersistedWindowState | null {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return null;

    if (!this.mainWindow.isMaximized() && !this.mainWindow.isFullScreen() && !this.mainWindow.isMinimized()) {
      this.lastNormalBounds = this.mainWindow.getBounds();
    }

    const normalBounds = this.lastNormalBounds
      ?? this.boundsBeforeFullScreen
      ?? (typeof this.mainWindow.getNormalBounds === 'function'
        ? this.mainWindow.getNormalBounds()
        : this.mainWindow.getBounds());

    return {
      bounds: this.clampBoundsToWorkArea(normalBounds),
      isMaximized: this.mainWindow.isMaximized(),
      isFullScreen: this.mainWindow.isFullScreen(),
    };
  }

  private saveWindowStateSync(): void {
    if (this.windowStateSaveTimer !== null) {
      clearTimeout(this.windowStateSaveTimer);
      this.windowStateSaveTimer = null;
    }

    const state = this.buildCurrentWindowState();
    if (!state) return;

    try {
      const filePath = this.getWindowStateFilePath();
      fsSync.mkdirSync(path.dirname(filePath), { recursive: true });
      fsSync.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf-8');
    } catch (error) {
      console.warn('[window-state] Failed to persist window state:', error);
    }
  }

  private scheduleSaveWindowState(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
    if (!this.mainWindow.isMaximized() && !this.mainWindow.isFullScreen() && !this.mainWindow.isMinimized()) {
      this.lastNormalBounds = this.mainWindow.getBounds();
    }

    if (this.windowStateSaveTimer !== null) {
      clearTimeout(this.windowStateSaveTimer);
    }
    this.windowStateSaveTimer = setTimeout(() => {
      this.windowStateSaveTimer = null;
      const state = this.buildCurrentWindowState();
      if (!state) return;
      const filePath = this.getWindowStateFilePath();
      void fs.mkdir(path.dirname(filePath), { recursive: true })
        .then(() => fs.writeFile(filePath, JSON.stringify(state, null, 2), 'utf-8'))
        .catch(() => {});
    }, 200);
  }

  private clampBoundsToWorkArea(bounds: Electron.Rectangle): Electron.Rectangle {
    const display = screen.getDisplayMatching(bounds);
    const workArea = display.workArea;
    const width = Math.max(MIN_WINDOW_WIDTH, Math.min(bounds.width, workArea.width));
    const height = Math.max(MIN_WINDOW_HEIGHT, Math.min(bounds.height, workArea.height));
    const maxX = workArea.x + workArea.width - width;
    const maxY = workArea.y + workArea.height - height;
    const x = Math.max(workArea.x, Math.min(bounds.x, maxX));
    const y = Math.max(workArea.y, Math.min(bounds.y, maxY));
    return { x, y, width, height };
  }

  private emitWindowState() {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
    this.mainWindow.webContents.send('window-state-changed', {
      isMaximized: this.mainWindow.isMaximized(),
      isFullScreen: this.mainWindow.isFullScreen(),
    });
  }

  /**
   * This method will be called when Electron has finished
   * initialization and is ready to create browser windows
   * Some APIs can only be used after this event occurs
   */
  public init(ipcChannels: IpcChannelInterface[]) {
    app.on('ready', () => this.onReady(ipcChannels));
    app.on('activate', () => this.onActivate());
    app.on('window-all-closed', () => this.onWindowAllClosed());
  }

  private onReady(ipcChannels: IpcChannelInterface[]) {
    // Register IPC handlers once before creating the first window
    this.registerIpcChannels(ipcChannels);
    this.registerAppIpcHandlers();
    this.createWindow();
  }

  /**
   * The next thing we need to take care of is how channels
   * are added to our main process.
   * The easiest way is to add an array of channels to
   * our init method of our Main class.
   */
  private registerIpcChannels(ipcChannels: IpcChannelInterface[]) {
    ipcChannels.forEach(channel =>
      ipcMain.on(channel.getName(), (event, request) =>
        channel.handle(event, request)));
  }

  /**
   * Create the browser window and load index.html
   */
  private createWindow() {
    // Follow app-controlled theme (renderer will sync via IPC).
    nativeTheme.themeSource = 'system';

    const persistedState = this.readPersistedWindowState();
    const workArea = screen.getPrimaryDisplay().workArea;
    const defaultWidth = Math.max(MIN_WINDOW_WIDTH, Math.min(DEFAULT_WINDOW_WIDTH, workArea.width));
    const defaultHeight = Math.max(MIN_WINDOW_HEIGHT, Math.min(DEFAULT_WINDOW_HEIGHT, workArea.height));
    const defaultBounds: Electron.Rectangle = {
      width: defaultWidth,
      height: defaultHeight,
      x: workArea.x + Math.max(0, Math.floor((workArea.width - defaultWidth) / 2)),
      y: workArea.y + Math.max(0, Math.floor((workArea.height - defaultHeight) / 2)),
    };
    const initialBounds = persistedState?.bounds ?? defaultBounds;
    this.lastNormalBounds = initialBounds;

    // Create and control browser windows
    this.mainWindow = new BrowserWindow({
      width: initialBounds.width,
      height: initialBounds.height,
      minWidth: MIN_WINDOW_WIDTH,
      minHeight: MIN_WINDOW_HEIGHT,
      x: initialBounds.x,
      y: initialBounds.y,
      // frame: false,
      titleBarStyle: 'hidden',
      webPreferences: {
        nodeIntegration: true, // Makes it possible to use `require` within our index.html
        contextIsolation: false,
        // enableRemoteModule: true
      }
    });

    this.mainWindow.on('close', () => {
      this.saveWindowStateSync();
    });

    this.mainWindow.on('closed', () => {
      if (this.windowStateSaveTimer !== null) {
        clearTimeout(this.windowStateSaveTimer);
        this.windowStateSaveTimer = null;
      }
      this.mainWindow = null;
    });

    this.mainWindow.on('move', () => this.scheduleSaveWindowState());
    this.mainWindow.on('resize', () => this.scheduleSaveWindowState());
    this.mainWindow.on('maximize', () => {
      this.scheduleSaveWindowState();
      this.emitWindowState();
    });
    this.mainWindow.on('unmaximize', () => {
      this.scheduleSaveWindowState();
      this.emitWindowState();
    });
    this.mainWindow.on('enter-full-screen', () => {
      this.scheduleSaveWindowState();
      this.emitWindowState();
    });
    this.mainWindow.on('leave-full-screen', () => {
      if (this.wasMaximizedBeforeFullScreen && !this.mainWindow?.isMaximized()) {
        this.mainWindow?.maximize();
      } else if (this.boundsBeforeFullScreen && this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.setBounds(this.clampBoundsToWorkArea(this.boundsBeforeFullScreen));
      } else if (this.mainWindow && !this.mainWindow.isDestroyed() && !this.mainWindow.isMaximized()) {
        this.mainWindow.setBounds(this.clampBoundsToWorkArea(this.mainWindow.getBounds()));
      }
      this.wasMaximizedBeforeFullScreen = false;
      this.boundsBeforeFullScreen = null;
      this.scheduleSaveWindowState();
      this.emitWindowState();
    });
    this.mainWindow.webContents.on('did-finish-load', () => this.emitWindowState());

    // DevTools disabled for production
    // this.mainWindow.webContents.openDevTools();

    // Attach fullscreen(f11 and not 'maximized') && focus listeners with explicit minimum dimensions
    attachTitlebarToWindow(this.mainWindow, {
      minWidth: MIN_WINDOW_WIDTH,
      minHeight: MIN_WINDOW_HEIGHT,
    });
    this.mainWindow.setMinimumSize(MIN_WINDOW_WIDTH, MIN_WINDOW_HEIGHT);

    if (persistedState?.isFullScreen) {
      this.wasMaximizedBeforeFullScreen = persistedState.isMaximized;
      this.boundsBeforeFullScreen = initialBounds;
      this.mainWindow.setFullScreen(true);
    } else if (persistedState?.isMaximized) {
      this.mainWindow.maximize();
    }

    // and load the index.html of the app
    this.mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  private registerAppIpcHandlers() {
    if (this.ipcRegistered) return;
    this.ipcRegistered = true;

    const projectIo = createProjectIoService({ userDataPath: app.getPath('userData') });

    // IPC handlers for window controls (frameless titlebar buttons)
    ipcMain.handle('window-get-state', () => ({
      isMaximized: this.mainWindow?.isMaximized() ?? false,
      isFullScreen: this.mainWindow?.isFullScreen() ?? false,
    }));
    ipcMain.on('window-minimize', () => this.mainWindow?.minimize());
    ipcMain.on('window-maximize', () => {
      if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
      if (this.mainWindow.isFullScreen()) {
        this.mainWindow.setFullScreen(false);
        return;
      }
      if (this.mainWindow.isMaximized()) {
        this.mainWindow.unmaximize();
      } else {
        this.mainWindow.maximize();
      }
    });
    ipcMain.on('window-toggle-fullscreen', () => {
      if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
      if (this.mainWindow.isFullScreen()) {
        this.mainWindow.setFullScreen(false);
      } else {
        this.wasMaximizedBeforeFullScreen = this.mainWindow.isMaximized();
        this.boundsBeforeFullScreen = this.wasMaximizedBeforeFullScreen
          ? null
          : this.mainWindow.getBounds();
        this.mainWindow.setFullScreen(true);
      }
    });
    ipcMain.on('window-close', () => this.mainWindow?.close());

    // Keep native dialogs in sync with the renderer theme.
    ipcMain.on('native-theme:set', (_event, theme: 'dark' | 'light') => {
      nativeTheme.themeSource = theme;
    });

    ipcMain.handle('app:get-root', async () => {
      return path.resolve(__dirname, '../..');
    });

    registerCanBridgeIpc(ipcMain, path.resolve(__dirname, '../..'));
    registerCustomViewIpc(ipcMain);

    ipcMain.handle('project:cancel', async (_event, { requestId }: { requestId: string }) => {
      const startTime = startedAt();
      const operation = cancellableProjectOperations.get(requestId);
      if (operation) {
        operation.cancelled = true;
      }
      return okResponse(startTime, { cancelled: Boolean(operation) });
    });

    ipcMain.handle('storage:read-json', async (_event, { scope, name }: { scope: string; name: string }) => {
      const startTime = startedAt();
      try {
        const filePath = getRendererStoragePath(scope, name);
        if (!(await pathExists(filePath))) {
          return okResponse(startTime, { found: false, value: null }, { cacheHit: false });
        }

        const raw = await fs.readFile(filePath, 'utf-8');
        return okResponse(startTime, { found: true, value: JSON.parse(raw) }, { cacheHit: true });
      } catch (error) {
        return errorResponse(startTime, { found: false, value: null }, error, { cacheHit: false });
      }
    });

    ipcMain.handle('storage:write-json', async (_event, { scope, name, value }: { scope: string; name: string; value: unknown }) => {
      const startTime = startedAt();
      try {
        const filePath = getRendererStoragePath(scope, name);
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf-8');
        return okResponse(startTime, {});
      } catch (error) {
        return errorResponse(startTime, {}, error);
      }
    });

    ipcMain.handle('storage:delete-entry', async (_event, { scope, name }: { scope: string; name: string }) => {
      const startTime = startedAt();
      try {
        const filePath = getRendererStoragePath(scope, name);
        await fs.rm(filePath, { force: true });
        return okResponse(startTime, {});
      } catch (error) {
        return errorResponse(startTime, {}, error);
      }
    });

    ipcMain.handle(
      'project:discover',
      async (_event, { rootDir, defaultCategory, builtIn, requestId }: {
        rootDir?: string | null;
        defaultCategory?: string;
        builtIn?: boolean;
        requestId?: string;
      }) => {
        const startTime = startedAt();
        const operation = registerProjectOperation(requestId);
        try {
          const resolvedRoot = builtIn
            ? path.join(path.resolve(__dirname, '../..'), 'examples')
            : rootDir;

          if (!resolvedRoot) {
            return errorResponse(startTime, { projects: [], stats: {
              cacheHits: 0,
              cacheMisses: 0,
              cacheInvalidations: 0,
              cacheEvictions: 0,
              projectCount: 0,
            } }, 'Missing project root directory.');
          }

          const { projects, stats } = await projectIo.discoverProjectsFromRoot(
            resolvedRoot,
            defaultCategory || (builtIn ? 'uncategorized' : 'external'),
            {
              isCancelled: operation.isCancelled,
              onProgress: (progress) => forwardProjectProgress(_event.sender, requestId, progress),
            },
          );
          return okResponse(startTime, { projects, stats }, { cacheHit: stats.cacheHits > 0 && stats.cacheMisses === 0 });
        } catch (e: unknown) {
          if (e instanceof ProjectIoCancelledError) {
            return okResponse(startTime, {
              projects: [],
              stats: {
                cacheHits: 0,
                cacheMisses: 0,
                cacheInvalidations: 0,
                cacheEvictions: 0,
                projectCount: 0,
              },
              canceled: true,
            });
          }
          return errorResponse(startTime, {
            projects: [],
            stats: {
              cacheHits: 0,
              cacheMisses: 0,
              cacheInvalidations: 0,
              cacheEvictions: 0,
              projectCount: 0,
            },
          }, e);
        } finally {
          operation.dispose();
        }
      },
    );

    ipcMain.handle(
      'project:load',
      async (_event, project: {
        name: string;
        board: string;
        dirPath: string;
        requestId?: string;
      }) => {
        const startTime = startedAt();
        const requestId = project.requestId;
        const operation = registerProjectOperation(requestId);
        try {
          const loaded = await projectIo.loadProjectFromDisk(project, {
            isCancelled: operation.isCancelled,
            onProgress: (progress) => forwardProjectProgress(_event.sender, requestId, progress),
          });
          return okResponse(startTime, { loaded }, { cacheHit: false });
        } catch (e: unknown) {
          if (e instanceof ProjectIoCancelledError) {
            return okResponse(startTime, {
              loaded: { name: project.name, board: project.board, files: [], hex: null },
              canceled: true,
            }, { cacheHit: false });
          }
          return errorResponse(startTime, {
            loaded: { name: project.name, board: project.board, files: [], hex: null },
          }, e, { cacheHit: false });
        } finally {
          operation.dispose();
        }
      },
    );

    ipcMain.handle(
      'project:export',
      async (_event, {
        name,
        board,
        files,
      }: {
        name: string;
        board: string;
        files: ProjectFileRecord[];
      }) => {
        const startTime = startedAt();
        try {
          const saveOptions = {
            title: 'Export Project',
            defaultPath: `${name}.avr8js`,
            filters: [
              { name: 'AVR8js Project', extensions: ['avr8js'] },
              { name: 'All Files', extensions: ['*'] },
            ],
          };
          const result = this.mainWindow
            ? await dialog.showSaveDialog(this.mainWindow, saveOptions)
            : await dialog.showSaveDialog(saveOptions);

          if (result.canceled || !result.filePath) {
            return okResponse(startTime, { canceled: true, filePath: null });
          }

          const archive: ProjectArchive = {
            format: 'avr8js-project',
            version: 1,
            name,
            board,
            files,
            exportedAt: new Date().toISOString(),
          };

          await fs.writeFile(result.filePath, JSON.stringify(archive, null, 2), 'utf-8');
          return okResponse(startTime, { canceled: false, filePath: result.filePath });
        } catch (e: unknown) {
          return errorResponse(startTime, {
            canceled: false,
            filePath: null,
          }, e);
        }
      },
    );

    ipcMain.handle('project:import', async () => {
      const startTime = startedAt();
      try {
        const openOptions: Electron.OpenDialogOptions = {
          title: 'Import Project',
          filters: [
            { name: 'AVR8js Project', extensions: ['avr8js'] },
            { name: 'JSON Files', extensions: ['json'] },
            { name: 'All Files', extensions: ['*'] },
          ],
          properties: ['openFile'],
        };
        const result = this.mainWindow
          ? await dialog.showOpenDialog(this.mainWindow, openOptions)
          : await dialog.showOpenDialog(openOptions);

        const filePath = result.filePaths?.[0];
        if (result.canceled || !filePath) {
          return okResponse(startTime, { canceled: true, project: null });
        }

        const raw = await fs.readFile(filePath, 'utf-8');
        const project = parseProjectArchive(raw, filePath);
        return okResponse(startTime, { canceled: false, project });
      } catch (e: unknown) {
        return errorResponse(startTime, {
          canceled: false,
          project: null,
        }, e);
      }
    });

    // Project Auto-Save IPC
    ipcMain.handle(
      'project:save-diagram',
      async (_event, { path: projectPath, content }: {
        path: string; content: string;
      }) => {
        const startTime = startedAt();
        try {
          const diagramPath = path.join(projectPath, 'diagram.json');
          await fs.writeFile(diagramPath, content, 'utf-8');
          return okResponse(startTime, {});
        } catch (e: unknown) {
          console.error('Failed to save diagram', e);
          return errorResponse(startTime, {}, e);
        }
      },
    );

    // Persist compiled firmware & custom chip binaries into <projectPath>/build/
    ipcMain.handle(
      'project:save-build',
      async (_event, {
        projectPath,
        hex,
        board,
        backend,
        chipWasms,
      }: {
        projectPath: string;
        hex?: string | null;
        board?: string;
        backend?: string;
        chipWasms?: ProjectBuildChipArtifactInput[];
      }) => {
        const startTime = startedAt();
        try {
          if (typeof projectPath !== 'string' || projectPath.trim().length === 0) {
            throw new Error('Project path is required to persist build artifacts.');
          }
          resolvePathWithin(projectPath, PROJECT_BUILD_DIR);
          const result = await saveProjectBuildArtifacts(projectPath, {
            hex,
            board,
            backend,
            chipWasms,
          });
          return okResponse(startTime, result);
        } catch (e: unknown) {
          return errorResponse(startTime, {}, e);
        }
      },
    );

    // Generic file save — writes any project file to disk
    ipcMain.handle(
      'project:save-file',
      async (_event, { projectPath, filename, content }: {
        projectPath: string; filename: string; content: string;
      }) => {
        const startTime = startedAt();
        try {
          const filePath = resolvePathWithin(projectPath, filename);
          await fs.writeFile(filePath, content, 'utf-8');
          return okResponse(startTime, {});
        } catch (e: unknown) {
          return errorResponse(startTime, {}, e);
        }
      },
    );

    // Generic file read — reads a project file from disk
    ipcMain.handle(
      'project:read-file',
      async (_event, { projectPath, filename }: {
        projectPath: string; filename: string;
      }) => {
        const startTime = startedAt();
        try {
          const filePath = resolvePathWithin(projectPath, filename);
          const content = await fs.readFile(filePath, 'utf-8');
          return okResponse(startTime, { content }, { cacheHit: false });
        } catch (e: unknown) {
          return errorResponse(startTime, { content: '' }, e, { cacheHit: false });
        }
      },
    );

    // Dialog IPC: Save / Open file pickers
    ipcMain.handle('dialog-save', async (_event, options) => {
      return this.mainWindow
        ? dialog.showSaveDialog(this.mainWindow, options)
        : dialog.showSaveDialog(options);
    });
    ipcMain.handle('dialog-open', async (_event, options) => {
      return this.mainWindow
        ? dialog.showOpenDialog(this.mainWindow, options)
        : dialog.showOpenDialog(options);
    });

    // Create a new project folder under examples/
    ipcMain.handle(
      'project:create',
      async (_event, {
        appRoot,
        category,
        slug,
        name,
        board,
        inoContent,
        diagramContent,
      }: {
        appRoot: string;
        category: string;
        slug: string;
        name: string;
        board: string;
        inoContent: string;
        diagramContent: string;
      }) => {
        const startTime = startedAt();
        try {
          const examplesRoot = path.join(appRoot, 'examples');
          const safeSlug = sanitizeStorageSegment(slug);
          const dir = resolvePathWithin(examplesRoot, path.join(category, safeSlug));
          await fs.mkdir(dir, { recursive: true });

          const metadata = JSON.stringify(
            { name, board, description: '', category, tags: [] },
            null, 2,
          );
          await fs.writeFile(path.join(dir, 'metadata.json'), metadata, 'utf-8');
          await fs.writeFile(path.join(dir, `${safeSlug}.ino`), inoContent, 'utf-8');
          await fs.writeFile(path.join(dir, 'diagram.json'), diagramContent, 'utf-8');

          return okResponse(startTime, { dirPath: dir });
        } catch (e: unknown) {
          return errorResponse(startTime, {}, e);
        }
      },
    );

    // custom chips compilation (C/C++/etc -> WASM) via configurable command template
    ipcMain.handle(
      'custom-chips:build',
      async (_event, {
        projectPath,
        chips,
        commandTemplate,
      }: {
        projectPath?: string | null;
        chips: Array<{
          name: string;
          sourceFile: string;
          sourceContent: string;
          wasmFile?: string;
          manifestFile?: string;
          manifestContent?: string;
        }>;
        commandTemplate?: string;
      }) => {

        const results: Array<{
          name: string;
          sourceFile: string;
          wasmFile: string;
          success: boolean;
          stdout: string;
          stderr: string;
          wasmBase64?: string;
          error?: string;
        }> = [];

        const template = (commandTemplate ?? '').trim();

        for (const chip of (chips ?? [])) {
          const tmpBase = await fs.mkdtemp(path.join(os.tmpdir(), 'avr8js-chip-'));
          const chipDir = path.join(tmpBase, chip.name);
          const wasmFile = chip.wasmFile || `${chip.name}.chip.wasm`;
          const sourcePath = path.join(chipDir, chip.sourceFile);
          const outputPath = path.join(chipDir, wasmFile);

          try {
            await fs.mkdir(chipDir, { recursive: true });
            await fs.writeFile(sourcePath, chip.sourceContent, 'utf-8');

            if (chip.manifestFile && chip.manifestContent) {
              await fs.writeFile(path.join(chipDir, chip.manifestFile), chip.manifestContent, 'utf-8');
            }

            if (!template) {
              throw new Error('chipBuildCommand is empty. Configure it in Settings > Build > Custom Chips (WASM).');
            }

            const renderedCommand = template
              .split('{{SOURCE}}').join(sourcePath)
              .split('{{OUTPUT}}').join(outputPath)
              .split('{{CHIP_NAME}}').join(chip.name)
              .split('{{PROJECT_DIR}}').join(projectPath || chipDir);

            const procResult = await new Promise<{ stdout: string; stderr: string; code: number }>((resolve) => {
              let stdout = '';
              let stderr = '';
              const proc = cp.spawn(renderedCommand, {
                shell: true,
                cwd: projectPath || chipDir,
                env: process.env,
              });
              proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
              proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
              proc.on('close', (exitCode: number) => resolve({ stdout, stderr, code: exitCode ?? 1 }));
              proc.on('error', (e: Error) => resolve({ stdout, stderr: `${stderr}\n${e.message}`, code: 1 }));
            });

            if (procResult.code !== 0) {
              results.push({
                name: chip.name,
                sourceFile: chip.sourceFile,
                wasmFile,
                success: false,
                stdout: procResult.stdout,
                stderr: procResult.stderr,
                error: `Build command failed with exit code ${procResult.code}`,
              });
              continue;
            }

            const wasmBuffer = await fs.readFile(outputPath);
            if (projectPath) {
              const chipBuildDir = resolvePathWithin(projectPath, PROJECT_BUILD_DIR);
              await fs.mkdir(chipBuildDir, { recursive: true });
              await fs.writeFile(resolvePathWithin(chipBuildDir, path.basename(wasmFile)), wasmBuffer);
            }

            results.push({
              name: chip.name,
              sourceFile: chip.sourceFile,
              wasmFile,
              success: true,
              stdout: procResult.stdout,
              stderr: procResult.stderr,
              wasmBase64: wasmBuffer.toString('base64'),
            });
          } catch (e: unknown) {
            const msg = toErrorMessage(e);
            results.push({
              name: chip.name,
              sourceFile: chip.sourceFile,
              wasmFile,
              success: false,
              stdout: '',
              stderr: msg,
              error: msg,
            });
          } finally {
            fs.rm(tmpBase, { recursive: true, force: true }).catch(() => { /* ignore */ });
          }
        }

        return {
          success: results.every((r) => r.success),
          results,
        };
      },
    );

    // arduino-cli local compilation
    ipcMain.handle(
      'arduino-cli:compile',
      async (_event, {
        buildId,
        source,
        extraFiles,
        arduinoCliPath,
        arduinoCliBin,
        fqbn,
        extraFlags,
      }: {
        buildId?: string;
        source: string;
        extraFiles: { name: string; content: string }[];
        arduinoCliPath: string;
        arduinoCliBin: string;
        fqbn: string;
        extraFlags: string;
      }) => {
        const emitProgress = (payload: {
          phase: 'prepare' | 'compile' | 'packaging' | 'done' | 'error';
          stream: 'status' | 'stdout' | 'stderr';
          text: string;
        }) => {
          if (!buildId || _event.sender.isDestroyed()) return;
          _event.sender.send('arduino-cli:progress', { buildId, ...payload });
        };

        // Create an isolated temp directory
        const tmpBase = await fs.mkdtemp(path.join(os.tmpdir(), 'avr8js-'));
        // Sketch folder must match the .ino file name (arduino-cli requirement)
        const sketchName = 'sketch';
        const sketchDir = path.join(tmpBase, sketchName);
        const outputDir = path.join(tmpBase, 'build');
        await fs.mkdir(sketchDir, { recursive: true });
        await fs.mkdir(outputDir, { recursive: true });

        try {
          emitProgress({
            phase: 'prepare',
            stream: 'status',
            text: `Preparing sketch files for ${fqbn}...`,
          });

          // Write main sketch
          await fs.writeFile(path.join(sketchDir, `${sketchName}.ino`), source, 'utf-8');
          // Write extra files
          for (const f of (extraFiles || [])) {
            await fs.writeFile(path.join(sketchDir, f.name), f.content, 'utf-8');
          }

          // Build command
          const cliBin = path.join(arduinoCliPath, arduinoCliBin || 'arduino-cli');
          const extraFlagsList = (extraFlags || '')
            .split(/\s+/)
            .filter(Boolean);
          const args = [
            'compile',
            '--fqbn', fqbn,
            '--output-dir', outputDir,
            ...extraFlagsList,
            sketchDir,
          ];

          emitProgress({
            phase: 'compile',
            stream: 'status',
            text: `Running ${path.basename(cliBin)} compile --fqbn ${fqbn}...`,
          });

          const { stdout, stderr, code } = await new Promise<{
            stdout: string; stderr: string; code: number;
          }>((resolve) => {
            let out = '';
            let err = '';
            const proc = cp.spawn(cliBin, args, { env: process.env });
            proc.stdout?.on('data', (d: Buffer) => {
              const chunk = d.toString();
              out += chunk;
              emitProgress({ phase: 'compile', stream: 'stdout', text: chunk });
            });
            proc.stderr?.on('data', (d: Buffer) => {
              const chunk = d.toString();
              err += chunk;
              emitProgress({ phase: 'compile', stream: 'stderr', text: chunk });
            });
            proc.on('close', (exitCode: number) => resolve({ stdout: out, stderr: err, code: exitCode ?? 1 }));
            proc.on('error', (e: Error) => {
              const msg = e.message;
              emitProgress({ phase: 'error', stream: 'stderr', text: msg });
              resolve({ stdout: out, stderr: err + '\n' + msg, code: 1 });
            });
          });

          if (code !== 0) {
            emitProgress({
              phase: 'error',
              stream: 'stderr',
              text: `arduino-cli exited with code ${code}`,
            });
            return { hex: '', stdout, stderr };
          }

          emitProgress({
            phase: 'packaging',
            stream: 'status',
            text: 'Loading compiled firmware (.hex)...',
          });

          // Read the compiled hex file
          const hexPath = path.join(outputDir, `${sketchName}.ino.hex`);
          const hex = await fs.readFile(hexPath, 'utf-8');

          emitProgress({
            phase: 'done',
            stream: 'status',
            text: 'Compilation completed.',
          });
          return { hex, stdout, stderr };
        } finally {
          // Clean up temp directory in background
          fs.rm(tmpBase, { recursive: true, force: true }).catch(() => { /* ignore */ });
        }
      },
    );
  }

  private onActivate() {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      this.createWindow();
    }
  }

  /**
   * Quit when all windows are closed, except on macOS. There, it's common
   * for applications and their menu bar to stay active until the user quits
   * explicitly with Cmd + Q
   */
  private onWindowAllClosed() {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  }
}

// Here we go!
(new Main()).init([
  new SystemInfoChannel()
]);
