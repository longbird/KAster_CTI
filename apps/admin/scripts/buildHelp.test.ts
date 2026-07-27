import { describe, expect, it } from 'vitest';
import {
  parseScreenFilename,
  mergeHelpEntries,
  validateHelpEntry,
  sourceRecordsToDrafts,
  sourceTextToDrafts,
} from './buildHelp';
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

describe('sourceRecordsToDrafts', () => {
  it('원천 매핑 레코드를 AUTO_DRAFT 도움말 항목으로 변환한다', () => {
    const drafts = sourceRecordsToDrafts(
      [
        {
          featureKey: 'integration.automation',
          title: '외부 자동화',
          summary: 'Webhook/VIX 자동화 대상 설정',
          howTo: ['자동화 대상을 등록합니다.'],
          examples: ['통화 종료 이벤트를 Webhook으로 전송합니다.'],
          warnings: ['외부 URL은 운영 방화벽에서 허용되어야 합니다.'],
          relatedRoutes: [{ route: '/integrations', label: '연동' }],
          sources: [
            { kind: 'spec', ref: 'pbx-selected-features-development-plan-20260514.md' },
            { kind: 'search', ref: 'https://example.com/webhook', retrievedAt: '2026-05-21' },
          ],
        },
      ],
      '2026-05-21',
    );

    expect(drafts['integration.automation']).toMatchObject({
      featureKey: 'integration.automation',
      title: '외부 자동화',
      reviewStatus: 'AUTO_DRAFT',
      updatedAt: '2026-05-21',
    });
    expect(drafts['integration.automation'].sources).toHaveLength(2);
  });
});

describe('sourceTextToDrafts', () => {
  it('매뉴얼/엑셀 텍스트에서 MMC 코드와 화면 파일명을 매칭해 초안을 만든다', () => {
    const drafts = sourceTextToDrafts(
      [{ mmcCode: '102', label: '착신전환' }],
      '사용자는 MMC 102 착신전환 메뉴에서 무조건 전환과 무응답 전환을 설정한다.',
      'manual',
      'manual.pdf',
      '2026-07-16',
    );

    expect(drafts['mmc.102']).toMatchObject({
      featureKey: 'mmc.102',
      title: '착신전환',
      reviewStatus: 'AUTO_DRAFT',
      sources: [{ kind: 'manual', ref: 'manual.pdf' }],
    });
    expect(drafts['mmc.102'].howTo[0]).toContain('무조건 전환');
  });

  it('관련 텍스트가 없으면 초안을 만들지 않는다', () => {
    expect(
      sourceTextToDrafts(
        [{ mmcCode: '999', label: '없는기능' }],
        '다른 기능 설명',
        'spreadsheet',
        'draft.xlsx',
        '2026-07-16',
      ),
    ).toEqual({});
  });
});
