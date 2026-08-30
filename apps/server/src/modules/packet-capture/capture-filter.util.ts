/**
 * 패킷 캡처 입력 검증.
 *
 * 캡처 필터와 인터페이스명은 관리자가 넣는 값이고 그대로 dumpcap 인자로 넘어간다.
 * 실행은 execFile(argv 배열)로 하므로 셸 인젝션 자체는 성립하지 않지만,
 * 인자 주입과 오작동을 막기 위해 여기서 한 번 더 좁힌다.
 */

/** BPF 표현식에 실제로 필요한 문자만 남긴다. 셸 메타문자는 전부 제외한다. */
const ALLOWED_FILTER_PATTERN = /^[A-Za-z0-9 .:_\-/()[\],]*$/;
const CONTROL_CHAR_PATTERN = /[\x00-\x1f\x7f]/;
const MAX_FILTER_LENGTH = 512;
const INTERFACE_NAME_PATTERN = /^[A-Za-z0-9_.:-]{1,64}$/;

export const MIN_CAPTURE_DURATION_SECONDS = 5;

export class CaptureValidationError extends Error {}

/**
 * 캡처 필터를 검증해 정규화한 값을 돌려준다.
 * 빈 필터는 "전량 캡처" 를 뜻하므로 허용한다.
 */
export function validateCaptureFilter(filter: string | null | undefined): string {
  const trimmed = (filter ?? '').trim();

  // 제어 문자 검사는 공백 정규화보다 먼저 해야 한다. 순서가 바뀌면 개행이 공백으로
  // 접혀 검사를 그대로 빠져나간다.
  if (CONTROL_CHAR_PATTERN.test(trimmed)) {
    throw new CaptureValidationError('캡처 필터에 제어 문자가 포함될 수 없습니다');
  }

  const normalized = trimmed.replace(/\s+/g, ' ');

  if (normalized.length > MAX_FILTER_LENGTH) {
    throw new CaptureValidationError(`캡처 필터가 너무 깁니다 (최대 ${MAX_FILTER_LENGTH}자)`);
  }
  if (!ALLOWED_FILTER_PATTERN.test(normalized)) {
    throw new CaptureValidationError('캡처 필터에 허용되지 않는 문자가 있습니다');
  }
  // 선행 하이픈은 dumpcap 이 플래그로 읽을 여지가 있어 막는다.
  if (normalized.startsWith('-')) {
    throw new CaptureValidationError('캡처 필터는 - 로 시작할 수 없습니다');
  }

  return normalized;
}

/** 인터페이스명은 형식 검사에 더해 실제 존재 목록과 대조한다. */
export function validateInterfaceName(name: string | null | undefined, available: string[]): string {
  const normalized = (name ?? '').trim();

  if (!INTERFACE_NAME_PATTERN.test(normalized)) {
    throw new CaptureValidationError('인터페이스 이름 형식이 올바르지 않습니다');
  }
  if (!available.includes(normalized)) {
    throw new CaptureValidationError(`인터페이스 ${normalized} 를 찾을 수 없습니다`);
  }

  return normalized;
}

/** 캡처 시간은 관리자가 끄는 것을 잊어도 반드시 스스로 멈추도록 상한을 강제한다. */
export function validateDurationSeconds(durationSeconds: unknown, maxSeconds: number): number {
  if (!Number.isInteger(durationSeconds)) {
    throw new CaptureValidationError('캡처 시간은 정수(초)여야 합니다');
  }

  const value = durationSeconds as number;
  if (value < MIN_CAPTURE_DURATION_SECONDS) {
    throw new CaptureValidationError(`캡처 시간은 최소 ${MIN_CAPTURE_DURATION_SECONDS}초입니다`);
  }
  if (value > maxSeconds) {
    throw new CaptureValidationError(`캡처 시간은 최대 ${maxSeconds}초입니다`);
  }

  return value;
}

export interface CaptureArgsInput {
  interfaceName: string;
  captureFilter: string;
  durationSeconds: number;
  maxFileMb: number;
  outputPath: string;
}

/**
 * dumpcap 인자를 만든다.
 *
 * -p 는 promiscuous 모드를 끈다. PBX 는 트래픽의 종단이지 미러 포트가 아니라서
 * 필요한 SIP/RTP 는 비promisc 로도 전부 잡히고, 요구 권한이 NET_RAW 하나로 줄어든다.
 * -a duration/filesize 는 dumpcap 자체 정지 조건이다. 부모 타이머와 별개로 동작한다.
 */
export function buildCaptureArgs(input: CaptureArgsInput): string[] {
  const args = [
    '-i', input.interfaceName,
    '-p',
    '-w', input.outputPath,
    '-a', `duration:${input.durationSeconds}`,
    '-a', `filesize:${input.maxFileMb * 1024}`,
  ];

  if (input.captureFilter) {
    args.push('-f', input.captureFilter);
  }

  return args;
}

/** `dumpcap -D` 출력에서 인터페이스명을 뽑는다. 예: `1. eth0 (Ethernet)` */
export function parseInterfaceList(stdout: string): string[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => /^\s*\d+\.\s*([^\s(]+)/.exec(line)?.[1])
    .filter((name): name is string => Boolean(name));
}
