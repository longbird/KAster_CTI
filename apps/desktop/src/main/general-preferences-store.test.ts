import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DEFAULT_GENERAL_PREFERENCES,
  GeneralPreferencesStore,
  normalizeGeneralPreferences,
} from './general-preferences-store';

function makeTempDir() {
  return mkdtempSync(join(tmpdir(), 'kaster-gen-prefs-'));
}

describe('GeneralPreferencesStore', () => {
  it('returns defaults when file does not exist', async () => {
    const dir = makeTempDir();
    try {
      const store = new GeneralPreferencesStore(dir);
      const result = await store.load();
      expect(result).toEqual(DEFAULT_GENERAL_PREFERENCES);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('round-trips a saved value', async () => {
    const dir = makeTempDir();
    try {
      const store = new GeneralPreferencesStore(dir);
      const saved = await store.save({
        autoStart: true,
        autoLogin: false,
        alwaysOnTop: true,
        closeToTray: false,
        ringTonePresetId: 'urgent',
        themeMode: 'dark',
      });
      expect(saved.autoStart).toBe(true);
      expect(saved.autoLogin).toBe(false);
      expect(saved.ringTonePresetId).toBe('urgent');

      const loaded = await store.load();
      expect(loaded).toEqual(saved);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('falls back to defaults for unknown ring tone preset and non-bool fields', async () => {
    const dir = makeTempDir();
    try {
      writeFileSync(
        join(dir, 'general-preferences.json'),
        JSON.stringify({
          autoStart: 'yes',
          autoLogin: null,
          alwaysOnTop: 1,
          closeToTray: 'truthy',
          ringTonePresetId: 'evil-tone',
          themeMode: 'neon',
        }),
        'utf8',
      );
      const store = new GeneralPreferencesStore(dir);
      const loaded = await store.load();
      expect(loaded).toEqual(DEFAULT_GENERAL_PREFERENCES);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('normalize merges partial input with defaults', () => {
    const merged = normalizeGeneralPreferences({ autoStart: true });
    expect(merged).toEqual({
      ...DEFAULT_GENERAL_PREFERENCES,
      autoStart: true,
    });
  });
});
