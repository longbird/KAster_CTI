import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(__dirname, 'styles.css'), 'utf8');

describe('admin typography CSS', () => {
  it('does not force every UI element to bold', () => {
    expect(css).not.toContain('#root * {\n  font-weight: 700 !important;\n}');
  });

  it('keeps Korean UI fonts in the sans stack with Windows fallbacks', () => {
    expect(css).toContain("'Noto Sans KR'");
    expect(css).toContain("'Malgun Gothic'");
  });

  it('does not render Korean table headers with the mono font stack', () => {
    expect(css).not.toMatch(/\.ant-table-thead > tr > th\s*\{[^}]*font-family:\s*var\(--font-mono\)/s);
  });

  it('matches the compact dashboard KPI grid to the six KPI cards', () => {
    expect(css).toContain('grid-template-columns: repeat(6, minmax(92px, 1fr));');
  });

  it('keeps compact dashboard KPI cards in two columns on tablet-width screens', () => {
    expect(css).toMatch(/@media \(max-width: 900px\)\s*\{[\s\S]*?\.dashboard-compact__kpi-strip\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  });
});
