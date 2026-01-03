"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_SETTINGS = exports.IPC_CHANNELS = void 0;
// IPC通信用のチャンネル名
exports.IPC_CHANNELS = {
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
};
// デフォルト設定
exports.DEFAULT_SETTINGS = {
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
//# sourceMappingURL=types.js.map