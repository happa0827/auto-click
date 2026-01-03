// クリックボタンの種類
export type ClickButton = 'left' | 'right' | 'middle';

// クリックタイプ
export type ClickType = 'single' | 'double';

// 位置モード
export type PositionMode = 'current' | 'fixed';

// クリック設定
export interface ClickSettings {
  button: ClickButton;
  clickType: ClickType;
  interval: number; // ミリ秒
  repeatCount: number; // 0 = 無限
}

// 位置設定
export interface PositionSettings {
  mode: PositionMode;
  x: number;
  y: number;
}

// ホットキー設定
export interface HotkeySettings {
  toggle: string; // 例: "F6"
  pause: string;  // 例: "F7"
}

// アプリケーション全体の設定
export interface AppSettings {
  click: ClickSettings;
  position: PositionSettings;
  hotkey: HotkeySettings;
}

// アプリケーションの状態
export interface AppState {
  isRunning: boolean;
  isPaused: boolean;
  clickCount: number;
}

// IPC通信用のチャンネル名
export const IPC_CHANNELS = {
  // Main -> Renderer
  STATE_CHANGED: 'state-changed',
  SETTINGS_LOADED: 'settings-loaded',
  MOUSE_POSITION: 'mouse-position',

  // Renderer -> Main
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

// デフォルト設定
export const DEFAULT_SETTINGS: AppSettings = {
  click: {
    button: 'left',
    clickType: 'single',
    interval: 100,
    repeatCount: 0,
  },
  position: {
    mode: 'current',
    x: 0,
    y: 0,
  },
  hotkey: {
    toggle: 'F6',
    pause: 'F7',
  },
};
