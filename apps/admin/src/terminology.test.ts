import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('user-facing terminology', () => {
  it('keeps the prompt settings help text on PBX naming', () => {
    const source = readFileSync(resolve(__dirname, 'features/prompt-settings/PromptModal.tsx'), 'utf8');

    expect(source).toContain('PBX에서 `Playback');
    expect(source).not.toContain('Asterisk에서 `Playback');
  });
});
