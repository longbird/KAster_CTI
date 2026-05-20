import { describe, expect, it } from 'vitest';
import { resolveHelp } from './featureHelp';
import type { FeatureHelpData } from './types';

const data: FeatureHelpData = {
  'a.approved': {
    featureKey: 'a.approved',
    title: 'A',
    summary: 's',
    howTo: [],
    examples: [],
    warnings: [],
    relatedRoutes: [],
    sources: [],
    reviewStatus: 'APPROVED',
    updatedAt: '2026-05-19',
  },
  'b.draft': {
    featureKey: 'b.draft',
    title: 'B',
    summary: 's',
    howTo: [],
    examples: [],
    warnings: [],
    relatedRoutes: [],
    sources: [],
    reviewStatus: 'AUTO_DRAFT',
    updatedAt: '2026-05-19',
  },
};

describe('resolveHelp', () => {
  it('APPROVED 키는 ready 로 반환한다', () => {
    expect(resolveHelp(data, 'a.approved', false)).toMatchObject({ status: 'ready' });
  });

  it('AUTO_DRAFT 키는 내부 검토 모드가 아니면 draft-pending', () => {
    expect(resolveHelp(data, 'b.draft', false)).toEqual({ status: 'draft-pending' });
  });

  it('AUTO_DRAFT 키는 내부 검토 모드면 ready', () => {
    expect(resolveHelp(data, 'b.draft', true)).toMatchObject({ status: 'ready' });
  });

  it('없는 키는 missing', () => {
    expect(resolveHelp(data, 'x.none', true)).toEqual({ status: 'missing' });
  });
});
