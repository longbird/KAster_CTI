import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { DesktopTransferHotkeySlot } from '../shared/ipc';

const MIN_SLOT = 1;
const MAX_SLOT = 9;
const MAX_LABEL = 20;
const MAX_TARGET = 32;

function clamp(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function sanitizeText(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.replace(/[\r\n]/g, '').trim().slice(0, maxLen);
}

export function normalizeSlots(input: unknown): DesktopTransferHotkeySlot[] {
  if (!Array.isArray(input)) {
    return [];
  }
  const seen = new Set<number>();
  const result: DesktopTransferHotkeySlot[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') {
      continue;
    }
    const r = raw as Partial<DesktopTransferHotkeySlot>;
    const slot = clamp(r.slot, MIN_SLOT, MAX_SLOT);
    if (seen.has(slot)) {
      continue;
    }
    const target = sanitizeText(r.target, MAX_TARGET);
    if (!target) {
      continue;
    }
    seen.add(slot);
    result.push({
      slot,
      label: sanitizeText(r.label, MAX_LABEL) || target,
      target,
      mode: r.mode === 'attended' ? 'attended' : 'blind',
    });
  }
  result.sort((a, b) => a.slot - b.slot);
  return result;
}

export class TransferHotkeysStore {
  private readonly filePath: string;

  constructor(private readonly userDataDir: string) {
    this.filePath = join(userDataDir, 'transfer-hotkeys.json');
  }

  async load(): Promise<DesktopTransferHotkeySlot[]> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      return normalizeSlots(JSON.parse(raw));
    } catch (error: unknown) {
      if (typeof error === 'object' && error && 'code' in error && error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  async save(input: DesktopTransferHotkeySlot[]): Promise<DesktopTransferHotkeySlot[]> {
    const next = normalizeSlots(input);
    await mkdir(this.userDataDir, { recursive: true });
    await writeFile(this.filePath, JSON.stringify(next, null, 2), 'utf8');
    return next;
  }
}
