import { assertSafeTarget, classifyAddress } from './safe-target.util';

function resolverFor(map: Record<string, string[]>) {
  return async (hostname: string) => {
    const addresses = map[hostname];
    if (!addresses) throw new Error(`getaddrinfo ENOTFOUND ${hostname}`);
    return addresses;
  };
}

const PUBLIC = resolverFor({ 'api.example.com': ['93.184.216.34'] });

describe('classifyAddress', () => {
  it('사설 대역을 가려낸다', () => {
    expect(classifyAddress('10.0.0.5')).toBe('PRIVATE');
    expect(classifyAddress('172.16.0.1')).toBe('PRIVATE');
    expect(classifyAddress('172.31.255.254')).toBe('PRIVATE');
    expect(classifyAddress('192.168.1.10')).toBe('PRIVATE');
    expect(classifyAddress('fd00::1')).toBe('PRIVATE');
  });

  it('172.32 은 사설이 아니다 — /12 경계', () => {
    expect(classifyAddress('172.32.0.1')).toBe('PUBLIC');
    expect(classifyAddress('172.15.0.1')).toBe('PUBLIC');
  });

  it('막아야 할 대역을 가려낸다', () => {
    expect(classifyAddress('127.0.0.1')).toBe('BLOCKED');
    expect(classifyAddress('::1')).toBe('BLOCKED');
    // 클라우드 메타데이터. SSRF 의 대표 표적이다.
    expect(classifyAddress('169.254.169.254')).toBe('BLOCKED');
    expect(classifyAddress('fe80::1')).toBe('BLOCKED');
    expect(classifyAddress('0.0.0.0')).toBe('BLOCKED');
    expect(classifyAddress('224.0.0.1')).toBe('BLOCKED');
    expect(classifyAddress('255.255.255.255')).toBe('BLOCKED');
  });

  it('IPv4 를 감싼 IPv6 도 안쪽 주소로 판정한다 — 우회로가 되면 안 된다', () => {
    expect(classifyAddress('::ffff:169.254.169.254')).toBe('BLOCKED');
    expect(classifyAddress('::ffff:10.0.0.1')).toBe('PRIVATE');
  });

  it('알 수 없는 형식은 막는다', () => {
    expect(classifyAddress('not-an-ip')).toBe('BLOCKED');
  });
});

describe('assertSafeTarget', () => {
  it('https 공인 주소는 통과한다', async () => {
    const result = await assertSafeTarget('https://api.example.com/lookup', PUBLIC);

    expect(result.url.hostname).toBe('api.example.com');
    expect(result.allPrivate).toBe(false);
  });

  it('메타데이터 주소로 해석되면 막는다', async () => {
    const resolver = resolverFor({ 'evil.example.com': ['169.254.169.254'] });

    await expect(assertSafeTarget('https://evil.example.com/x', resolver))
      .rejects.toThrow(/169\.254\.169\.254/);
  });

  it('주소 중 하나라도 막힌 대역이면 막는다 — 어느 것으로 붙을지 고를 수 없다', async () => {
    const resolver = resolverFor({ 'mixed.example.com': ['93.184.216.34', '127.0.0.1'] });

    await expect(assertSafeTarget('https://mixed.example.com/x', resolver)).rejects.toThrow(/127\.0\.0\.1/);
  });

  it('http 는 사설 대역일 때만 받는다', async () => {
    const priv = resolverFor({ 'crm.internal': ['10.0.0.5'] });
    const result = await assertSafeTarget('http://crm.internal/lookup', priv);

    expect(result.allPrivate).toBe(true);
  });

  it('http 공인 주소는 막는다 — 자격증명이 평문으로 나간다', async () => {
    await expect(assertSafeTarget('http://api.example.com/x', PUBLIC)).rejects.toThrow(/https/);
  });

  it('http 도 https 도 아니면 막는다', async () => {
    await expect(assertSafeTarget('file:///etc/passwd', PUBLIC)).rejects.toThrow();
    await expect(assertSafeTarget('gopher://x/1', PUBLIC)).rejects.toThrow();
  });

  it('주소에 자격증명을 넣지 못하게 한다', async () => {
    await expect(assertSafeTarget('https://user:pw@api.example.com/x', PUBLIC))
      .rejects.toThrow(/credential/i);
  });

  it('주소 형식이 틀리면 무엇이 틀렸는지 말한다', async () => {
    await expect(assertSafeTarget('그냥 문자열', PUBLIC)).rejects.toThrow(/url/i);
  });

  it('이름이 안 풀리면 그 사실을 그대로 올린다', async () => {
    await expect(assertSafeTarget('https://nope.example.com/x', PUBLIC)).rejects.toThrow(/ENOTFOUND/);
  });

  it('IP 를 직접 적어도 같은 규칙이다', async () => {
    const never = async () => {
      throw new Error('resolver should not be called for a literal IP');
    };

    await expect(assertSafeTarget('https://169.254.169.254/latest/meta-data', never)).rejects.toThrow();
    await expect(assertSafeTarget('https://93.184.216.34/x', never)).resolves.toBeTruthy();
  });
});
