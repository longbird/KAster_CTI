import { BadRequestException } from '@nestjs/common';

/**
 * 기능코드는 자유 생성이 아니라 **고정 카탈로그에 코드 값을 붙이는** 구조다.
 * PBX 는 코드가 "무엇을 하는지" 알아야 동작을 매핑할 수 있으므로, 운영자가 임의의
 * 기능을 만들어낼 수는 없고 지원되는 기능의 코드 값과 활성 여부만 정한다.
 *
 * invocation 이 성격을 가른다.
 * - HANDSET_DIAL: 상담원이 단말에서 눌러 호출한다. dialplan 에 렌더링해야 실제로 동작한다.
 * - SERVER_DTMF : 서버가 PBX 로 보내는 DTMF 다. dialplan 에 렌더링하면 안 된다.
 */
export type FeatureCodeInvocation = 'HANDSET_DIAL' | 'SERVER_DTMF';

export interface FeatureCodeCatalogEntry {
  featureKey: string;
  label: string;
  description: string;
  defaultCode: string | null;
  invocation: FeatureCodeInvocation;
  /** 코드가 비어 있을 때 기능 자체가 비활성인가 */
  optional: boolean;
}

export const FEATURE_CODE_CATALOG: readonly FeatureCodeCatalogEntry[] = [
  {
    featureKey: 'pickup',
    label: '대리응답',
    description: '같은 그룹의 울리는 통화를 단말에서 당겨받는다.',
    defaultCode: '*8',
    invocation: 'HANDSET_DIAL',
    optional: true,
  },
  {
    featureKey: 'attendedTransferComplete',
    label: '상담 전환 완료',
    description: '상담 전환을 마칠 때 서버가 PBX 로 보내는 DTMF 다.',
    defaultCode: '*2',
    invocation: 'SERVER_DTMF',
    optional: false,
  },
  {
    featureKey: 'hold',
    label: '보류',
    description: '보류 시 서버가 보내는 DTMF 다. 비우면 보류 기능이 비활성된다.',
    defaultCode: null,
    invocation: 'SERVER_DTMF',
    optional: true,
  },
  {
    featureKey: 'resume',
    label: '보류 해제',
    description: '보류 해제 시 서버가 보내는 DTMF 다. 비우면 기능이 비활성된다.',
    defaultCode: null,
    invocation: 'SERVER_DTMF',
    optional: true,
  },
] as const;

export const FEATURE_CODE_KEYS = FEATURE_CODE_CATALOG.map((entry) => entry.featureKey);

export function getFeatureCodeCatalogEntry(
  featureKey: string,
): FeatureCodeCatalogEntry | undefined {
  return FEATURE_CODE_CATALOG.find((entry) => entry.featureKey === featureKey);
}

export function isHandsetDialFeature(featureKey: string): boolean {
  return getFeatureCodeCatalogEntry(featureKey)?.invocation === 'HANDSET_DIAL';
}

export function normalizeFeatureCode(raw?: string | null): string | null {
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

// 내선(숫자)·외부 발신 패턴과 섞이지 않도록 * 또는 # 로 시작하게 강제한다.
// 뒤따르는 자리는 숫자/*/# 만 허용해 dialplan 주입을 원천 차단한다.
const FEATURE_CODE_PATTERN = /^[*#][0-9*#]{1,6}$/;

export interface FeatureCodeConflictResources {
  extensions?: string[];
  queueExtens?: string[];
  didNumbers?: string[];
  speedDialCodes?: string[];
}

export function assertFeatureCodeUsable(
  code: string,
  resources: FeatureCodeConflictResources = {},
): void {
  if (!code.startsWith('*') && !code.startsWith('#')) {
    throw new BadRequestException('기능코드는 * 또는 # 로 시작해야 합니다.');
  }
  if (!FEATURE_CODE_PATTERN.test(code)) {
    throw new BadRequestException(
      '기능코드 형식이 올바르지 않습니다. * 또는 # 뒤에 숫자 1~6자리를 입력하세요.',
    );
  }

  const collisions: Array<[string[] | undefined, string]> = [
    [resources.speedDialCodes, '단축 발신 번호'],
    [resources.extensions, '내선 번호'],
    [resources.queueExtens, '호 분배룰 번호'],
    [resources.didNumbers, 'DID 번호'],
  ];

  for (const [values, label] of collisions) {
    if (values?.includes(code)) {
      throw new BadRequestException(`${label}와 겹치는 기능코드입니다: ${code}`);
    }
  }
}
