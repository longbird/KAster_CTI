import { extractLookupResult, sanitizeLookupValue } from './response-extract.util';

const BODY = {
  ok: true,
  data: { customer: { grade: 'VIP', id: 10293, blocked: false }, empty: null },
};

function extract(overrides: Partial<Parameters<typeof extractLookupResult>[0]> = {}) {
  return extractLookupResult({
    body: BODY,
    resultPath: 'data.customer.grade',
    matchMode: 'EXISTS',
    matchValue: null,
    ...overrides,
  });
}

describe('sanitizeLookupValue', () => {
  it('영숫자·한글·_-. 를 받는다', () => {
    expect(sanitizeLookupValue('VIP')).toEqual({ ok: true, value: 'VIP' });
    expect(sanitizeLookupValue('우수고객')).toEqual({ ok: true, value: '우수고객' });
    expect(sanitizeLookupValue('grade-1_a.2')).toEqual({ ok: true, value: 'grade-1_a.2' });
  });

  it('숫자와 불리언은 문자열로 바꾼다', () => {
    expect(sanitizeLookupValue(10293)).toEqual({ ok: true, value: '10293' });
    expect(sanitizeLookupValue(false)).toEqual({ ok: true, value: 'false' });
  });

  it('dialplan 을 깨뜨릴 수 있는 문자는 거부한다', () => {
    for (const bad of ['a\nb', 'a"b', "a'b", 'a`b', 'a${x}b', 'a,b', 'a;b', 'a)b', 'a b']) {
      expect(sanitizeLookupValue(bad).ok).toBe(false);
    }
  });

  it('64자를 넘으면 거부한다 — 잘라 쓰지 않는다. 잘린 값은 다른 값이다', () => {
    expect(sanitizeLookupValue('a'.repeat(64)).ok).toBe(true);
    expect(sanitizeLookupValue('a'.repeat(65))).toEqual({ ok: false, reason: expect.stringMatching(/64/) });
  });

  it('객체나 배열은 값이 아니다', () => {
    expect(sanitizeLookupValue({ a: 1 }).ok).toBe(false);
    expect(sanitizeLookupValue(['a']).ok).toBe(false);
  });
});

describe('extractLookupResult', () => {
  it('점 표기로 값을 꺼낸다', () => {
    expect(extract()).toEqual({ status: 'MATCH', value: 'VIP' });
  });

  it('없는 경로는 오류가 아니라 NOMATCH 다 — 그 고객이 없다는 정상 결과다', () => {
    expect(extract({ resultPath: 'data.customer.nope' }))
      .toEqual({ status: 'NOMATCH', value: '' });
  });

  it('null 도 NOMATCH 다', () => {
    expect(extract({ resultPath: 'data.empty' })).toEqual({ status: 'NOMATCH', value: '' });
  });

  it('중간 경로가 객체가 아니면 NOMATCH 다', () => {
    expect(extract({ resultPath: 'ok.deeper.still' })).toEqual({ status: 'NOMATCH', value: '' });
  });

  it('깎기에 걸린 값은 ERROR 다 — 외부가 정한 문자열을 그대로 흘리지 않는다', () => {
    const result = extractLookupResult({
      body: { grade: 'VIP");System(rm -rf /' },
      resultPath: 'grade',
      matchMode: 'EXISTS',
      matchValue: null,
    });

    expect(result.status).toBe('ERROR');
    expect(result.value).toBe('');
    expect(result.reason).toBeTruthy();
  });

  it('EQUALS 는 정확히 같을 때만 MATCH 다', () => {
    expect(extract({ matchMode: 'EQUALS', matchValue: 'VIP' }).status).toBe('MATCH');
    expect(extract({ matchMode: 'EQUALS', matchValue: 'vip' }).status).toBe('NOMATCH');
    expect(extract({ matchMode: 'EQUALS', matchValue: 'GOLD' }).status).toBe('NOMATCH');
  });

  it('IN 은 쉼표로 나눈 목록에 있으면 MATCH 다', () => {
    expect(extract({ matchMode: 'IN', matchValue: 'GOLD,VIP,VVIP' }).status).toBe('MATCH');
    expect(extract({ matchMode: 'IN', matchValue: 'GOLD, VIP ' }).status).toBe('MATCH');
    expect(extract({ matchMode: 'IN', matchValue: 'GOLD,SILVER' }).status).toBe('NOMATCH');
  });

  it('NOMATCH 여도 꺼낸 값은 버린다 — 분기하지 않는 값을 채널에 남기지 않는다', () => {
    expect(extract({ matchMode: 'EQUALS', matchValue: 'GOLD' }))
      .toEqual({ status: 'NOMATCH', value: '' });
  });

  it('본문이 JSON 객체가 아니면 ERROR 다', () => {
    expect(extractLookupResult({ body: 'plain text', resultPath: 'a', matchMode: 'EXISTS', matchValue: null }).status)
      .toBe('ERROR');
  });
});
