import { describe, expect, it } from 'vitest';
import { EXTENSION_LOCK_MODE_OPTIONS, getExtensionLockModeLabel } from './extensionPolicy';

describe('extensionPolicy', () => {
  it('exposes the three PBX extension lock modes', () => {
    expect(EXTENSION_LOCK_MODE_OPTIONS.map((item) => item.value)).toEqual([
      'UNLOCKED',
      'OUTBOUND_LOCKED',
      'FULL_LOCKED',
    ]);
  });

  it('formats extension lock mode labels for tables', () => {
    expect(getExtensionLockModeLabel('OUTBOUND_LOCKED')).toBe('외부발신 잠금');
    expect(getExtensionLockModeLabel(null)).toBe('미잠금');
  });
});
