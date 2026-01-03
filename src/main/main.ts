import { app, BrowserWindow, Tray, Menu, nativeImage, globalShortcut, ipcMain, NativeImage } from 'electron';
import { autoUpdater } from 'electron-updater'
app.on('ready', function()  {
  autoUpdater.checkForUpdatesAndNotify();
});

import * as path from 'path';
import { ClickerService } from './clicker-service';
import { SettingsManager } from './settings-manager';
import { IPC_CHANNELS, AppState, AppSettings } from '../shared/types';

class AutoClickerApp {
  private mainWindow: BrowserWindow | null = null;
  private tray: Tray | null = null;
  private clickerService: ClickerService;
  private settingsManager: SettingsManager;
  private state: AppState = {
    isRunning: false,
    isPaused: false,
    clickCount: 0,
  };

  constructor() {
    this.settingsManager = new SettingsManager();
    this.clickerService = new ClickerService(this.settingsManager);
  }

  async init(): Promise<void> {
    await app.whenReady();

    this.createTray();
    this.setupIPC();
    this.registerHotkeys();

    // アプリを終了させないように設定
    app.on('window-all-closed', (e: Event) => {
      e.preventDefault();
    });
  }

  private createTray(): void {
    // トレイアイコンを作成（アイコンがない場合はデフォルト）
    const iconPath = this.getIconPath('idle');
    let icon: NativeImage;

    try {
      icon = nativeImage.createFromPath(iconPath);
      if (icon.isEmpty()) {
        icon = this.createDefaultIcon('idle');
      }
    } catch {
      icon = this.createDefaultIcon('idle');
    }

    this.tray = new Tray(icon);
    this.tray.setToolTip('Auto Clicker - 停止中');
    this.updateTrayMenu();

    this.tray.on('double-click', () => {
      this.showWindow();
    });
  }

  private createDefaultIcon(status: 'idle' | 'running' | 'paused'): NativeImage {
    // 16x16のシンプルなアイコンを生成
    const colors = {
      idle: '#808080',
      running: '#00FF00',
      paused: '#FFFF00',
    };
    const color = colors[status];

    // SVGでアイコンを生成
    const svg = `
      <svg width="16" height="16" xmlns="http://www.w3.org/2000/svg">
        <circle cx="8" cy="8" r="6" fill="${color}" stroke="#000" stroke-width="1"/>
      </svg>
    `;

    return nativeImage.createFromBuffer(Buffer.from(svg));
  }

  private getIconPath(status: 'idle' | 'running' | 'paused'): string {
    const iconName = `icon-${status}.ico`;
    return path.join(__dirname, '..', '..', '..', 'assets', iconName);
  }

  private updateTrayMenu(): void {
    if (!this.tray) return;

    const contextMenu = Menu.buildFromTemplate([
      {
        label: this.state.isRunning ? '停止' : '開始',
        click: () => this.toggleClicking(),
      },
      { type: 'separator' },
      {
        label: '設定を開く',
        click: () => this.showWindow(),
      },
      { type: 'separator' },
      {
        label: '終了',
        click: () => this.quit(),
      },
    ]);

    this.tray.setContextMenu(contextMenu);
  }

  private updateTrayIcon(): void {
    if (!this.tray) return;

    let status: 'idle' | 'running' | 'paused' = 'idle';
    let tooltip = 'Auto Clicker - 停止中';

    if (this.state.isRunning) {
      if (this.state.isPaused) {
        status = 'paused';
        tooltip = 'Auto Clicker - 一時停止中';
      } else {
        status = 'running';
        tooltip = `Auto Clicker - 実行中 (${this.state.clickCount}回)`;
      }
    }

    const icon = this.createDefaultIcon(status);
    this.tray.setImage(icon);
    this.tray.setToolTip(tooltip);
    this.updateTrayMenu();
  }

  private createWindow(): void {
    this.mainWindow = new BrowserWindow({
      width: 450,
      height: 550,
      resizable: false,
      maximizable: false,
      minimizable: true,
      show: false,
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js'),
      },
    });

