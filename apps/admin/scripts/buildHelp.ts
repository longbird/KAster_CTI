import type { FeatureHelpData, FeatureHelpEntry } from '../src/shared/help/types';

export interface ScreenFile {
  mmcCode: string;
  label: string;
}

export function parseScreenFilename(name: string): ScreenFile | null {
  const match = /^MMC\s+(\d+)_(.+)\.png$/i.exec(name.trim());
  if (!match) return null;
  return { mmcCode: match[1], label: match[2].trim() };
}

export function mergeHelpEntries(
  curated: FeatureHelpData,
  drafts: FeatureHelpData,
): FeatureHelpData {
  const merged: FeatureHelpData = { ...curated };
  for (const [key, draft] of Object.entries(drafts)) {
    const existing = merged[key];
    if (existing?.reviewStatus === 'APPROVED') continue;
    merged[key] = draft;
  }
  return merged;
}

export function validateHelpEntry(entry: FeatureHelpEntry): string[] {
  const errors: string[] = [];
  if (!entry.featureKey) errors.push('featureKey 가 비어 있습니다');
  if (!entry.title) errors.push('title 이 비어 있습니다');
  if (!entry.summary) errors.push('summary 가 비어 있습니다');
  if (entry.sources.length === 0) errors.push('출처가 비어 있습니다');
  for (const source of entry.sources) {
    if (source.kind === 'search' && !source.retrievedAt) {
      errors.push(`search 출처에는 retrievedAt 이 필요합니다: ${source.ref}`);
    }
  }
  return errors;
}

export function screenFilesToDrafts(files: ScreenFile[], today: string): FeatureHelpData {
  const out: FeatureHelpData = {};
  for (const file of files) {
    const key = `mmc.${file.mmcCode}`;
    out[key] = {
      featureKey: key,
      title: file.label,
      summary: `삼성 PBX 설정화면 MMC ${file.mmcCode} (${file.label}) 자동 추출 초안입니다.`,
      howTo: [],
      examples: [],
      warnings: ['자동 생성된 초안입니다. 검토 후 APPROVED 로 전환하세요.'],
      relatedRoutes: [],
      sources: [{ kind: 'screen', ref: `3_DM_설정화면/MMC ${file.mmcCode}_${file.label}.png` }],
      reviewStatus: 'AUTO_DRAFT',
      updatedAt: today,
    };
  }
  return out;
}
