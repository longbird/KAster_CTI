import { parseAnalysisResponse } from './analysis-response.util';

const VALID = {
  summary: '고객이 배송 지연을 문의했고 상담원이 재배송을 안내했다.',
  sentiment: 'NEGATIVE',
  sentimentScore: -0.4,
  categoryCode: 'DELIVERY',
  keywords: ['배송', '지연'],
  riskFlags: ['REPEAT_CALL'],
};

describe('parseAnalysisResponse', () => {
  it('정상 JSON 을 파싱한다', () => {
    expect(parseAnalysisResponse(JSON.stringify(VALID))).toEqual(VALID);
  });

  it('코드펜스로 감싸도 파싱한다', () => {
    const fenced = '```json\n' + JSON.stringify(VALID) + '\n```';

    expect(parseAnalysisResponse(fenced).summary).toBe(VALID.summary);
  });

  it('앞뒤 잡담이 붙어도 첫 JSON 객체를 꺼낸다', () => {
    const noisy = `분석 결과입니다.\n${JSON.stringify(VALID)}\n도움이 되었길 바랍니다.`;

    expect(parseAnalysisResponse(noisy).sentiment).toBe('NEGATIVE');
  });

  it('선택 항목은 기본값으로 채운다', () => {
    const minimal = JSON.stringify({ summary: '요약', sentiment: 'NEUTRAL' });

    expect(parseAnalysisResponse(minimal)).toEqual({
      summary: '요약',
      sentiment: 'NEUTRAL',
      sentimentScore: null,
      categoryCode: null,
      keywords: [],
      riskFlags: [],
    });
  });

  it('sentimentScore 는 -1~1 로 자른다', () => {
    expect(parseAnalysisResponse(JSON.stringify({ ...VALID, sentimentScore: 5 })).sentimentScore).toBe(1);
    expect(parseAnalysisResponse(JSON.stringify({ ...VALID, sentimentScore: -9 })).sentimentScore).toBe(-1);
  });

  it('keywords 의 비문자열 항목은 버린다', () => {
    const mixed = JSON.stringify({ ...VALID, keywords: ['배송', 3, null, '  지연  '] });

    expect(parseAnalysisResponse(mixed).keywords).toEqual(['배송', '지연']);
  });

  it('JSON 이 아니면 던진다', () => {
    expect(() => parseAnalysisResponse('죄송합니다, 분석할 수 없습니다')).toThrow(/JSON/i);
  });

  it('summary 가 비면 던진다', () => {
    expect(() => parseAnalysisResponse(JSON.stringify({ ...VALID, summary: '   ' }))).toThrow(/summary/i);
  });

  it('sentiment 가 정해진 값이 아니면 그 값을 담아 던진다', () => {
    expect(() => parseAnalysisResponse(JSON.stringify({ ...VALID, sentiment: 'ANGRY' })))
      .toThrow(/ANGRY/);
  });

  it('빈 응답은 던진다', () => {
    expect(() => parseAnalysisResponse('')).toThrow(/empty/i);
  });
});
