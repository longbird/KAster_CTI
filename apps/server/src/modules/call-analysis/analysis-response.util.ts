export const SENTIMENTS = ['POSITIVE', 'NEUTRAL', 'NEGATIVE'] as const;
export type Sentiment = (typeof SENTIMENTS)[number];

export interface AnalysisResponse {
  summary: string;
  sentiment: Sentiment;
  sentimentScore: number | null;
  categoryCode: string | null;
  keywords: string[];
  riskFlags: string[];
}

/**
 * LLM 응답을 신뢰하지 않고 파싱한다. 여기가 시스템 경계다.
 * 던지면 job 이 RETRY 로 떨어지므로, 무엇이 틀렸는지 메시지에 남긴다.
 */
export function parseAnalysisResponse(raw: string): AnalysisResponse {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    throw new Error('analysis response is empty');
  }

  const parsed = parseJsonObject(raw);

  const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
  if (!summary) {
    throw new Error('analysis response has no summary');
  }

  const sentiment = typeof parsed.sentiment === 'string' ? parsed.sentiment.trim().toUpperCase() : '';
  if (!SENTIMENTS.includes(sentiment as Sentiment)) {
    throw new Error(`analysis response has an unknown sentiment: ${parsed.sentiment}`);
  }

  return {
    summary,
    sentiment: sentiment as Sentiment,
    sentimentScore: clampScore(parsed.sentimentScore),
    categoryCode: typeof parsed.categoryCode === 'string' && parsed.categoryCode.trim()
      ? parsed.categoryCode.trim()
      : null,
    keywords: toStringList(parsed.keywords),
    riskFlags: toStringList(parsed.riskFlags),
  };
}

function parseJsonObject(raw: string): Record<string, unknown> {
  const withoutFence = raw.replace(/```(?:json)?/gi, '').trim();
  const start = withoutFence.indexOf('{');
  const end = withoutFence.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new Error('analysis response does not contain a JSON object');
  }

  try {
    const value = JSON.parse(withoutFence.slice(start, end + 1));
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('analysis response is not a JSON object');
    }
    return value as Record<string, unknown>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`analysis response is not valid JSON: ${message}`);
  }
}

function clampScore(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(-1, Math.min(1, value));
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}
