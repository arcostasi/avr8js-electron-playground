import { app, BrowserWindow, ipcMain, nativeTheme, dialog } from "electron";
import { IpcChannelInterface } from "../electron/ipc-channel";
import { SystemInfoChannel } from "../electron/info-channel";

import { setupTitlebar, attachTitlebarToWindow } from 'custom-electron-titlebar/main';

import * as path from "node:path";

process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';

// Setup the titlebar main process
setupTitlebar();

class Main {

  private mainWindow: BrowserWindow;

  /**
   * This method will be called when Electron has finished
   * initialization and is ready to create browser windows
   * Some APIs can only be used after this event occurs
   */
  public init(ipcChannels: IpcChannelInterface[]) {
    app.on('ready', this.createWindow);
    app.on('activate', this.onActivate);
    app.on('window-all-closed', this.onWindowAllClosed);

    // These channels will then be registered by our ipcMain process
    this.registerIpcChannels(ipcChannels);
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
    // Electron App is always rendered in "dark mode"
    nativeTheme.themeSource = 'dark';

    // Create and control browser windows
    this.mainWindow = new BrowserWindow({
      width: 1920,
      height: 1040,
      x: 0,
      y: 0,
      // frame: false,
      titleBarStyle: 'hidden',
      webPreferences: {
        nodeIntegration: true, // Makes it possible to use `require` within our index.html
        contextIsolation: false,
        // enableRemoteModule: true
      }
    });

    // DevTools disabled for production
    // this.mainWindow.webContents.openDevTools();

    // Attach fullscreen(f11 and not 'maximized') && focus listeners
    attachTitlebarToWindow(this.mainWindow);

    // and load the index.html of the app
    this.mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));

    // IPC handlers for window controls (frameless titlebar buttons)
    ipcMain.on('window-minimize', () => this.mainWindow?.minimize());
    ipcMain.on('window-maximize', () => {
      if (this.mainWindow?.isMaximized()) {
        this.mainWindow.unmaximize();
      } else {
        this.mainWindow?.maximize();
      }
    });
    ipcMain.on('window-close', () => this.mainWindow?.close());

    // Synchronous IPC: return the project root path for the renderer
    // __dirname in main process = dist/main/, so go up 2 levels to project root
    ipcMain.on('get-app-root', (event) => {
      event.returnValue = path.resolve(__dirname, '../..');
    });

    // Project Auto-Save IPC
    ipcMain.handle(
      'project:save-diagram',
      async (_event, { path: projectPath, content }: {
        path: string; content: string;
      }) => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const fs = require('node:fs/promises');
        try {
          const diagramPath = path.join(projectPath, 'diagram.json');
          await fs.writeFile(diagramPath, content, 'utf-8');
          return { success: true };
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error('Failed to save diagram', e);
          return { success: false, error: msg };
        }
      },
    );

    // Generic file save — writes any project file to disk
    ipcMain.handle(
      'project:save-file',
      async (_event, { projectPath, filename, content }: {
        projectPath: string; filename: string; content: string;
      }) => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const fs = require('node:fs/promises');
        try {
          const filePath = path.join(projectPath, filename);
          await fs.writeFile(filePath, content, 'utf-8');
          return { success: true };
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          return { success: false, error: msg };
        }
      },
    );

    // Generic file read — reads a project file from disk
    ipcMain.handle(
      'project:read-file',
      async (_event, { projectPath, filename }: {
        projectPath: string; filename: string;
      }) => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const fs = require('node:fs/promises');
        try {
          const filePath = path.join(projectPath, filename);
          const content = await fs.readFile(filePath, 'utf-8') as string;
          return { success: true, content };
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          return { success: false, content: '', error: msg };
        }
      },
    );

    // Dialog IPC: Save / Open file pickers
    ipcMain.handle('dialog-save', async (_event, options) => {
      return dialog.showSaveDialog(this.mainWindow, options);
    });
    ipcMain.handle('dialog-open', async (_event, options) => {
      return dialog.showOpenDialog(this.mainWindow, options);
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
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const fs = require('node:fs/promises') as typeof import('node:fs/promises');
        try {
          const dir = path.join(appRoot, 'examples', category, slug);
          await fs.mkdir(dir, { recursive: true });

          const metadata = JSON.stringify(
            { name, board, description: '', category, tags: [] },
            null, 2,
          );
          await fs.writeFile(path.join(dir, 'metadata.json'), metadata, 'utf-8');
          await fs.writeFile(path.join(dir, `${slug}.ino`), inoContent, 'utf-8');
          await fs.writeFile(path.join(dir, 'diagram.json'), diagramContent, 'utf-8');

          return { success: true, dirPath: dir };
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          return { success: false, error: msg };
        }
      },
    );

    // arduino-cli local compilation
    ipcMain.handle(
      'arduino-cli:compile',
      async (_event, {
        source,
        extraFiles,
        arduinoCliPath,
        arduinoCliBin,
        fqbn,
        extraFlags,
      }: {
        source: string;
        extraFiles: { name: string; content: string }[];
        arduinoCliPath: string;
        arduinoCliBin: string;
        fqbn: string;
        extraFlags: string;
      }) => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const fs = require('node:fs/promises') as typeof import('node:fs/promises');
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const os = require('node:os') as typeof import('node:os');
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const cp = require('node:child_process') as typeof import('node:child_process');

        // Create an isolated temp directory
        const tmpBase = await fs.mkdtemp(path.join(os.tmpdir(), 'avr8js-'));
        // Sketch folder must match the .ino file name (arduino-cli requirement)
        const sketchName = 'sketch';
        const sketchDir = path.join(tmpBase, sketchName);
        const outputDir = path.join(tmpBase, 'build');
        await fs.mkdir(sketchDir, { recursive: true });
        await fs.mkdir(outputDir, { recursive: true });

        try {
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

          const { stdout, stderr, code } = await new Promise<{
            stdout: string; stderr: string; code: number;
          }>((resolve) => {
            let out = '';
            let err = '';
            const proc = cp.spawn(cliBin, args, { env: process.env });
            proc.stdout?.on('data', (d: Buffer) => { out += d.toString(); });
            proc.stderr?.on('data', (d: Buffer) => { err += d.toString(); });
            proc.on('close', (exitCode: number) => resolve({ stdout: out, stderr: err, code: exitCode ?? 1 }));
            proc.on('error', (e: Error) => resolve({ stdout: out, stderr: err + '\n' + e.message, code: 1 }));
          });

          if (code !== 0) {
            return { hex: '', stdout, stderr };
          }

          // Read the compiled hex file
          const hexPath = path.join(outputDir, `${sketchName}.ino.hex`);
          const hex = await fs.readFile(hexPath, 'utf-8');
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
