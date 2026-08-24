/**
 * 이 노드가 `ASTERISK_CONF_DIR` 에 써도 되는지 판정한다.
 *
 * 한 호스트에 서버 컨테이너가 둘 이상 뜨고 같은 `/etc/asterisk` 를 마운트하면, 나중에
 * 부팅한 쪽이 <b>자기 테넌트 기준으로 렌더링해 남의 설정을 덮어쓴다.</b> 리허설 컨테이너가
 * 재시작할 때마다 운영 pjsip.conf 가 9,220 -> 1,678 바이트로 줄었고, 내선 endpoint 가
 * 통째로 사라져 전화기가 등록을 잃었다 (2026-08-24, 재시작 12회).
 *
 * `ASTERISK_CONF_OWNER_ID` 와 마커 파일은 그때도 이미 있었지만 <b>런타임에서 아무도 읽지
 * 않았다</b> — 검사는 `scripts/deploy-prod.sh` 의 배포 시점에만 있었다. 컨테이너는 배포와
 * 무관하게 재시작하므로 그 검사로는 막을 수 없다.
 */
export const CONFIG_OWNER_MARKER_FILENAME = '.kaster-cti-config-owner';

export type ConfigOwnershipDecision =
  /** 마커가 없다. 우리 것으로 표시하고 쓴다. */
  | { action: 'claim'; ownerId: string; reason: string }
  /** 우리 것이거나, 소유권을 따지지 않는 구성이다. */
  | { action: 'proceed'; reason: string }
  /** 남의 것이다. 쓰지 않는다. */
  | { action: 'refuse'; reason: string };

export interface ConfigOwnershipInput {
  /** 마커 파일 내용. 파일이 없으면 null. */
  marker: string | null;
  /** `ASTERISK_CONF_OWNER_ID`. 비우면 소유권 검사를 하지 않는다. */
  ownerId: string | null | undefined;
  /** `ASTERISK_CONF_ALLOW_SHARED_WRITE`. 여러 노드가 한 디렉터리를 공유하는 구성의 명시적 opt-in. */
  allowSharedWrite: boolean;
}

export function decideConfigOwnership(input: ConfigOwnershipInput): ConfigOwnershipDecision {
  const ownerId = input.ownerId?.trim() || null;
  const marker = input.marker?.trim() || null;

  // 소유자 ID 를 안 준 현장은 예전과 똑같이 동작한다. 가드를 넣으면서 기존 배포를 깨지 않는다.
  if (!ownerId) {
    return { action: 'proceed', reason: 'ASTERISK_CONF_OWNER_ID 미설정 — 소유권 검사 안 함' };
  }

  if (!marker) {
    return {
      action: 'claim',
      ownerId,
      reason: `소유자 마커가 없어 '${ownerId}' 로 표시한다`,
    };
  }

  if (marker === ownerId) {
    return { action: 'proceed', reason: `소유자 일치 (${ownerId})` };
  }

  // 공유 쓰기를 명시적으로 켠 현장만 통과시킨다. 기본값은 거부다 — 조용히 덮어쓰는 것보다
  // 설정이 낡은 채로 남는 편이 낫다. 낡은 설정은 통화를 이어가지만, 덮어쓴 설정은 끊는다.
  if (input.allowSharedWrite) {
    return {
      action: 'proceed',
      reason: `소유자 불일치(마커=${marker}, 나=${ownerId})지만 ASTERISK_CONF_ALLOW_SHARED_WRITE=true`,
    };
  }

  return {
    action: 'refuse',
    reason:
      `이 디렉터리는 '${marker}' 가 소유한다 (나=${ownerId}). 설정을 쓰지 않는다. `
      + `다른 노드가 같은 ASTERISK_CONF_DIR 를 마운트했는지 확인하고, 이 노드가 주인이 맞으면 `
      + `마커 파일(${CONFIG_OWNER_MARKER_FILENAME})을 '${ownerId}' 로 바꾼다.`,
  };
}
