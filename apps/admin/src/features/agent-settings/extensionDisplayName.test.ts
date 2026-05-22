import { describe, expect, it } from 'vitest';
import { formatExtensionDisplayName } from './extensionDisplayName';

describe('formatExtensionDisplayName', () => {
  it('uses the configured extension display name when it differs from the agent name', () => {
    expect(
      formatExtensionDisplayName({
        agentName: '홍길동',
        extension: '1001',
        extensionDisplayName: '본사 1번 데스크',
      }),
    ).toBe('본사 1번 데스크');
  });

  it('falls back to agent name and extension when extension display name is blank', () => {
    expect(
      formatExtensionDisplayName({
        agentName: '홍길동',
        extension: '1001',
        extensionDisplayName: '   ',
      }),
    ).toBe('홍길동 / 1001');
  });
});
