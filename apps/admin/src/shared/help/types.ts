export type HelpReviewStatus = 'AUTO_DRAFT' | 'APPROVED';

export type HelpSourceKind = 'manual' | 'spec' | 'screen' | 'search';

export interface HelpSource {
  kind: HelpSourceKind;
  /** 파일 경로, 문서명, 또는 URL */
  ref: string;
  /** kind === 'search' 이면 필수. 검색 수행일(ISO 날짜). */
  retrievedAt?: string;
}

export interface HelpRelatedRoute {
  /** 관리자 라우트 경로. 예: '/settings/branches' */
  route: string;
  label: string;
}

export interface FeatureHelpEntry {
  /** 라우트+기능명 조합 키. 예: 'branch.inboundPolicy' */
  featureKey: string;
  title: string;
  summary: string;
  howTo: string[];
  examples: string[];
  warnings: string[];
  relatedRoutes: HelpRelatedRoute[];
  sources: HelpSource[];
  reviewStatus: HelpReviewStatus;
  /** 마지막 갱신일(ISO 날짜) */
  updatedAt: string;
}

export type FeatureHelpData = Record<string, FeatureHelpEntry>;
