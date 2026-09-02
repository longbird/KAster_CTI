/**
 * 테넌트 기능 자격(entitlement) 카탈로그.
 *
 * 이 파일이 **기능의 진실원**이다. 판정 서비스도, 화면도, 플랫폼 관리자 API 도 여기만 본다.
 * 판정 로직은 특정 기능 키 이름을 알아서는 안 된다 — 성질은 전부 여기 속성으로 적는다.
 *
 * 기능 키는 메뉴 키와 별개다. 기능과 메뉴가 1:1 이 아니기 때문이다:
 *   - 녹취 암호화는 메뉴가 없다 (동작이다)
 *   - AI 인사이트는 추이 화면 **안의 탭**이다
 *   - 통화 AI 분석은 메뉴 여러 개에 걸친다
 */
export const FEATURE_KEYS = [
  'call-analysis',
  'ai-insights',
  'ars-flow-builder',
  'recording-encryption',
  'packet-capture',
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export interface FeatureDefinition {
  key: FeatureKey;
  /** 플랫폼 관리자 화면에 보이는 이름 */
  name: string;
  description: string;
  /**
   * 자격 행이 없을 때의 판정.
   * 이미 운영 중이던 기능은 배포 한 번으로 사라지면 안 되므로 허용,
   * 새로 만든 기능은 계약 전까지 차단이다.
   */
  defaultEnabled: boolean;
  /** 자격이 없을 때 감출 메뉴 키. `MENU_KEYS` 의 부분집합이어야 한다. */
  menuKeys: string[];
  /**
   * 한 번 켜면 끌 수 없다.
   *
   * 녹취 암호화가 그렇다 — 암호화는 평문을 지우므로, 껐다 켜는 것은 되돌리기가 아니라
   * 암호문과 평문이 섞인 저장소를 만드는 일이다. 그리고 "지금 꺼져 있으니 키도 필요 없겠지"
   * 하고 키를 치우면 그 전 녹취를 영구히 읽을 수 없다 (보존 기본 1095일).
   */
  irreversible: boolean;
}

export const FEATURE_CATALOG: Record<FeatureKey, FeatureDefinition> = {
  'call-analysis': {
    key: 'call-analysis',
    name: '통화 AI 분석',
    description: '녹취를 전사해 요약·감정·상담분류를 만든다. 통화 이력의 AI 분석과 상담분류 관리가 열린다.',
    defaultEnabled: false,
    menuKeys: ['settings/consult-categories'],
    irreversible: false,
  },
  'ai-insights': {
    key: 'ai-insights',
    name: 'AI 인사이트 대시보드',
    description: '추이 화면에 감정 추이·상담 주제 분포·급상승 키워드 탭이 열린다. 통화 AI 분석 결과를 쓴다.',
    defaultEnabled: false,
    menuKeys: [],
    irreversible: false,
  },
  'ars-flow-builder': {
    key: 'ars-flow-builder',
    name: 'ARS 플로우 빌더',
    description: '다단계 ARS 시나리오를 그래프로 만들고 PBX dialplan 으로 컴파일한다.',
    defaultEnabled: false,
    menuKeys: ['settings/ars-flows'],
    irreversible: false,
  },
  'recording-encryption': {
    key: 'recording-encryption',
    name: '녹취 암호화',
    description:
      '새로 확정되는 녹취를 AES-256-GCM 으로 암호화한다. '
      + '한 번 켜면 되돌릴 수 없다 — 켠 뒤에는 암호화 키를 절대 잃어서는 안 된다.',
    defaultEnabled: false,
    menuKeys: [],
    irreversible: true,
  },
  'packet-capture': {
    key: 'packet-capture',
    name: '패킷 캡처',
    description: '관리자가 SIP/RTP 패킷을 캡처해 내려받는다. 서버 env 와 테넌트 토글이 함께 켜져 있어야 동작한다.',
    defaultEnabled: true,
    menuKeys: ['system/packet-capture'],
    irreversible: false,
  },
};

export function isFeatureKey(value: unknown): value is FeatureKey {
  return typeof value === 'string' && (FEATURE_KEYS as readonly string[]).includes(value);
}

export function getFeature(key: FeatureKey): FeatureDefinition {
  const feature = FEATURE_CATALOG[key];
  if (!feature) {
    throw new Error(`unknown feature key: ${key}`);
  }
  return feature;
}

export function defaultEnabledMap(): Record<FeatureKey, boolean> {
  return Object.fromEntries(
    FEATURE_KEYS.map((key) => [key, FEATURE_CATALOG[key].defaultEnabled]),
  ) as Record<FeatureKey, boolean>;
}

/**
 * 자격이 없는 기능들이 감추는 메뉴 키.
 * 화면이 스스로 판단하지 않도록, 서버가 이 목록으로 `allowedPaths` 에서 빼 준다.
 */
export function menuKeysHiddenBy(disabledFeatureKeys: string[]): string[] {
  const hidden = new Set<string>();
  for (const key of disabledFeatureKeys) {
    if (!isFeatureKey(key)) continue;
    for (const menuKey of FEATURE_CATALOG[key].menuKeys) hidden.add(menuKey);
  }
  return [...hidden];
}
