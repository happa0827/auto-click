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
  holdEnabled: boolean;
  holdDurationMs: number;
  holdUntilOff: boolean;
}

type ClickOrderMode = 'simultaneous' | 'sequential';

interface PositionSettings {
  mode: PositionMode;
  positions: Array<{ x: number; y: number }>;
  clickOrder: ClickOrderMode;
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
    holdEnabled: false,
    holdDurationMs: 300,
    holdUntilOff: false,
  },
  position: {
    mode: 'current',
    positions: [{ x: 0, y: 0 }],
    clickOrder: 'simultaneous',
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
  getAppVersion(): Promise<string>;
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
    const version = await window.electronAPI.getAppVersion();
    const versionEl = document.getElementById('app-version');
    if (versionEl) {
      versionEl.textContent = `v${version}`;
    }
    document.title = `Auto Clicker v${version} - 設定`;

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

    const holdEnabled = document.getElementById('holdEnabled') as HTMLInputElement;
    holdEnabled.addEventListener('change', () => {
      this.settings.click.holdEnabled = holdEnabled.checked;
      if (!holdEnabled.checked) {
        this.settings.click.holdUntilOff = false;
        (document.getElementById('holdUntilOff') as HTMLInputElement).checked = false;
      }
      this.updateHoldOptionsUI();
    });

    const holdUntilOffEl = document.getElementById('holdUntilOff') as HTMLInputElement;
    holdUntilOffEl.addEventListener('change', () => {
      this.settings.click.holdUntilOff = holdUntilOffEl.checked;
      this.updateHoldOptionsUI();
    });

    const holdDurationMs = document.getElementById('holdDurationMs') as HTMLInputElement;
    holdDurationMs.addEventListener('change', () => {
      this.settings.click.holdDurationMs = Math.max(1, parseInt(holdDurationMs.value) || 300);
    });

    // 位置設定
    document.querySelectorAll('input[name="positionMode"]').forEach((radio) => {
      radio.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        this.settings.position.mode = target.value as 'current' | 'fixed';
        this.updatePositionCoordsState();
      });
    });

    document.querySelectorAll('input[name="clickOrder"]').forEach((radio) => {
      radio.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        this.settings.position.clickOrder = target.value as 'simultaneous' | 'sequential';
      });
    });

    // 位置追加ボタン
    const addPositionBtn = document.getElementById('add-position') as HTMLButtonElement;
    addPositionBtn.addEventListener('click', () => this.addPosition());

    // 位置リスト（イベント委譲）
    const positionsList = document.getElementById('positions-list');
    positionsList?.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      const item = target.closest('[data-position-index]');
      const idx = item?.getAttribute('data-position-index');
      if (idx != null && (target.name === 'posX' || target.name === 'posY')) {
        const i = parseInt(idx, 10);
        const xInput = item?.querySelector('input[name="posX"]') as HTMLInputElement;
        const yInput = item?.querySelector('input[name="posY"]') as HTMLInputElement;
        if (xInput && yInput && this.settings.position.positions[i]) {
          this.settings.position.positions[i] = {
            x: Math.max(0, parseInt(xInput.value) || 0),
            y: Math.max(0, parseInt(yInput.value) || 0),
          };
        }
      }
    });
    positionsList?.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const item = target.closest('[data-position-index]');
      const idx = item?.getAttribute('data-position-index');
      if (idx == null) return;
      const i = parseInt(idx, 10);
      if (target.classList.contains('pick-position-btn')) {
        this.startPositionPicker(i);
      } else if (target.classList.contains('remove-position-btn')) {
        this.removePosition(i);
      }
    });

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

    const holdEl = document.getElementById('holdEnabled') as HTMLInputElement;
    if (holdEl) holdEl.checked = this.settings.click.holdEnabled ?? false;
    const holdUntilEl = document.getElementById('holdUntilOff') as HTMLInputElement;
    if (holdUntilEl) holdUntilEl.checked = this.settings.click.holdUntilOff ?? false;
    (document.getElementById('holdDurationMs') as HTMLInputElement).value = (
      this.settings.click.holdDurationMs ?? 300
    ).toString();
    this.updateHoldOptionsUI();

    // 位置設定
    const positionRadio = document.querySelector(
      `input[name="positionMode"][value="${this.settings.position.mode}"]`
    ) as HTMLInputElement;
    if (positionRadio) positionRadio.checked = true;

    const clickOrderRadio = document.querySelector(
      `input[name="clickOrder"][value="${this.settings.position.clickOrder ?? 'simultaneous'}"]`
    ) as HTMLInputElement;
    if (clickOrderRadio) clickOrderRadio.checked = true;

    this.renderPositionsList();
    this.updatePositionCoordsState();

    // ホットキー設定
    (document.getElementById('hotkey-toggle') as HTMLInputElement).value =
      this.settings.hotkey.toggle;
    (document.getElementById('hotkey-pause') as HTMLInputElement).value =
      this.settings.hotkey.pause;
  }

  private updateHoldOptionsUI(): void {
    const holdEnabledEl = document.getElementById('holdEnabled') as HTMLInputElement;
    const holdUntilOffEl = document.getElementById('holdUntilOff') as HTMLInputElement;
    const durationRow = document.getElementById('hold-duration-row');
    const untilOffWrap = document.getElementById('hold-until-off-wrap');
    const hintDefault = document.getElementById('hold-hint-default');
    const hintUntilOff = document.getElementById('hold-hint-until-off');

    const he = holdEnabledEl?.checked ?? false;
    const huo = holdUntilOffEl?.checked ?? false;

    untilOffWrap?.classList.toggle('disabled', !he);
    if (!he && holdUntilOffEl) {
      holdUntilOffEl.checked = false;
      this.settings.click.holdUntilOff = false;
    }

    durationRow?.classList.toggle('disabled', !he || huo);
    hintDefault?.classList.toggle('hidden', he && huo);
    hintUntilOff?.classList.toggle('hidden', !(he && huo));
  }

  private updatePositionCoordsState(): void {
    const coordsSection = document.getElementById('position-coords') as HTMLElement;
    coordsSection.classList.toggle('disabled', this.settings.position.mode === 'current');
    const addBtn = document.getElementById('add-position') as HTMLButtonElement;
    if (addBtn) {
      addBtn.style.display = this.settings.position.mode === 'fixed' ? '' : 'none';
    }
  }

  private renderPositionsList(): void {
    const list = document.getElementById('positions-list');
    if (!list) return;

    const positions = this.settings.position.positions ?? [{ x: 0, y: 0 }];
    list.innerHTML = positions
      .map(
        (p, i) => `
      <div class="position-item" data-position-index="${i}">
        <label class="position-item-label">位置 ${i + 1}</label>
        <div class="coords-input">
          <div class="coord-field">
            <label>X:</label>
            <input type="number" name="posX" min="0" value="${p.x}">
          </div>
          <div class="coord-field">
            <label>Y:</label>
            <input type="number" name="posY" min="0" value="${p.y}">
          </div>
        </div>
        <div class="position-item-actions">
          <button type="button" class="btn btn-secondary pick-position-btn">取得</button>
          ${i > 0 ? `<button type="button" class="btn btn-remove remove-position-btn">削除</button>` : ''}
        </div>
      </div>
    `
      )
      .join('');
  }

  private addPosition(): void {
    this.settings.position.positions.push({ x: 0, y: 0 });
    this.renderPositionsList();
    this.updatePositionCoordsState();
  }

  private removePosition(index: number): void {
    if (index <= 0 || this.settings.position.positions.length <= 1) return;
    this.settings.position.positions.splice(index, 1);
    this.renderPositionsList();
    this.updatePositionCoordsState();
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

  private async startPositionPicker(index: number): Promise<void> {
    const hint = document.getElementById('picker-hint') as HTMLElement;

    const checkPosition = async (): Promise<void> => {
      const pos = await window.electronAPI.getMousePosition();
      if (this.settings.position.positions[index]) {
        this.settings.position.positions[index] = { x: pos.x, y: pos.y };
        this.renderPositionsList();
      }
      hint.textContent = `位置${index + 1}を取得しました: X=${pos.x}, Y=${pos.y}`;

      setTimeout(() => {
        hint.textContent = '';
      }, 3000);
    };

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
