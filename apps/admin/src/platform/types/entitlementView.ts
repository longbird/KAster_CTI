import dayjs from 'dayjs';
import type { EntitlementHistoryEntry, FeatureEntitlement } from './platform';

/**
 * 자격 화면이 쓰는 순수 표시 로직. 화면 컴포넌트가 이 판단을 안고 있으면 테스트가 안 되고,
 * "잠겨야 하는데 안 잠겼다" 같은 결함이 눈으로만 확인된다.
 */

/**
 * 되돌릴 수 없는 기능(녹취 암호화)을 목록 맨 아래로 내린다.
 * 다른 기능을 켜고 끄는 손이 바로 옆에서 움직이면 실수로 누를 수 있으므로 물리적으로 떼어 놓는다.
 * 같은 무리 안에서는 서버가 준 순서를 그대로 유지한다 — 카탈로그 순서가 진실원이다.
 */
export function sortEntitlementRows(features: FeatureEntitlement[]): FeatureEntitlement[] {
  return [
    ...features.filter((feature) => !feature.irreversible),
    ...features.filter((feature) => feature.irreversible),
  ];
}

export interface EntitlementSwitchState {
  checked: boolean;
  /** true 면 스위치를 아예 만질 수 없다. */
  locked: boolean;
  /** 왜 잠겼는지. 잠기지 않았으면 null. */
  lockReason: string | null;
}

export const IRREVERSIBLE_LOCK_REASON =
  '한 번 켠 뒤에는 끌 수 없는 기능입니다. 이미 암호화된 녹취를 나중에 읽지 못하게 되는 것을 막기 위해, 서버도 끄기 요청을 거부합니다.';

/**
 * 스위치의 표시 상태. 되돌릴 수 없는 기능이 **이미 켜져 있으면** 잠근다 —
 * 서버가 409 로 거부할 조작을 화면에서 시도조차 못 하게 한다.
 */
export function entitlementSwitchState(feature: FeatureEntitlement): EntitlementSwitchState {
  const locked = feature.irreversible && feature.enabled;
  return {
    checked: feature.enabled,
    locked,
    lockReason: locked ? IRREVERSIBLE_LOCK_REASON : null,
  };
}

/**
 * 이 조작에 `acknowledgeIrreversible` 확인이 필요한가.
 * 되돌릴 수 없는 기능을 **켜는** 순간에만 필요하다. 끄기는 애초에 잠겨 있고, 되돌릴 수 있는
 * 기능은 확인을 요구하지 않는다 — 매번 물으면 확인 대화상자가 의미를 잃는다.
 */
export function needsIrreversibleAck(feature: FeatureEntitlement, nextEnabled: boolean): boolean {
  return feature.irreversible && nextEnabled;
}

/** 현재 값이 어디서 왔는지. 기본값이면 그 사실을 드러내야 "안 건드렸다" 를 알 수 있다. */
export function describeEntitlementSource(feature: FeatureEntitlement): string {
  if (feature.source === 'row') return '개별 설정';
  return `기본값 (${feature.defaultEnabled ? '허용' : '차단'})`;
}

function enabledLabel(enabled: boolean): string {
  return enabled ? '허용' : '차단';
}

/**
 * 이력 한 줄의 변경 내용. 이전 값이 없으면(첫 변경) '기본값' 으로 적는다 —
 * 여기에 '차단' 을 넣으면 실제로는 기본 허용이던 기능이 차단이었던 것처럼 보인다.
 */
export function formatEntitlementChange(
  beforeEnabled: boolean | null | undefined,
  afterEnabled: boolean,
): string {
  const before = beforeEnabled === null || beforeEnabled === undefined ? '기본값' : enabledLabel(beforeEnabled);
  return `${before} → ${enabledLabel(afterEnabled)}`;
}

/** 목록·이력에서 쓰는 공통 시각 표기. 값이 없으면 '-' 로 자리를 지킨다. */
export function formatPlatformDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm') : '-';
}

/** 이력의 기능 키를 화면 이름으로 바꾼다. 카탈로그에서 사라진 키는 키 자체를 보여줘 흔적을 남긴다. */
export function historyFeatureLabel(
  entry: EntitlementHistoryEntry,
  features: FeatureEntitlement[],
): string {
  return features.find((feature) => feature.key === entry.featureKey)?.name ?? entry.featureKey;
}
