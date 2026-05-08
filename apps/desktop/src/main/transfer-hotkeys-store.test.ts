import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TransferHotkeysStore, normalizeSlots } from './transfer-hotkeys-store';

function makeTempDir() {
  return mkdtempSync(join(tmpdir(), 'kaster-transfer-hotkeys-'));
}

describe('normalizeSlots', () => {
  it('drops entries without target', () => {
    expect(
      normalizeSlots([
        { slot: 1, target: '', label: 'empty', mode: 'blind' },
        { slot: 2, target: '2001', label: 'ok', mode: 'blind' },
      ]),
    ).toEqual([{ slot: 2, target: '2001', label: 'ok', mode: 'blind' }]);
  });

  it('clamps slot to 1~9 and dedupes by slot', () => {
    const result = normalizeSlots([
      { slot: 0, target: '1001', label: 'A', mode: 'blind' },
      { slot: 1, target: '1002', label: 'B', mode: 'blind' },
      { slot: 99, target: '1003', label: 'C', mode: 'attended' },
    ]);
    expect(result).toEqual([
      { slot: 1, target: '1001', label: 'A', mode: 'blind' },
      { slot: 9, target: '1003', label: 'C', mode: 'attended' },
    ]);
  });

  it('falls back label to target when label is empty', () => {
    expect(
      normalizeSlots([{ slot: 3, target: '2001', label: '', mode: 'blind' }]),
    ).toEqual([{ slot: 3, target: '2001', label: '2001', mode: 'blind' }]);
  });

  it('forces mode to blind when invalid', () => {
    expect(
      normalizeSlots([{ slot: 4, target: '2002', label: 'x', mode: 'whatever' as any }]),
    ).toEqual([{ slot: 4, target: '2002', label: 'x', mode: 'blind' }]);
  });
});

describe('TransferHotkeysStore', () => {
  it('returns empty array when file missing', async () => {
    const dir = makeTempDir();
    try {
      const store = new TransferHotkeysStore(dir);
      expect(await store.load()).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('persists and reloads slots', async () => {
    const dir = makeTempDir();
    try {
      const store = new TransferHotkeysStore(dir);
      const saved = await store.save([
        { slot: 2, target: '2001', label: '팀장', mode: 'attended' },
        { slot: 1, target: '1001', label: '동료', mode: 'blind' },
      ]);
      expect(saved.map((s) => s.slot)).toEqual([1, 2]);
      const loaded = await store.load();
      expect(loaded).toEqual(saved);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