    this.mainWindow.loadFile(path.join(__dirname, '..', '..', 'renderer', 'renderer', 'index.html'));

    this.mainWindow.on('close', (e) => {
      e.preventDefault();
      this.mainWindow?.hide();
    });

    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow?.show();
      this.sendSettings();
      this.sendState();
    });
  }

  private showWindow(): void {
    if (this.mainWindow) {
      this.mainWindow.show();
      this.mainWindow.focus();
    } else {
      this.createWindow();
    }
  }

  private setupIPC(): void {
    ipcMain.handle(IPC_CHANNELS.GET_SETTINGS, () => {
      return this.settingsManager.getSettings();
    });

    ipcMain.handle(IPC_CHANNELS.SAVE_SETTINGS, (_, settings: AppSettings) => {
      this.settingsManager.saveSettings(settings);
      this.clickerService.updateSettings();
      this.registerHotkeys();
      return true;
    });

    ipcMain.on(IPC_CHANNELS.START_CLICKING, () => {
      this.startClicking();
    });

    ipcMain.on(IPC_CHANNELS.STOP_CLICKING, () => {
      this.stopClicking();
    });

    ipcMain.on(IPC_CHANNELS.TOGGLE_CLICKING, () => {
      this.toggleClicking();
    });

    ipcMain.handle(IPC_CHANNELS.GET_MOUSE_POSITION, () => {
      return this.clickerService.getMousePosition();
    });

    ipcMain.on(IPC_CHANNELS.SHOW_WINDOW, () => {
      this.showWindow();
    });
  }

  private registerHotkeys(): void {
    // 既存のホットキーを解除
    globalShortcut.unregisterAll();

    const settings = this.settingsManager.getSettings();

    // トグルホットキー
    try {
      globalShortcut.register(settings.hotkey.toggle, () => {
        this.toggleClicking();
      });
    } catch (e) {
      console.error('Failed to register toggle hotkey:', e);
    }

    // 一時停止ホットキー（設定されている場合）
    if (settings.hotkey.pause) {
      try {
        globalShortcut.register(settings.hotkey.pause, () => {
          this.togglePause();
        });
      } catch (e) {
        console.error('Failed to register pause hotkey:', e);
      }
    }
  }

  private async startClicking(): Promise<void> {
    if (this.state.isRunning) return;

    this.state.isRunning = true;
    this.state.isPaused = false;
    this.state.clickCount = 0;

    this.updateTrayIcon();
    this.sendState();

    await this.clickerService.start((count) => {
      this.state.clickCount = count;
      this.updateTrayIcon();
      this.sendState();
    }, () => {
      // 完了時のコールバック
      this.state.isRunning = false;
      this.updateTrayIcon();
      this.sendState();
    });
  }

  private stopClicking(): void {
    if (!this.state.isRunning) return;

    this.clickerService.stop();
    this.state.isRunning = false;
    this.state.isPaused = false;

    this.updateTrayIcon();
    this.sendState();
  }

  private toggleClicking(): void {
    if (this.state.isRunning) {
      this.stopClicking();
    } else {
      this.startClicking();
    }
  }

  private togglePause(): void {
    if (!this.state.isRunning) return;

    this.state.isPaused = !this.state.isPaused;

    if (this.state.isPaused) {
      this.clickerService.pause();
    } else {
      this.clickerService.resume();
    }

    this.updateTrayIcon();
    this.sendState();
  }

  private sendSettings(): void {
    if (this.mainWindow) {
      this.mainWindow.webContents.send(
        IPC_CHANNELS.SETTINGS_LOADED,
        this.settingsManager.getSettings()
      );
    }
  }

  private sendState(): void {
    if (this.mainWindow) {
      this.mainWindow.webContents.send(IPC_CHANNELS.STATE_CHANGED, this.state);
    }
  }

  private quit(): void {
    this.stopClicking();
    globalShortcut.unregisterAll();
    this.mainWindow?.destroy();
    this.mainWindow = null;
    app.quit();
  }
}

// アプリケーションの起動
const autoClicker = new AutoClickerApp();
autoClicker.init().catch(console.error);
