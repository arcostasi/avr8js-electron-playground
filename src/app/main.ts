import { app, BrowserWindow, ipcMain, nativeTheme } from "electron";
import { IpcChannelInterface } from "../electron/ipc-channel";
import { SystemInfoChannel } from "../electron/info-channel";

const { setupTitlebar, attachTitlebarToWindow } = require('custom-electron-titlebar/main');

import * as path from "path";

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
      height: 850,
      width: 1366,
      // frame: false,
      titleBarStyle: 'hidden',
      webPreferences: {
        nodeIntegration: true, // Makes it possible to use `require` within our index.html
        contextIsolation: false,
        // enableRemoteModule: true
      }
    });

    // Open the DevTools
    // this.mainWindow.webContents.openDevTools();

    // Attach fullscreen(f11 and not 'maximized') && focus listeners
    attachTitlebarToWindow(this.mainWindow);

    // and load the index.html of the app
    this.mainWindow.loadFile(path.join(__dirname, "../../index.html"));
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
