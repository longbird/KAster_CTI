import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('desktop renderer styles', () => {
  it('keeps native status select options readable on Windows', () => {
    const source = readFileSync(join(__dirname, 'styles.css'), 'utf8');

    expect(source).toMatch(/\.agent-status-select option\s*{[\s\S]*background:\s*#ffffff/);
    expect(source).toMatch(/\.agent-status-select option\s*{[\s\S]*color:\s*#111827/);
  });
});
