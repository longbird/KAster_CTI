const CARD_NUMBER = /\b(\d{4})[- ]?(\d{4})[- ]?(\d{4})[- ]?(\d{4})\b/g;
const RESIDENT_NUMBER = /\b(\d{6})[- ]?([1-4]\d{6})\b/g;
const MOBILE_NUMBER = /\b(01[016789])[- ]?(\d{3,4})[- ]?(\d{4})\b/g;
const LANDLINE_NUMBER = /\b(0[2-6]\d?)[- ]?(\d{3,4})[- ]?(\d{4})\b/g;

/**
 * STT 전문에서 개인정보를 가린다.
 * 녹취 파일은 접근 감사와 암호화로 보호되지만 전문은 텍스트라 유출 표면이 더 넓다.
 * 카드번호를 먼저 판정한다 — 자릿수가 가장 길어서 다른 패턴에 잘려 나가면 안 된다.
 */
export function maskPii(text: string): string {
  if (typeof text !== 'string' || text.length === 0) {
    return '';
  }

  return text
    .replace(CARD_NUMBER, (_match, _a, _b, _c, last4) => `****-****-****-${last4}`)
    .replace(RESIDENT_NUMBER, (_match, front) => `${front}-*******`)
    .replace(MOBILE_NUMBER, maskMiddle)
    .replace(LANDLINE_NUMBER, maskMiddle);
}

function maskMiddle(_match: string, prefix: string, middle: string, last: string): string {
  return `${prefix}-${'*'.repeat(middle.length)}-${last}`;
}
