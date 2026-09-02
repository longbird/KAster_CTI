export interface ConfigValidationCheck {
  name: string;
  status: 'pass' | 'fail';
  detail: string;
}

export interface ConfigValidationResult {
  checks: ConfigValidationCheck[];
}

export interface ConfigDiffEntry {
  fileName: string;
  status: 'changed' | 'unchanged' | 'missing-current';
  addedLines: number;
  removedLines: number;
}

export interface ApplyGateInput {
  /** 관리자가 변경 내역을 실제로 펼쳐 봤는가. */
  reviewed: boolean;
  diff: ConfigDiffEntry[] | null;
  validation: ConfigValidationResult | null;
  canOperate: boolean;
}

export interface ApplyGate {
  canApply: boolean;
  /** 적용할 수 없는 이유. 적용 가능하면 null. */
  reason: string | null;
}

/**
 * 적용 버튼을 열지 말지 정한다.
 *
 * PBX 설정은 통화가 오가는 중에 `/etc/asterisk` 를 덮고 reload 한다. 무엇이 바뀌는지
 * 모르고 누르면 안 되므로, **변경 내역을 펼쳐 본 뒤에만** 연다.
 * 서버가 최종 방어선이지만(렌더 가드), 화면에서 먼저 막아야 실수 자체가 줄어든다.
 */
export function resolveApplyGate(input: ApplyGateInput): ApplyGate {
  // 권한이 가장 먼저다. 권한이 없는 사람에게 "먼저 확인하세요" 라고 하면 안내가 틀린다.
  if (!input.canOperate) {
    return { canApply: false, reason: 'PBX 설정을 적용할 권한이 없습니다.' };
  }

  if (!input.diff || !input.validation) {
    return { canApply: false, reason: '변경 내역을 아직 불러오지 못했습니다.' };
  }

  const failed = input.validation.checks.filter((check) => check.status === 'fail');
  if (failed.length > 0) {
    return {
      canApply: false,
      reason: `검증에 실패한 항목이 있습니다: ${failed.map((check) => check.detail || check.name).join(' / ')}`,
    };
  }

  if (!input.diff.some((entry) => entry.status !== 'unchanged')) {
    return { canApply: false, reason: '바뀌는 파일이 없습니다.' };
  }

  if (!input.reviewed) {
    return { canApply: false, reason: '변경 내역을 먼저 확인하세요.' };
  }

  return { canApply: true, reason: null };
}

/** 버튼 옆에 한 줄로 보여줄 요약. */
export function describeDiffSummary(diff: ConfigDiffEntry[] | null): string {
  if (!diff) return '';

  const changed = diff.filter((entry) => entry.status !== 'unchanged');
  if (changed.length === 0) return '바뀌는 파일이 없습니다';

  const added = changed.reduce((sum, entry) => sum + entry.addedLines, 0);
  const removed = changed.reduce((sum, entry) => sum + entry.removedLines, 0);
  return `${changed.length}개 파일 변경 · +${added} / -${removed}`;
}

export interface ConfigDiffResponse {
  validation: ConfigValidationResult;
  diff: ConfigDiffEntry[];
  hasChanges: boolean;
}

/**
 * 파일 한 줄의 증감 표기.
 *
 * `+0/-0` 인데 "변경" 인 경우가 있다 — 줄 집합은 같고 공백이나 **순서**만 다른 경우다.
 * dialplan 에서 순서는 의미가 있으므로 "동일" 로 뭉개지 않고, 무엇이 다른지 그대로 말한다.
 */
export function describeLineDelta(entry: ConfigDiffEntry): string {
  if (entry.status === 'unchanged') return '-';
  if (entry.addedLines === 0 && entry.removedLines === 0) return '순서·공백만 다름';
  return `+${entry.addedLines} / -${entry.removedLines}`;
}
