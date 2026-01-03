import { contextBridge, ipcRenderer } from 'electron';

// IPC通信用のチャンネル名（インライン定義）
const IPC_CHANNELS = {
  STATE_CHANGED: 'state-changed',
  SETTINGS_LOADED: 'settings-loaded',
  MOUSE_POSITION: 'mouse-position',
  START_CLICKING: 'start-clicking',
  STOP_CLICKING: 'stop-clicking',
  TOGGLE_CLICKING: 'toggle-clicking',
  GET_SETTINGS: 'get-settings',
  SAVE_SETTINGS: 'save-settings',
  START_POSITION_PICKER: 'start-position-picker',
  STOP_POSITION_PICKER: 'stop-position-picker',
  GET_MOUSE_POSITION: 'get-mouse-position',
  REGISTER_HOTKEY: 'register-hotkey',
  SHOW_WINDOW: 'show-window',
} as const;

// レンダラープロセスに公開するAPI
const electronAPI = {
  // 設定関連
  getSettings: () => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_SETTINGS);
  },
  saveSettings: (settings: unknown) => {
    return ipcRenderer.invoke(IPC_CHANNELS.SAVE_SETTINGS, settings);
  },

  // クリック制御
  startClicking: (): void => {
    ipcRenderer.send(IPC_CHANNELS.START_CLICKING);
  },
  stopClicking: (): void => {
    ipcRenderer.send(IPC_CHANNELS.STOP_CLICKING);
  },
  toggleClicking: (): void => {
    ipcRenderer.send(IPC_CHANNELS.TOGGLE_CLICKING);
  },

  // マウス位置取得
  getMousePosition: (): Promise<{ x: number; y: number }> => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_MOUSE_POSITION);
  },

  // イベントリスナー
  onStateChanged: (callback: (state: unknown) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, state: unknown) => callback(state);
    ipcRenderer.on(IPC_CHANNELS.STATE_CHANGED, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.STATE_CHANGED, handler);
    };
  },

  onSettingsLoaded: (callback: (settings: unknown) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, settings: unknown) => callback(settings);
    ipcRenderer.on(IPC_CHANNELS.SETTINGS_LOADED, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.SETTINGS_LOADED, handler);
    };
  },
};

// contextBridgeでレンダラーに公開
contextBridge.exposeInMainWorld('electronAPI', electronAPI);
