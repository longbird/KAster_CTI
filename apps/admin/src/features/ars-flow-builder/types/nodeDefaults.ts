import type { FlowNodeType } from './flowGraph';

/**
 * 새 노드의 기본 설정.
 *
 * 서버 `node-config.parser` 가 받아들이는 모양이어야 한다. 값이 비어 있어도
 * 저장 시 검증에서 잡히므로, 여기서는 **형태만** 맞춘다.
 */
export function defaultConfigFor(nodeType: FlowNodeType): Record<string, unknown> {
  switch (nodeType) {
    case 'PLAY':
      return { promptKeys: [] };
    case 'MENU':
      return { promptKey: null, timeoutSeconds: 5, maxRetries: 2 };
    case 'QUEUE':
      return { queueName: '' };
    case 'TRANSFER':
      return { transferNumber: '' };
    case 'SMS':
      return { smsTemplateId: '', targetSource: 'CALLER' };
    case 'OPT_OUT':
      return { action: 'REGISTER', targetSource: 'CALLER' };
    case 'CONDITION':
      return {
        conditionType: 'TIME_RANGE',
        timeStart: '09:00',
        timeEnd: '18:00',
        daysOfWeek: ['mon', 'tue', 'wed', 'thu', 'fri'],
      };
    case 'HANGUP':
      return { promptKey: null };
    case 'COLLECT_DIGITS':
      return { promptKey: null, minDigits: 1, maxDigits: 11, timeoutSeconds: 5, maxRetries: 2 };
    case 'HTTP_LOOKUP':
      return { endpointId: '', waitPromptKey: null };
  }
}

/**
 * 노드/엣지 id.
 *
 * 서버 DTO 가 UUID 를 요구한다 — 임의 문자열을 보내면 400 이다
 * (2026-09-02 파일럿에서 실제로 겪었다).
 */
export function newNodeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // 구형 브라우저 폴백. 형식만 맞추면 서버가 받는다.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function describeTarget(config: Record<string, unknown>): string {
  return config.targetSource === 'COLLECTED' ? '입력받은 번호' : '발신번호';
}

/** 캔버스 카드에 한 줄로 보여줄 요약. */
export function describeNodeSummary(nodeType: FlowNodeType, config: Record<string, unknown>): string {
  const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : '');

  switch (nodeType) {
    case 'QUEUE':
      return text(config.queueName) || '미설정';
    case 'TRANSFER':
      return text(config.transferNumber) || '미설정';
    case 'SMS':
      return `${text(config.smsTemplateId) || '미설정'} → ${describeTarget(config)}`;
    case 'PLAY': {
      const keys = Array.isArray(config.promptKeys) ? config.promptKeys.filter((k) => typeof k === 'string') : [];
      return keys.length ? keys.join(', ') : '미설정';
    }
    case 'MENU': {
      const prompt = text(config.promptKey) || '안내 없음';
      return `${prompt} · ${config.timeoutSeconds ?? 5}초`;
    }
    case 'CONDITION':
      return config.conditionType === 'HOLIDAY'
        ? '공휴일'
        : `${text(config.timeStart) || '--:--'} ~ ${text(config.timeEnd) || '--:--'}`;
    case 'OPT_OUT':
      return `${config.action === 'UNREGISTER' ? '해제' : '등록'} · ${describeTarget(config)}`;
    case 'COLLECT_DIGITS':
      return `${config.minDigits ?? 1}~${config.maxDigits ?? 11}자리 · ${config.timeoutSeconds ?? 5}초`;
    case 'HTTP_LOOKUP':
      return text(config.endpointId) ? '등록된 엔드포인트' : '미설정';
    default:
      return '';
  }
}
