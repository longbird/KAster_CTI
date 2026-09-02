export type Speaker = 'CUSTOMER' | 'AGENT' | 'UNKNOWN';
export type Sentiment = 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';

export interface TranscriptSegment {
  segmentId: string;
  speaker: Speaker;
  startMs: number;
  endMs: number;
  text: string;
  confidence: number | null;
}

export interface CallTranscript {
  transcriptId: string;
  fullText: string;
  language: string;
  durationSeconds: number;
  confidence: number | null;
  provider: string;
  modelName: string | null;
  status: string;
  createdAt: string;
}

export interface CallTranscriptResponse {
  transcript: CallTranscript;
  segments: TranscriptSegment[];
}

export interface CallAnalysis {
  analysisId: string;
  transcriptId: string;
  summary: string;
  sentiment: Sentiment;
  sentimentScore: number | null;
  keywords: string[] | null;
  riskFlags: string[] | null;
  provider: string;
  modelName: string | null;
  createdAt: string;
  category: { categoryId: string; code: string; name: string } | null;
}

export const SPEAKER_LABELS: Record<Speaker, string> = {
  CUSTOMER: '고객',
  AGENT: '상담원',
  UNKNOWN: '화자',
};

export const SENTIMENT_META: Record<Sentiment, { label: string; color: string }> = {
  POSITIVE: { label: '긍정', color: 'success' },
  NEUTRAL: { label: '중립', color: 'default' },
  NEGATIVE: { label: '부정', color: 'error' },
};

/** 세그먼트 시작 시각을 통화 경과시간 표기(m:ss)로 바꾼다. */
export function formatSegmentTime(ms: number): string {
  const safeMs = Number.isFinite(ms) && ms > 0 ? ms : 0;
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
