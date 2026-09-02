import { CUSTOM_SOUND_ABSOLUTE_PREFIX } from './hook-paths';

export function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function assertNoNewlines(value: string, field: string): void {
  if (/[\r\n]/.test(value)) {
    throw new Error(`Field "${field}" contains illegal newline characters`);
  }
}

/** `System()` 인자로 넘길 값을 홑따옴표로 감싼다. 값 안의 홑따옴표는 셸 규칙대로 끊어 붙인다. */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

/**
 * 안내 파일을 Playback/Background 가 받는 형태로 바꾼다.
 *
 * `custom/` 로 시작하면 절대경로로 편다. 상대경로로 두면 Asterisk 가 채널 언어 하위
 * 디렉터리에서 먼저 찾다가 못 찾고 조용히 넘어간다 — 고객에게는 무음이 된다.
 */
export function toPlaybackTarget(promptKey: string): string {
  assertNoNewlines(promptKey, 'promptKey');
  if (promptKey.startsWith('custom/')) {
    const relativePath = promptKey.slice('custom/'.length);
    assertNoNewlines(relativePath, 'promptKey');
    return `${CUSTOM_SOUND_ABSOLUTE_PREFIX}${relativePath}`;
  }
  return promptKey;
}
