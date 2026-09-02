import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * 엔드포인트 자격증명을 저장할 수 있게 암호화한다.
 *
 * 녹취 암호화와 **같은 방식(AES-256-GCM)이되 다른 키**를 쓴다. 용도가 다른 비밀에 같은 키를
 * 겹쳐 쓰면 하나가 새면 둘 다 샌다.
 *
 * 레이아웃은 `iv(12) + tag(16) + 암호문` 을 base64 로 담는다.
 * 녹취는 스트리밍이라 tag 를 뒤에 붙이지만, 여기는 짧은 문자열이라 앞에 두는 편이 읽기 쉽다.
 */

const GCM_IV_BYTES = 12;
const GCM_TAG_BYTES = 16;
const KEY_BYTES = 32;

export function loadEndpointSecretKey(raw: string | undefined): Buffer {
  const value = (raw ?? '').trim();
  if (!value) {
    throw new Error('ARS_HTTP_SECRET_KEY is not configured');
  }

  const decoded = /^[0-9a-fA-F]{64}$/.test(value)
    ? Buffer.from(value, 'hex')
    : Buffer.from(value, 'base64');

  if (decoded.length !== KEY_BYTES) {
    throw new Error('ARS_HTTP_SECRET_KEY must decode to 32 bytes');
  }
  return decoded;
}

export function encryptEndpointSecret(plain: string, key: Buffer): string {
  const iv = randomBytes(GCM_IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);

  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}

export function decryptEndpointSecret(cipherText: string, key: Buffer): string {
  const raw = Buffer.from((cipherText ?? '').trim(), 'base64');
  if (raw.length <= GCM_IV_BYTES + GCM_TAG_BYTES) {
    throw new Error('stored endpoint secret is malformed');
  }

  const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, GCM_IV_BYTES));
  decipher.setAuthTag(raw.subarray(GCM_IV_BYTES, GCM_IV_BYTES + GCM_TAG_BYTES));

  return Buffer.concat([
    decipher.update(raw.subarray(GCM_IV_BYTES + GCM_TAG_BYTES)),
    decipher.final(),
  ]).toString('utf8');
}
