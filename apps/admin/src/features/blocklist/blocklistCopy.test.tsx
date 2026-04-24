import { describe, expect, it } from 'vitest';

import { BLOCKLIST_COPY } from './blocklistCopy';
import { parseBlocklistImportTextRows } from './BlocklistImportModal';
import { getBlocklistEntryModalTitle } from './BlocklistEntryModal';

describe('BLOCKLIST_COPY', () => {
  it('keeps the blocklist page title aligned with the navigation label', () => {
    expect(BLOCKLIST_COPY.pageTitle).toBe('블랙리스트 관리');
  });

  it('uses blocklist wording for create and edit modal titles', () => {
    expect(BLOCKLIST_COPY.createTitle).toBe('블랙리스트 번호 등록');
    expect(BLOCKLIST_COPY.editTitle).toBe('블랙리스트 번호 수정');
  });
});

describe('blocklist feature copy wiring', () => {
  it('derives modal titles from the shared blocklist copy', () => {
    expect(getBlocklistEntryModalTitle()).toBe(BLOCKLIST_COPY.createTitle);
    expect(getBlocklistEntryModalTitle({ id: '1' } as never)).toBe(BLOCKLIST_COPY.editTitle);
  });
});

describe('blocklist import parsing', () => {
  it('parses phone and reason columns from comma-separated templates', () => {
    expect(parseBlocklistImportTextRows('전화번호,사유\n010-1234-5678,악성 민원')).toEqual([
      { 전화번호: '010-1234-5678', 사유: '악성 민원' },
    ]);
  });
});
