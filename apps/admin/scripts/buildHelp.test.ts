import { describe, expect, it } from 'vitest';
import { parseScreenFilename, mergeHelpEntries, validateHelpEntry } from './buildHelp';
import type { FeatureHelpEntry } from '../src/shared/help/types';

const approved: FeatureHelpEntry = {
  featureKey: 'system.timeSync',
  title: '시간 동기화',
  summary: 's',
  howTo: [],
  examples: [],
  warnings: [],
  relatedRoutes: [],
  sources: [{ kind: 'manual', ref: 'm' }],
  reviewStatus: 'APPROVED',
  updatedAt: '2026-05-19',
};

describe('parseScreenFilename', () => {
  it('MMC 설정화면 파일명을 코드와 라벨로 분리한다', () => {
    expect(parseScreenFilename('MMC 100_내선잠금.png')).toEqual({
      mmcCode: '100',
      label: '내선잠금',
    });
  });

  it('형식이 안 맞으면 null', () => {
    expect(parseScreenFilename('readme.txt')).toBeNull();
  });
});

describe('mergeHelpEntries', () => {
  it('APPROVED curated 항목은 같은 키 초안으로 덮어쓰지 않는다', () => {
    const draft: FeatureHelpEntry = { ...approved, summary: '초안', reviewStatus: 'AUTO_DRAFT' };
    const merged = mergeHelpEntries({ 'system.timeSync': approved }, { 'system.timeSync': draft });
    expect(merged['system.timeSync'].summary).toBe('s');
    expect(merged['system.timeSync'].reviewStatus).toBe('APPROVED');
  });

  it('curated 에 없는 키 초안은 AUTO_DRAFT 로 추가한다', () => {
    const draft: FeatureHelpEntry = { ...approved, featureKey: 'mmc.100', reviewStatus: 'AUTO_DRAFT' };
    const merged = mergeHelpEntries({ 'system.timeSync': approved }, { 'mmc.100': draft });
    expect(Object.keys(merged).sort()).toEqual(['mmc.100', 'system.timeSync']);
  });
});

describe('validateHelpEntry', () => {
  it('정상 항목은 빈 오류 배열', () => {
    expect(validateHelpEntry(approved)).toEqual([]);
  });

  it('search 출처에 retrievedAt 이 없으면 오류', () => {
    const bad: FeatureHelpEntry = {
      ...approved,
      sources: [{ kind: 'search', ref: 'https://e.com' }],
    };
    expect(validateHelpEntry(bad)).toContain('search 출처에는 retrievedAt 이 필요합니다: https://e.com');
  });

  it('출처가 없으면 오류', () => {
    expect(validateHelpEntry({ ...approved, sources: [] })).toContain('출처가 비어 있습니다');
  });
});
