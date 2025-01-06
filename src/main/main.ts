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

    // Dialog IPC: Save / Open file pickers
    ipcMain.handle('dialog-save', async (_event, options) => {
      return dialog.showSaveDialog(this.mainWindow, options);
    });
    ipcMain.handle('dialog-open', async (_event, options) => {
      return dialog.showOpenDialog(this.mainWindow, options);
    });
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
