import { applyRequest, buildRequestParams } from './request-mapping.util';

const VARS = {
  caller: '01012345678',
  collected: '20260902',
  entryDid: '16001234',
  linkedid: '1756789012.34',
};

describe('buildRequestParams', () => {
  it('정해진 다섯 가지 출처만 받는다', () => {
    expect(
      buildRequestParams(
        {
          phone: 'CALLER',
          custNo: 'COLLECTED',
          did: 'ENTRY_DID',
          call: 'LINKEDID',
          src: 'LITERAL:kaster',
        },
        VARS,
      ),
    ).toEqual({
      phone: '01012345678',
      custNo: '20260902',
      did: '16001234',
      call: '1756789012.34',
      src: 'kaster',
    });
  });

  it('모르는 출처는 저장 시점에 걸리도록 던진다', () => {
    expect(() => buildRequestParams({ x: 'CUSTOMER_NAME' }, VARS)).toThrow(/CUSTOMER_NAME/);
  });

  it('자유 템플릿을 흉내내도 통하지 않는다', () => {
    expect(() => buildRequestParams({ x: '${CALLERID(num)}' }, VARS)).toThrow();
  });

  it('빈 매핑은 빈 파라미터다', () => {
    expect(buildRequestParams({}, VARS)).toEqual({});
    expect(buildRequestParams(null, VARS)).toEqual({});
  });

  it('매핑이 객체가 아니면 던진다', () => {
    expect(() => buildRequestParams([1, 2], VARS)).toThrow(/object/i);
  });

  it('파라미터 이름도 검사한다 — 아무 문자열이나 쿼리에 넣지 않는다', () => {
    expect(() => buildRequestParams({ 'a&b=c': 'CALLER' }, VARS)).toThrow(/a&b=c/);
  });

  it('LITERAL 은 빈 문자열도 받는다', () => {
    expect(buildRequestParams({ x: 'LITERAL:' }, VARS)).toEqual({ x: '' });
  });

  it('값이 없는 변수는 빈 문자열이 된다', () => {
    expect(buildRequestParams({ c: 'COLLECTED' }, { ...VARS, collected: '' })).toEqual({ c: '' });
  });
});

describe('applyRequest', () => {
  it('GET 이면 쿼리스트링으로 붙인다', () => {
    const result = applyRequest(new URL('https://api.example.com/lookup'), 'GET', { phone: '01012345678' });

    expect(result.url).toBe('https://api.example.com/lookup?phone=01012345678');
    expect(result.body).toBeUndefined();
  });

  it('원래 주소에 있던 쿼리를 지우지 않는다', () => {
    const result = applyRequest(new URL('https://api.example.com/lookup?v=2'), 'GET', { phone: '010' });

    expect(result.url).toContain('v=2');
    expect(result.url).toContain('phone=010');
  });

  it('쿼리 값을 인코딩한다', () => {
    const result = applyRequest(new URL('https://api.example.com/x'), 'GET', { q: 'a b&c' });

    expect(result.url).toContain('q=a+b%26c');
  });

  it('POST 면 JSON 본문으로 보낸다', () => {
    const result = applyRequest(new URL('https://api.example.com/x'), 'POST', { phone: '010' });

    expect(result.url).toBe('https://api.example.com/x');
    expect(result.body).toBe('{"phone":"010"}');
  });
});
