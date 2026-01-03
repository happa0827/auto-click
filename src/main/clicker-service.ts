import koffi from 'koffi';
import { SettingsManager } from './settings-manager';
import { ClickButton } from '../shared/types';

console.log('[ClickerService] Loading koffi...');

// Windows API定義
let user32: ReturnType<typeof koffi.load>;
try {
  user32 = koffi.load('user32.dll');
  console.log('[ClickerService] user32.dll loaded successfully');
} catch (error) {
  console.error('[ClickerService] Failed to load user32.dll:', error);
  throw error;
}

// POINT構造体
const POINT = koffi.struct('POINT', {
  x: 'long',
  y: 'long',
});

// Windows API関数
const GetCursorPos = user32.func('bool GetCursorPos(_Out_ POINT* lpPoint)');
const SetCursorPos = user32.func('bool SetCursorPos(int X, int Y)');
const mouse_event = user32.func('void mouse_event(uint32 dwFlags, int dx, int dy, uint32 dwData, uintptr dwExtraInfo)');

// マウスイベントフラグ
const MOUSEEVENTF_LEFTDOWN = 0x0002;
const MOUSEEVENTF_LEFTUP = 0x0004;
const MOUSEEVENTF_RIGHTDOWN = 0x0008;
const MOUSEEVENTF_RIGHTUP = 0x0010;
const MOUSEEVENTF_MIDDLEDOWN = 0x0020;
const MOUSEEVENTF_MIDDLEUP = 0x0040;

export class ClickerService {
  private settingsManager: SettingsManager;
  private isRunning: boolean = false;
  private isPaused: boolean = false;
  private clickCount: number = 0;
  private intervalId: NodeJS.Timeout | null = null;

  constructor(settingsManager: SettingsManager) {
    this.settingsManager = settingsManager;
  }

  updateSettings(): void {
    // 設定更新時に必要な処理があればここに追加
  }

  getMousePosition(): { x: number; y: number } {
    const point = { x: 0, y: 0 };
    GetCursorPos(point);
    return { x: point.x, y: point.y };
  }

  async start(
    onProgress: (count: number) => void,
    onComplete: () => void
  ): Promise<void> {
    console.log('[ClickerService] start() called');
    if (this.isRunning) {
      console.log('[ClickerService] Already running, returning');
      return;
    }

    this.isRunning = true;
    this.isPaused = false;
    this.clickCount = 0;

    const settings = this.settingsManager.getSettings();
    console.log('[ClickerService] Settings:', JSON.stringify(settings));
    const maxClicks = settings.click.repeatCount;

    const doClick = (): void => {
      if (!this.isRunning) return;
      if (this.isPaused) return;

      try {
        console.log('[ClickerService] Performing click #' + (this.clickCount + 1));
        this.performClick(
          settings.position.mode === 'fixed' ? settings.position.x : undefined,
          settings.position.mode === 'fixed' ? settings.position.y : undefined,
          settings.click.button,
          settings.click.clickType === 'double'
        );

        this.clickCount++;
        console.log('[ClickerService] Click successful, count:', this.clickCount);
        onProgress(this.clickCount);

        // 指定回数に達したら停止
        if (maxClicks > 0 && this.clickCount >= maxClicks) {
          this.stop();
          onComplete();
        }
      } catch (error) {
        console.error('[ClickerService] Click error:', error);
      }
    };

    // 最初のクリックを実行
    console.log('[ClickerService] Executing first click');
    doClick();

    // インターバルを設定
    console.log('[ClickerService] Setting interval:', settings.click.interval, 'ms');
    this.intervalId = setInterval(() => {
      if (!this.isPaused && this.isRunning) {
        doClick();
      }
    }, settings.click.interval);
  }

  stop(): void {
    this.isRunning = false;
    this.isPaused = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  pause(): void {
    this.isPaused = true;
  }

  resume(): void {
    this.isPaused = false;
  }

  private performClick(
    x: number | undefined,
    y: number | undefined,
    button: ClickButton,
    isDouble: boolean
  ): void {
    console.log('[ClickerService] performClick:', { x, y, button, isDouble });

    // 固定位置モードの場合、マウスを移動
    if (x !== undefined && y !== undefined) {
      console.log('[ClickerService] Moving cursor to:', x, y);
      SetCursorPos(x, y);
    }

    // クリックイベントを取得
    const { down, up } = this.getMouseEvents(button);
    console.log('[ClickerService] Mouse events:', { down, up });

    // クリック実行
    const clickTimes = isDouble ? 2 : 1;
    for (let i = 0; i < clickTimes; i++) {
      console.log('[ClickerService] Sending mouse_event DOWN:', down);
      mouse_event(down, 0, 0, 0, 0);
      console.log('[ClickerService] Sending mouse_event UP:', up);
      mouse_event(up, 0, 0, 0, 0);
    }
    console.log('[ClickerService] performClick completed');
  }

  private getMouseEvents(button: ClickButton): { down: number; up: number } {
    switch (button) {
      case 'left':
        return { down: MOUSEEVENTF_LEFTDOWN, up: MOUSEEVENTF_LEFTUP };
      case 'right':
        return { down: MOUSEEVENTF_RIGHTDOWN, up: MOUSEEVENTF_RIGHTUP };
      case 'middle':
        return { down: MOUSEEVENTF_MIDDLEDOWN, up: MOUSEEVENTF_MIDDLEUP };
      default:
        return { down: MOUSEEVENTF_LEFTDOWN, up: MOUSEEVENTF_LEFTUP };
    }
  }
}
