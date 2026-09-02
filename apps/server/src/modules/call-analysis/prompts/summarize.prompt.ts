export interface AnalysisPromptCategory {
  code: string;
  name: string;
}

export interface AnalysisPromptInput {
  fullText: string;
  categories: AnalysisPromptCategory[];
  maxChars: number;
}

const SYSTEM_PROMPT = [
  '당신은 콜센터 통화 기록을 분석하는 도구다.',
  '주어진 통화 전문만 근거로 삼고, 전문에 없는 사실을 지어내지 않는다.',
  '',
  '아래 JSON 객체 하나만 출력한다. 설명이나 코드펜스를 덧붙이지 않는다.',
  '{',
  '  "summary": "통화 내용을 3문장 이내로 요약",',
  '  "sentiment": "POSITIVE | NEUTRAL | NEGATIVE 중 하나 (고객 기준)",',
  '  "sentimentScore": -1.0 ~ 1.0 사이 숫자,',
  '  "categoryCode": "아래 상담분류 목록의 code 중 하나, 해당 없으면 null",',
  '  "keywords": ["핵심 키워드 최대 5개"],',
  '  "riskFlags": ["해지요청, 불만고조, 재문의 같은 위험 신호. 없으면 빈 배열"]',
  '}',
  '',
  '전문에 마스킹된 번호(예: 010-****-5678)가 있으면 그대로 두고 복원하지 않는다.',
].join('\n');

/** 통화 전문을 분석 요청 프롬프트로 만든다. 전문이 길면 앞에서부터 잘라 토큰 비용을 묶어 둔다. */
export function buildAnalysisPrompt(input: AnalysisPromptInput): { system: string; user: string } {
  const transcript = input.fullText.length > input.maxChars
    ? `${input.fullText.slice(0, input.maxChars)}\n…(이후 생략)`
    : input.fullText;

  const categoryList = input.categories.length
    ? input.categories.map((category) => `- ${category.code}: ${category.name}`).join('\n')
    : '- (등록된 상담분류 없음. categoryCode 는 null 로 둔다)';

  return {
    system: SYSTEM_PROMPT,
    user: [
      '[상담분류 목록]',
      categoryList,
      '',
      '[통화 전문]',
      transcript,
    ].join('\n'),
  };
}
