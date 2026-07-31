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

// RECT（ClipCursor 用。型名は宣言と一致させる）
const RECT = koffi.struct('RECT', {
  left: 'long',
  top: 'long',
  right: 'long',
  bottom: 'long',
});

// Windows API関数
const GetCursorPos = user32.func('bool GetCursorPos(_Out_ POINT* lpPoint)');
const SetCursorPos = user32.func('bool SetCursorPos(int X, int Y)');
const ClipCursor = user32.func('bool ClipCursor(const RECT* lpRect)');
const mouse_event = user32.func('void mouse_event(uint32 dwFlags, int dx, int dy, uint32 dwData, uintptr dwExtraInfo)');

let kernel32: ReturnType<typeof koffi.load>;
try {
  kernel32 = koffi.load('kernel32.dll');
} catch {
  kernel32 = null as unknown as ReturnType<typeof koffi.load>;
}
const Sleep = kernel32?.func('void Sleep(uint32 ms)');

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
  private sequentialPositionIndex: number = 0;
  /** 停止までホールドで既にマウスダウン済み */
  private holdUntilOffPressed: boolean = false;
  /** ClipCursor でホールド位置に固定中 */
  private holdCursorClipped: boolean = false;

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
    this.sequentialPositionIndex = 0;
    this.holdUntilOffPressed = false;
    this.holdCursorClipped = false;

    const settings = this.settingsManager.getSettings();
    console.log('[ClickerService] Settings:', JSON.stringify(settings));
    const maxClicks = settings.click.repeatCount;

    const doClick = (): void => {
      if (!this.isRunning) return;
      if (this.isPaused) return;

      try {
        const positions = this.getClickPositions(settings);
        const clickOrder = settings.position?.clickOrder ?? 'simultaneous';

        const holdUntilOff =
          Boolean(settings.click.holdEnabled) && Boolean(settings.click.holdUntilOff);

        if (holdUntilOff) {
          if (this.holdUntilOffPressed) {
            return;
          }
          const pos = positions[0] ?? { x: 0, y: 0 };
          console.log('[ClickerService] Hold-until-off: press down at', pos);
          this.performHoldUntilOffPress(pos, settings.click.button);
          this.holdUntilOffPressed = true;
          this.clickCount++;
          onProgress(this.clickCount);
          return;
        }

        const isDouble = settings.click.clickType === 'double';
        const hold = {
          enabled: Boolean(settings.click.holdEnabled),
          durationMs: Math.max(1, settings.click.holdDurationMs ?? 300),
        };
        if (clickOrder === 'sequential' && positions.length > 1) {
          const pos = positions[this.sequentialPositionIndex % positions.length];
          console.log('[ClickerService] Sequential click #' + (this.clickCount + 1) + ' at position ' + (this.sequentialPositionIndex % positions.length + 1));
          this.performClick(pos.x, pos.y, settings.click.button, isDouble, hold);
          this.sequentialPositionIndex = (this.sequentialPositionIndex + 1) % positions.length;
        } else {
          console.log('[ClickerService] Simultaneous click #' + (this.clickCount + 1) + ' at ' + positions.length + ' position(s)');
          for (const pos of positions) {
            this.performClick(pos.x, pos.y, settings.click.button, isDouble, hold);
          }
        }

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
    // ホールド中に止めた場合に備え、ボタンを離す・カーソル固定を解除
    this.holdUntilOffPressed = false;
    this.releaseCursorClip();
    this.releaseAllMouseButtons();
  }

  pause(): void {
    this.isPaused = true;
    this.holdUntilOffPressed = false;
    this.releaseCursorClip();
    this.releaseAllMouseButtons();
  }

  resume(): void {
    this.isPaused = false;
  }

  private moveToAndPrepare(x: number | undefined, y: number | undefined): void {
    if (x === undefined || y === undefined) return;
    console.log('[ClickerService] Moving cursor to:', x, y);
    SetCursorPos(x, y);
  }

  /** 停止までホールド: 位置へ移動してからマウスダウンのみ（ClipCursor でホールド中は移動不可） */
  private performHoldUntilOffPress(pos: { x: number; y: number }, button: ClickButton): void {
    this.moveToAndPrepare(pos.x, pos.y);
    this.clipCursorToPoint(pos.x, pos.y);
    const { down } = this.getMouseEvents(button);
    mouse_event(down, 0, 0, 0, 0);
  }

  /** 指定ピクセル内にカーソル移動を制限（ホールド中のずれ防止） */
  private clipCursorToPoint(x: number, y: number): void {
    this.releaseCursorClip();
    const r = { left: x, top: y, right: x + 1, bottom: y + 1 };
    const ok = ClipCursor(r);
    this.holdCursorClipped = Boolean(ok);
    if (!ok) {
      console.warn('[ClickerService] ClipCursor failed at', x, y);
    }
  }

  private releaseCursorClip(): void {
    // koffi: ヌルポインタは undefined（null は NAPI 例外になることがある）
    ClipCursor(undefined);
    this.holdCursorClipped = false;
  }

  private getClickPositions(settings: import('../shared/types').AppSettings): Array<{ x: number; y: number }> {
    const { position } = settings;
    if (position.mode === 'current') {
      const point = { x: 0, y: 0 };
      GetCursorPos(point);
      return [{ x: point.x, y: point.y }];
    }
    const positions = (position.positions ?? [{ x: 0, y: 0 }]).filter((p) => p != null);
    return positions.length > 0 ? positions : [{ x: 0, y: 0 }];
  }

  private performClick(
    x: number | undefined,
    y: number | undefined,
    button: ClickButton,
    isDouble: boolean,
    hold: { enabled: boolean; durationMs: number }
  ): void {
    console.log('[ClickerService] performClick:', { x, y, button, isDouble, hold });

    this.moveToAndPrepare(x, y);

    const { down, up } = this.getMouseEvents(button);
    console.log('[ClickerService] Mouse events:', { down, up });

    if (hold.enabled && Sleep) {
      const times = isDouble ? 2 : 1;
      for (let i = 0; i < times; i++) {
        mouse_event(down, 0, 0, 0, 0);
        Sleep(Math.min(60000, hold.durationMs));
        mouse_event(up, 0, 0, 0, 0);
        if (isDouble && i === 0) {
          Sleep(50);
        }
      }
    } else {
      const clickTimes = isDouble ? 2 : 1;
      for (let i = 0; i < clickTimes; i++) {
        console.log('[ClickerService] Sending mouse_event DOWN:', down);
        mouse_event(down, 0, 0, 0, 0);
        console.log('[ClickerService] Sending mouse_event UP:', up);
        mouse_event(up, 0, 0, 0, 0);
      }
    }
    console.log('[ClickerService] performClick completed');
  }

  /** 全ボタンの離しイベント（停止時の取り残し防止） */
  private releaseAllMouseButtons(): void {
    mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
    mouse_event(MOUSEEVENTF_RIGHTUP, 0, 0, 0, 0);
    mouse_event(MOUSEEVENTF_MIDDLEUP, 0, 0, 0, 0);
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
