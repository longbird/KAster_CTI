import { decryptEndpointSecret, encryptEndpointSecret, loadEndpointSecretKey } from './endpoint-secret.util';

const HEX_KEY = 'a'.repeat(64);
const KEY = loadEndpointSecretKey(HEX_KEY);

describe('loadEndpointSecretKey', () => {
  it('hex 32바이트를 받는다', () => {
    expect(loadEndpointSecretKey(HEX_KEY)).toHaveLength(32);
  });

  it('base64 32바이트도 받는다', () => {
    const base64 = Buffer.alloc(32, 7).toString('base64');

    expect(loadEndpointSecretKey(base64)).toHaveLength(32);
  });

  it('없으면 어떤 env 를 채워야 하는지 알려준다', () => {
    expect(() => loadEndpointSecretKey(undefined)).toThrow(/ARS_HTTP_SECRET_KEY/);
    expect(() => loadEndpointSecretKey('   ')).toThrow(/ARS_HTTP_SECRET_KEY/);
  });

  it('길이가 안 맞으면 던진다', () => {
    expect(() => loadEndpointSecretKey('abcd')).toThrow(/32/);
  });
});

describe('엔드포인트 시크릿', () => {
  it('넣은 값을 그대로 되돌린다', () => {
    const secret = 'sk-live-0123456789';

    expect(decryptEndpointSecret(encryptEndpointSecret(secret, KEY), KEY)).toBe(secret);
  });

  it('한글과 긴 값도 왕복한다', () => {
    const secret = `토큰-${'x'.repeat(300)}`;

    expect(decryptEndpointSecret(encryptEndpointSecret(secret, KEY), KEY)).toBe(secret);
  });

  it('같은 값을 두 번 암호화해도 암호문이 다르다 — IV 가 매번 새로 나온다', () => {
    expect(encryptEndpointSecret('same', KEY)).not.toBe(encryptEndpointSecret('same', KEY));
  });

  it('암호문이 한 글자라도 바뀌면 복호가 실패한다', () => {
    const cipher = encryptEndpointSecret('sk-live-1', KEY);
    const tampered = `${cipher.slice(0, -2)}${cipher.slice(-2) === 'AA' ? 'AB' : 'AA'}`;

    expect(() => decryptEndpointSecret(tampered, KEY)).toThrow();
  });

  it('다른 키로는 못 푼다', () => {
    const other = loadEndpointSecretKey('b'.repeat(64));

    expect(() => decryptEndpointSecret(encryptEndpointSecret('sk', KEY), other)).toThrow();
  });

  it('형식이 아닌 문자열은 무엇이 문제인지 말한다', () => {
    expect(() => decryptEndpointSecret('not-base64!!', KEY)).toThrow(/secret/i);
    expect(() => decryptEndpointSecret('', KEY)).toThrow(/secret/i);
  });
});
