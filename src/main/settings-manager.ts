import Store from 'electron-store';
import { AppSettings, DEFAULT_SETTINGS } from '../shared/types';

interface StoreSchema {
  settings: AppSettings;
}

export class SettingsManager {
  private store: Store<StoreSchema>;

  constructor() {
    this.store = new Store<StoreSchema>({
      name: 'auto-clicker-settings',
      defaults: {
        settings: DEFAULT_SETTINGS,
      },
    });
  }

  getSettings(): AppSettings {
    const raw = this.store.get('settings', DEFAULT_SETTINGS) as AppSettings;
    return this.migrateSettings(raw);
  }

  saveSettings(settings: AppSettings): void {
    const validated = this.validateSettings(settings);
    this.store.set('settings', validated);
  }

  private migrateSettings(settings: AppSettings): AppSettings {
    const pos = settings.position as unknown as Record<string, unknown>;
    let positions: Array<{ x: number; y: number }>;
    if (pos && !Array.isArray(pos.positions)) {
      positions = [
        { x: Math.max(0, Number(pos.x) || 0), y: Math.max(0, Number(pos.y) || 0) },
      ];
      if (pos.useSecondPosition && (pos.x2 != null || pos.y2 != null)) {
        positions.push({
          x: Math.max(0, Number(pos.x2) || 0),
          y: Math.max(0, Number(pos.y2) || 0),
        });
      }
    } else {
      positions = Array.isArray(settings.position?.positions) ? settings.position.positions : [{ x: 0, y: 0 }];
    }
    const clickOrder = settings.position?.clickOrder === 'sequential' ? 'sequential' : 'simultaneous';
    return {
      ...settings,
      click: {
        ...DEFAULT_SETTINGS.click,
        ...settings.click,
      },
      position: {
        mode: settings.position?.mode === 'fixed' ? 'fixed' : 'current',
        positions,
        clickOrder,
      },
    };
  }

  private validateSettings(settings: AppSettings): AppSettings {
    const positions = Array.isArray(settings.position?.positions)
      ? settings.position.positions
          .filter((p): p is { x: number; y: number } => p != null && typeof p.x === 'number' && typeof p.y === 'number')
          .map((p) => ({ x: Math.max(0, p.x), y: Math.max(0, p.y) }))
      : [{ x: 0, y: 0 }];
    const validPositions = positions.length > 0 ? positions : [{ x: 0, y: 0 }];

    return {
      click: {
        button: this.validateClickButton(settings.click?.button),
        clickType: settings.click?.clickType === 'double' ? 'double' : 'single',
        interval: Math.max(1, Math.min(60000, settings.click?.interval || 100)),
        repeatCount: Math.max(0, settings.click?.repeatCount || 0),
        holdEnabled: Boolean(settings.click?.holdEnabled),
        holdDurationMs: Math.max(
          1,
          Math.min(60000, settings.click?.holdDurationMs ?? 300)
        ),
        holdUntilOff: Boolean(settings.click?.holdUntilOff),
      },
      position: {
        mode: settings.position?.mode === 'fixed' ? 'fixed' : 'current',
        positions: validPositions,
        clickOrder: settings.position?.clickOrder === 'sequential' ? 'sequential' : 'simultaneous',
      },
      hotkey: {
        toggle: settings.hotkey?.toggle || 'F6',
        pause: settings.hotkey?.pause || 'F7',
      },
    };
  }

  private validateClickButton(button: unknown): 'left' | 'right' | 'middle' {
    if (button === 'left' || button === 'right' || button === 'middle') {
      return button;
    }
    return 'left';
  }
}
