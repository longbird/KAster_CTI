import rawData from './pbxFeatureHelp.generated.json';
import type { FeatureHelpData, FeatureHelpEntry } from './types';

const helpData = rawData as FeatureHelpData;

export interface HelpResolution {
  status: 'ready' | 'draft-pending' | 'missing';
  entry?: FeatureHelpEntry;
}

export function resolveHelp(
  data: FeatureHelpData,
  featureKey: string,
  internalReview: boolean,
): HelpResolution {
  const entry = data[featureKey];
  if (!entry) return { status: 'missing' };
  if (entry.reviewStatus === 'APPROVED') return { status: 'ready', entry };
  return internalReview ? { status: 'ready', entry } : { status: 'draft-pending' };
}

export function isInternalHelpReview(): boolean {
  return import.meta.env.VITE_HELP_INTERNAL_REVIEW === 'true';
}

export function resolveFeatureHelp(featureKey: string): HelpResolution {
  return resolveHelp(helpData, featureKey, isInternalHelpReview());
}
