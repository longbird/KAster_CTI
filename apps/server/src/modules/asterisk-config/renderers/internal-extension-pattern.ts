/**
 * 실제 내선 목록에서 "내선 통화" dialplan 패턴을 만든다.
 *
 * 예전에는 `_[12]XXX` 가 렌더러에 박혀 있어 1000~2999 만 내선으로 인식했다. 3301 번대를
 * 쓰는 현장에서는 전화기끼리 서로 걸면 어떤 패턴에도 걸리지 않아 호가 즉시 끊겼고,
 * 단말에는 "수신거부" 로만 보였다 (2026-08-24). 대역을 코드가 정하면 현장이 대역을
 * 바꿀 때마다 같은 증상이 조용히 재발한다.
 *
 * `transfer-target` 컨텍스트는 이미 자릿수 기준(`LEN <= 4`)으로 내선을 가리고 있었다.
 * 여기서도 같은 생각으로, 자릿수별로 묶고 첫 자리 집합만 문자 클래스로 연다.
 * 내선 1001·1002·2001·3301~3304 -> `_[123]XXX` 하나.
 */

/**
 * 자릿수 -> 그 자릿수 내선들의 첫 자리 집합.
 *
 * 0 으로 시작하는 내선은 뺀다. 외부 발신 패턴(`_0X.`, `_00.`)과 같은 자리를 다투게 되어
 * 어느 쪽이 이길지 읽는 사람이 알 수 없다. 그런 내선은 지금도 걸리지 않으므로 새로
 * 깨지는 것은 없다.
 */
function groupFirstDigitsByLength(extensions: readonly string[]): Map<number, Set<string>> {
  const byLength = new Map<number, Set<string>>();

  for (const raw of extensions) {
    const extension = raw?.trim();
    if (!extension || !/^[1-9]\d*$/.test(extension)) continue;

    const digits = byLength.get(extension.length) ?? new Set<string>();
    digits.add(extension[0]);
    byLength.set(extension.length, digits);
  }

  return byLength;
}

export function buildInternalExtensionPatterns(extensions: readonly string[]): string[] {
  return [...groupFirstDigitsByLength(extensions).entries()]
    .sort(([a], [b]) => a - b)
    .map(([length, digits]) => {
      const sorted = [...digits].sort();
      const head = sorted.length === 1 ? sorted[0] : `[${sorted.join('')}]`;
      return `_${head}${'X'.repeat(length - 1)}`;
    });
}

/**
 * 이 번호가 내선인가. 단축번호가 내선으로 걸어야 하는지, 트렁크로 나가야 하는지 가른다.
 * 패턴이 아니라 실제 목록으로 판정한다 — 대역 가정이 또 하나 생기지 않게.
 */
export function isInternalExtension(value: string, extensions: readonly string[]): boolean {
  const target = value?.trim();
  if (!target) return false;
  return extensions.some((extension) => extension?.trim() === target);
}

/**
 * 이 단축번호 코드가 내선 통화 패턴에 먹히는가.
 *
 * 존재하는 내선인지가 아니라 <b>패턴에 걸리는지</b>를 본다. `_[123]XXX` 가 열려 있으면
 * 내선에 없는 `3999` 도 그 패턴이 먼저 잡아가 단축번호가 영영 안 눌린다.
 * 예전 검사(`/^[12]\d{3}$/`)는 대역이 박혀 있어 3301 번대 현장에서는 헛돌았다.
 */
export function isShadowedByInternalPattern(code: string, extensions: readonly string[]): boolean {
  const target = code?.trim();
  if (!target || !/^\d+$/.test(target)) return false;

  const firstDigits = groupFirstDigitsByLength(extensions).get(target.length);
  return firstDigits?.has(target[0]) ?? false;
}
