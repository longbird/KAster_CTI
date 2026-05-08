import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CallPreferencesStore } from './call-preferences-store';

function makeTempDir() {
  return mkdtempSync(join(tmpdir(), 'kaster-call-prefs-'));
}

describe('CallPreferencesStore', () => {
  it('returns defaults when file does not exist', async () => {
    const dir = makeTempDir();
    try {
      const store = new CallPreferencesStore(dir);
      const result = await store.load();
      expect(result).toEqual({
        autoAnswerSeconds: 0,
        autoRejectSeconds: 0,
        autoStatusAfterCallSeconds: 0,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('clamps out-of-range values on save', async () => {
    const dir = makeTempDir();
    try {
      const store = new CallPreferencesStore(dir);
      const saved = await store.save({
        autoAnswerSeconds: 999,
        autoRejectSeconds: -5,
        autoStatusAfterCallSeconds: 30,
      });
      expect(saved).toEqual({
        autoAnswerSeconds: 60,
        autoRejectSeconds: 0,
        autoStatusAfterCallSeconds: 30,
      });
      const loaded = await store.load();
      expect(loaded).toEqual(saved);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
