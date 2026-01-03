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
    return this.store.get('settings', DEFAULT_SETTINGS);
  }

  saveSettings(settings: AppSettings): void {
    // バリデーション
    const validated = this.validateSettings(settings);
    this.store.set('settings', validated);
  }

  private validateSettings(settings: AppSettings): AppSettings {
    return {
      click: {
        button: this.validateClickButton(settings.click?.button),
        clickType: settings.click?.clickType === 'double' ? 'double' : 'single',
        interval: Math.max(10, Math.min(60000, settings.click?.interval || 100)),
        repeatCount: Math.max(0, settings.click?.repeatCount || 0),
      },
      position: {
        mode: settings.position?.mode === 'fixed' ? 'fixed' : 'current',
        x: Math.max(0, settings.position?.x || 0),
        y: Math.max(0, settings.position?.y || 0),
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
