// モジュールとして扱う
export {};

// 型定義（インライン）
type ClickButton = 'left' | 'right' | 'middle';
type ClickType = 'single' | 'double';
type PositionMode = 'current' | 'fixed';

interface ClickSettings {
  button: ClickButton;
  clickType: ClickType;
  interval: number;
  repeatCount: number;
}

interface PositionSettings {
  mode: PositionMode;
  x: number;
  y: number;
}

interface HotkeySettings {
  toggle: string;
  pause: string;
}

interface AppSettings {
  click: ClickSettings;
  position: PositionSettings;
  hotkey: HotkeySettings;
}

interface AppState {
  isRunning: boolean;
  isPaused: boolean;
  clickCount: number;
}

const DEFAULT_SETTINGS: AppSettings = {
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

// electronAPIの型定義
interface ElectronAPI {
  getSettings(): Promise<AppSettings>;
  saveSettings(settings: AppSettings): Promise<boolean>;
  startClicking(): void;
  stopClicking(): void;
  toggleClicking(): void;
  getMousePosition(): Promise<{ x: number; y: number }>;
  onStateChanged(callback: (state: AppState) => void): () => void;
  onSettingsLoaded(callback: (settings: AppSettings) => void): () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

class SettingsUI {
  private settings: AppSettings = DEFAULT_SETTINGS;
  private state: AppState = { isRunning: false, isPaused: false, clickCount: 0 };
  private positionUpdateInterval: number | null = null;
  private isCapturingHotkey: HTMLInputElement | null = null;

  constructor() {
    this.init();
  }

  private async init(): Promise<void> {
    // 設定を読み込む
    this.settings = await window.electronAPI.getSettings();
    this.applySettingsToUI();

    // イベントリスナーを設定
    this.setupEventListeners();

    // 状態変更の監視
    window.electronAPI.onStateChanged((state) => {
      this.state = state;
      this.updateStateUI();
    });

    window.electronAPI.onSettingsLoaded((settings) => {
      this.settings = settings;
      this.applySettingsToUI();
    });

    // マウス位置の定期更新
    this.startPositionUpdate();
  }

  private setupEventListeners(): void {
    // タブ切り替え
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        const tabId = target.dataset.tab;
        console.log('[UI] Tab clicked:', tabId);
        if (tabId) {
          this.switchTab(tabId);
        }
      });
    });

    // クリック設定
    document.querySelectorAll('input[name="button"]').forEach((radio) => {
      radio.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        this.settings.click.button = target.value as 'left' | 'right' | 'middle';
      });
    });

    document.querySelectorAll('input[name="clickType"]').forEach((radio) => {
      radio.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        this.settings.click.clickType = target.value as 'single' | 'double';
      });
    });

    const intervalInput = document.getElementById('interval') as HTMLInputElement;
    intervalInput.addEventListener('change', () => {
      this.settings.click.interval = Math.max(1, parseInt(intervalInput.value) || 100);
    });

    const repeatInput = document.getElementById('repeatCount') as HTMLInputElement;
    repeatInput.addEventListener('change', () => {
      this.settings.click.repeatCount = Math.max(0, parseInt(repeatInput.value) || 0);
    });

    // 位置設定
    document.querySelectorAll('input[name="positionMode"]').forEach((radio) => {
      radio.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        this.settings.position.mode = target.value as 'current' | 'fixed';
        this.updatePositionCoordsState();
      });
    });

    const posXInput = document.getElementById('posX') as HTMLInputElement;
    posXInput.addEventListener('change', () => {
      this.settings.position.x = Math.max(0, parseInt(posXInput.value) || 0);
    });

    const posYInput = document.getElementById('posY') as HTMLInputElement;
    posYInput.addEventListener('change', () => {
      this.settings.position.y = Math.max(0, parseInt(posYInput.value) || 0);
    });

    // 位置ピッカー
    const pickBtn = document.getElementById('pick-position') as HTMLButtonElement;
    pickBtn.addEventListener('click', () => this.startPositionPicker());

    // ホットキー設定
    const toggleInput = document.getElementById('hotkey-toggle') as HTMLInputElement;
    const pauseInput = document.getElementById('hotkey-pause') as HTMLInputElement;

    [toggleInput, pauseInput].forEach((input) => {
      input.addEventListener('focus', () => {
        this.isCapturingHotkey = input;
        input.value = 'キーを押してください...';
      });

      input.addEventListener('blur', () => {
        if (this.isCapturingHotkey === input) {
          this.isCapturingHotkey = null;
          // 元の値に戻す
          if (input === toggleInput) {
            input.value = this.settings.hotkey.toggle;
          } else {
            input.value = this.settings.hotkey.pause;
          }
        }
      });

      input.addEventListener('keydown', (e) => {
        if (this.isCapturingHotkey !== input) return;

        e.preventDefault();
        const key = this.getKeyString(e);

        if (key) {
          input.value = key;
          if (input === toggleInput) {
            this.settings.hotkey.toggle = key;
          } else {
            this.settings.hotkey.pause = key;
          }
          input.blur();
        }
      });
    });

    // コントロールボタン
    const toggleBtn = document.getElementById('btn-toggle') as HTMLButtonElement;
    toggleBtn.addEventListener('click', () => {
      window.electronAPI.toggleClicking();
    });

    const saveBtn = document.getElementById('btn-save') as HTMLButtonElement;
    saveBtn.addEventListener('click', () => this.saveSettings());
  }

  private switchTab(tabId: string): void {
    console.log('[UI] switchTab called with:', tabId);

    // タブボタンの状態を更新
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      const isActive = (btn as HTMLElement).dataset.tab === tabId;
      btn.classList.toggle('active', isActive);
      console.log('[UI] Tab button:', (btn as HTMLElement).dataset.tab, 'active:', isActive);
    });

    // タブパネルの表示を切り替え
    document.querySelectorAll('.tab-panel').forEach((panel) => {
      const isActive = panel.id === `tab-${tabId}`;
      panel.classList.toggle('active', isActive);
      console.log('[UI] Tab panel:', panel.id, 'active:', isActive);
    });
  }

  private applySettingsToUI(): void {
    // クリック設定
    const buttonRadio = document.querySelector(
      `input[name="button"][value="${this.settings.click.button}"]`
    ) as HTMLInputElement;
    if (buttonRadio) buttonRadio.checked = true;

    const clickTypeRadio = document.querySelector(
      `input[name="clickType"][value="${this.settings.click.clickType}"]`
    ) as HTMLInputElement;
    if (clickTypeRadio) clickTypeRadio.checked = true;

    (document.getElementById('interval') as HTMLInputElement).value =
      this.settings.click.interval.toString();
    (document.getElementById('repeatCount') as HTMLInputElement).value =
      this.settings.click.repeatCount.toString();

    // 位置設定
    const positionRadio = document.querySelector(
      `input[name="positionMode"][value="${this.settings.position.mode}"]`
    ) as HTMLInputElement;
    if (positionRadio) positionRadio.checked = true;

    (document.getElementById('posX') as HTMLInputElement).value =
      this.settings.position.x.toString();
    (document.getElementById('posY') as HTMLInputElement).value =
      this.settings.position.y.toString();

    this.updatePositionCoordsState();

    // ホットキー設定
    (document.getElementById('hotkey-toggle') as HTMLInputElement).value =
      this.settings.hotkey.toggle;
    (document.getElementById('hotkey-pause') as HTMLInputElement).value =
      this.settings.hotkey.pause;
  }

  private updatePositionCoordsState(): void {
    const coordsSection = document.getElementById('position-coords') as HTMLElement;
    coordsSection.classList.toggle('disabled', this.settings.position.mode === 'current');
  }

  private updateStateUI(): void {
    // ステータス表示
    const indicator = document.getElementById('status-indicator') as HTMLElement;
    const statusText = document.getElementById('status-text') as HTMLElement;
    const toggleBtn = document.getElementById('btn-toggle') as HTMLButtonElement;
    const countValue = document.getElementById('count-value') as HTMLElement;

    indicator.classList.remove('running', 'paused');

    if (this.state.isRunning) {
      if (this.state.isPaused) {
        indicator.classList.add('paused');
        statusText.textContent = '一時停止中';
      } else {
        indicator.classList.add('running');
        statusText.textContent = '実行中';
      }
      toggleBtn.textContent = '停止';
      toggleBtn.classList.add('running');
    } else {
      statusText.textContent = '停止中';
      toggleBtn.textContent = '開始';
      toggleBtn.classList.remove('running');
    }

    countValue.textContent = this.state.clickCount.toString();
  }

  private startPositionUpdate(): void {
    this.positionUpdateInterval = window.setInterval(async () => {
      try {
        const pos = await window.electronAPI.getMousePosition();
        const currentPosEl = document.getElementById('current-pos') as HTMLElement;
        currentPosEl.textContent = `X: ${pos.x}, Y: ${pos.y}`;
      } catch {
        // エラーは無視
      }
    }, 100);
  }

  private async startPositionPicker(): Promise<void> {
    const hint = document.getElementById('picker-hint') as HTMLElement;
    hint.textContent = '画面上の任意の場所をクリックしてください...';

    // 3秒間マウス位置を監視し、次のクリックで位置を取得
    const checkPosition = async (): Promise<void> => {
      const pos = await window.electronAPI.getMousePosition();
      (document.getElementById('posX') as HTMLInputElement).value = pos.x.toString();
      (document.getElementById('posY') as HTMLInputElement).value = pos.y.toString();
      this.settings.position.x = pos.x;
      this.settings.position.y = pos.y;
      hint.textContent = `位置を取得しました: X=${pos.x}, Y=${pos.y}`;

      setTimeout(() => {
        hint.textContent = '';
      }, 3000);
    };

    // スペースキーで位置を取得
    const handler = (e: KeyboardEvent): void => {
      if (e.code === 'Space') {
        e.preventDefault();
        document.removeEventListener('keydown', handler);
        checkPosition();
      } else if (e.code === 'Escape') {
        document.removeEventListener('keydown', handler);
        hint.textContent = 'キャンセルしました';
        setTimeout(() => {
          hint.textContent = '';
        }, 2000);
      }
    };

    hint.textContent = 'Spaceキーで現在位置を取得 / Escでキャンセル';
    document.addEventListener('keydown', handler);
  }

  private getKeyString(e: KeyboardEvent): string | null {
    // 修飾キーのみは無視
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
      return null;
    }

    const parts: string[] = [];
    if (e.ctrlKey) parts.push('Ctrl');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');

    // ファンクションキー
    if (e.key.match(/^F\d+$/)) {
      parts.push(e.key);
    } else {
      parts.push(e.key.toUpperCase());
    }

    return parts.join('+');
  }

  private async saveSettings(): Promise<void> {
    try {
      await window.electronAPI.saveSettings(this.settings);

      // 保存完了を通知
      const saveBtn = document.getElementById('btn-save') as HTMLButtonElement;
      const originalText = saveBtn.textContent;
      saveBtn.textContent = '保存しました！';
      setTimeout(() => {
        saveBtn.textContent = originalText;
      }, 2000);
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }
}

// アプリケーション起動
new SettingsUI();
