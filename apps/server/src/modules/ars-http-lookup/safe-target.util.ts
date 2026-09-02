/**
 * 조회 대상 주소가 안전한지 본다 (SSRF 방어).
 *
 * **등록 시점과 호출 시점 둘 다** 부른다. 등록 때만 검사하면 나중에 DNS 를 바꿔치기해서
 * 우회할 수 있다 — 이름은 그대로 두고 A 레코드만 메타데이터 주소로 바꾸면 된다.
 *
 * 이름 해석을 인자로 받는 이유는 이 파일을 순수하게 두기 위해서다. 테스트가 실제 DNS 를 타지 않는다.
 */

export type AddressClass = 'PUBLIC' | 'PRIVATE' | 'BLOCKED';
export type AddressResolver = (hostname: string) => Promise<string[]>;

export interface SafeTarget {
  url: URL;
  /** 해석된 주소가 전부 사설 대역이면 참. 관리자 화면이 경고를 띄우는 데 쓴다. */
  allPrivate: boolean;
}

const IPV4_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export function classifyAddress(address: string): AddressClass {
  const value = address.trim().toLowerCase().replace(/^\[|\]$/g, '');

  // IPv4 를 감싼 IPv6(`::ffff:10.0.0.1`)는 안쪽 주소로 판정한다. 그러지 않으면 우회로가 된다.
  const mapped = value.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped) return classifyAddress(mapped[1]);

  const ipv4 = value.match(IPV4_PATTERN);
  if (ipv4) return classifyIpv4(ipv4.slice(1).map(Number));
  if (value.includes(':')) return classifyIpv6(value);

  // IP 로 읽히지 않는 것은 판정할 수 없다. 판정 못 하는 것은 막는다.
  return 'BLOCKED';
}

function classifyIpv4(octets: number[]): AddressClass {
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return 'BLOCKED';
  const [a, b] = octets;

  if (a === 0) return 'BLOCKED';                                   // 0.0.0.0/8
  if (a === 127) return 'BLOCKED';                                 // 루프백
  if (a === 169 && b === 254) return 'BLOCKED';                    // 링크로컬 — 클라우드 메타데이터
  if (a >= 224) return 'BLOCKED';                                  // 멀티캐스트·예약·브로드캐스트

  if (a === 10) return 'PRIVATE';
  if (a === 172 && b >= 16 && b <= 31) return 'PRIVATE';
  if (a === 192 && b === 168) return 'PRIVATE';

  return 'PUBLIC';
}

function classifyIpv6(value: string): AddressClass {
  if (value === '::' || value === '::1') return 'BLOCKED';
  if (value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb')) {
    return 'BLOCKED';                                              // fe80::/10 링크로컬
  }
  if (value.startsWith('ff')) return 'BLOCKED';                    // ff00::/8 멀티캐스트
  if (value.startsWith('fc') || value.startsWith('fd')) return 'PRIVATE'; // fc00::/7
  if (/^[0-9a-f:]+$/.test(value)) return 'PUBLIC';

  return 'BLOCKED';
}

export async function assertSafeTarget(rawUrl: string, resolve: AddressResolver): Promise<SafeTarget> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`endpoint url is not a valid URL: ${rawUrl}`);
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`endpoint url must use http or https: ${url.protocol}`);
  }
  if (url.username || url.password) {
    throw new Error('endpoint url must not embed credentials');
  }

  // IP 를 직접 적었으면 해석할 것이 없다. 규칙은 같다.
  const addresses = isLiteralAddress(url.hostname) ? [url.hostname] : await resolve(url.hostname);

  if (!addresses.length) {
    throw new Error(`endpoint host does not resolve: ${url.hostname}`);
  }

  const classes = addresses.map((address) => ({ address, kind: classifyAddress(address) }));
  const blocked = classes.find((entry) => entry.kind === 'BLOCKED');
  if (blocked) {
    throw new Error(`endpoint host resolves to a blocked address: ${blocked.address}`);
  }

  const allPrivate = classes.every((entry) => entry.kind === 'PRIVATE');
  if (url.protocol === 'http:' && !allPrivate) {
    throw new Error('endpoint url must use https unless it resolves to a private address');
  }

  return { url, allPrivate };
}

/** 호스트가 IP 리터럴이면 이름 해석을 하지 않는다. */
function isLiteralAddress(hostname: string): boolean {
  return IPV4_PATTERN.test(hostname) || hostname.includes(':');
}
