// cti-runtime-fileset 의 ami.parser 아이디어를 차용해 AmiConnectionService 의
// 버퍼 split + key/value 파싱 로직을 분리한 순수 유틸.
// 테스트하기 쉽고, 향후 다중 AMI 소스를 지원할 때 공유 가능.

export interface ParsedAmiFrame {
  [key: string]: string | undefined;
}

// 누적 버퍼에서 `\r\n\r\n` 경계로 완결된 프레임을 꺼내고, 끝부분의 불완전
// 프레임은 rest 로 돌려준다.
export function splitAmiFrames(buffer: string): {
  frames: string[];
  rest: string;
} {
  const frames: string[] = [];
  let rest = buffer;
  let idx = rest.indexOf('\r\n\r\n');
  while (idx >= 0) {
    frames.push(rest.slice(0, idx));
    rest = rest.slice(idx + 4);
    idx = rest.indexOf('\r\n\r\n');
  }
  return { frames, rest };
}

// Asterisk 배너(`Asterisk Call Manager/x.y.z`) 감지. 일반 프레임과 달리
// 한 줄 문자열이라 key/value 파싱이 안 된다. 로그인 타이밍 결정용.
export function isAsteriskBanner(buffer: string): boolean {
  return buffer.includes('Asterisk Call Manager');
}

// 하나의 완결된 프레임 문자열을 { key: value } 레코드로 파싱.
export function parseAmiFrame(frame: string): ParsedAmiFrame {
  const out: ParsedAmiFrame = {};
  for (const line of frame.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const colon = trimmed.indexOf(':');
    if (colon < 0) continue;
    const key = trimmed.slice(0, colon).trim();
    const value = trimmed.slice(colon + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}
