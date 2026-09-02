import {
  CollectDigitsConfig,
  ConditionConfig,
  DIGIT_TARGET_SOURCES,
  DigitTargetSource,
  FlowNodeType,
  HangupConfig,
  HttpLookupConfig,
  MenuConfig,
  NodeConfig,
  OptOutConfig,
  PlayConfig,
  QueueConfig,
  SmsConfig,
  TransferConfig,
  isFlowNodeType,
} from './flow-graph.types';

const MENU_TIMEOUT_RANGE = { min: 1, max: 60 };
const MENU_RETRY_RANGE = { min: 0, max: 5 };
const DEFAULT_MENU_TIMEOUT_SECONDS = 5;
const DEFAULT_MENU_MAX_RETRIES = 2;
const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const OPT_OUT_ACTIONS = ['REGISTER', 'UNREGISTER'];
const CONDITION_TYPES = ['TIME_RANGE', 'HOLIDAY'];
const COLLECT_DIGIT_RANGE = { min: 1, max: 32 };
const DEFAULT_COLLECT_MIN_DIGITS = 1;
// 한국 휴대폰 번호가 11자리다. 대부분의 '번호를 눌러 주세요' 가 여기서 끝난다.
const DEFAULT_COLLECT_MAX_DIGITS = 11;

/**
 * 노드의 `config` JSON 을 타입별로 검증해서 꺼낸다. 여기가 시스템 경계다.
 *
 * 개행이 든 문자열은 렌더러의 `assertNoNewlines()` 이전에 여기서 먼저 막는다 —
 * 잘못된 값이 DB 에 저장되는 것 자체를 막아야 나중에 렌더가 통째로 실패하지 않는다.
 */
export function parseNodeConfig(nodeType: FlowNodeType, raw: unknown): NodeConfig {
  if (!isFlowNodeType(nodeType)) {
    throw new Error(`unknown flow node type: ${nodeType}`);
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`node config must be an object (${nodeType})`);
  }

  const config = raw as Record<string, unknown>;

  switch (nodeType) {
    case 'PLAY':
      return parsePlay(config);
    case 'MENU':
      return parseMenu(config);
    case 'QUEUE':
      return parseQueue(config);
    case 'TRANSFER':
      return parseTransfer(config);
    case 'SMS':
      return parseSms(config);
    case 'OPT_OUT':
      return parseOptOut(config);
    case 'CONDITION':
      return parseCondition(config);
    case 'HANGUP':
      return parseHangup(config);
    case 'COLLECT_DIGITS':
      return parseCollectDigits(config);
    case 'HTTP_LOOKUP':
      return parseHttpLookup(config);
  }
}

function parsePlay(config: Record<string, unknown>): PlayConfig {
  const promptKeys = toCleanStringList(config.promptKeys, 'promptKeys');
  if (!promptKeys.length) {
    throw new Error('PLAY node requires at least one entry in promptKeys');
  }
  return { promptKeys };
}

function parseMenu(config: Record<string, unknown>): MenuConfig {
  return {
    promptKey: optionalText(config.promptKey, 'promptKey'),
    timeoutSeconds: boundedInteger(
      config.timeoutSeconds,
      'timeoutSeconds',
      DEFAULT_MENU_TIMEOUT_SECONDS,
      MENU_TIMEOUT_RANGE,
    ),
    maxRetries: boundedInteger(
      config.maxRetries,
      'maxRetries',
      DEFAULT_MENU_MAX_RETRIES,
      MENU_RETRY_RANGE,
    ),
  };
}

function parseQueue(config: Record<string, unknown>): QueueConfig {
  return { queueName: requiredText(config.queueName, 'queueName') };
}

function parseTransfer(config: Record<string, unknown>): TransferConfig {
  return { transferNumber: requiredText(config.transferNumber, 'transferNumber') };
}

function parseSms(config: Record<string, unknown>): SmsConfig {
  return {
    smsTemplateId: requiredText(config.smsTemplateId, 'smsTemplateId'),
    targetSource: parseTargetSource(config.targetSource),
  };
}

function parseOptOut(config: Record<string, unknown>): OptOutConfig {
  const targetSource = parseTargetSource(config.targetSource);
  if (config.action === undefined || config.action === null) {
    return { action: 'REGISTER', targetSource };
  }
  const action = requiredText(config.action, 'action').toUpperCase();
  if (!OPT_OUT_ACTIONS.includes(action)) {
    throw new Error(`unknown OPT_OUT action: ${config.action}`);
  }
  return { action: action as OptOutConfig['action'], targetSource };
}

/** 없으면 발신번호다. 이 필드가 생기기 전에 저장된 그래프의 렌더 결과가 바뀌면 안 된다. */
function parseTargetSource(value: unknown): DigitTargetSource {
  if (value === undefined || value === null) return 'CALLER';
  const text = requiredText(value, 'targetSource').toUpperCase();
  if (!(DIGIT_TARGET_SOURCES as readonly string[]).includes(text)) {
    throw new Error(`unknown targetSource: ${value}`);
  }
  return text as DigitTargetSource;
}

function parseCollectDigits(config: Record<string, unknown>): CollectDigitsConfig {
  const minDigits = boundedInteger(
    config.minDigits, 'minDigits', DEFAULT_COLLECT_MIN_DIGITS, COLLECT_DIGIT_RANGE,
  );
  const maxDigits = boundedInteger(
    config.maxDigits, 'maxDigits', DEFAULT_COLLECT_MAX_DIGITS, COLLECT_DIGIT_RANGE,
  );
  if (minDigits > maxDigits) {
    throw new Error('minDigits must not be greater than maxDigits');
  }

  return {
    promptKey: optionalText(config.promptKey, 'promptKey'),
    minDigits,
    maxDigits,
    timeoutSeconds: boundedInteger(
      config.timeoutSeconds, 'timeoutSeconds', DEFAULT_MENU_TIMEOUT_SECONDS, MENU_TIMEOUT_RANGE,
    ),
    maxRetries: boundedInteger(
      config.maxRetries, 'maxRetries', DEFAULT_MENU_MAX_RETRIES, MENU_RETRY_RANGE,
    ),
  };
}

function parseHttpLookup(config: Record<string, unknown>): HttpLookupConfig {
  return {
    endpointId: requiredText(config.endpointId, 'endpointId'),
    waitPromptKey: optionalText(config.waitPromptKey, 'waitPromptKey'),
  };
}

function parseCondition(config: Record<string, unknown>): ConditionConfig {
  const conditionType = requiredText(config.conditionType, 'conditionType').toUpperCase();
  if (!CONDITION_TYPES.includes(conditionType)) {
    throw new Error(`unknown CONDITION type: ${config.conditionType}`);
  }

  if (conditionType === 'HOLIDAY') {
    return { conditionType: 'HOLIDAY', timeStart: null, timeEnd: null, daysOfWeek: [] };
  }

  return {
    conditionType: 'TIME_RANGE',
    timeStart: requiredTime(config.timeStart, 'timeStart'),
    timeEnd: requiredTime(config.timeEnd, 'timeEnd'),
    daysOfWeek: toCleanStringList(config.daysOfWeek, 'daysOfWeek')
      .map((day) => day.toLowerCase())
      .filter((day) => WEEKDAYS.includes(day)),
  };
}

function parseHangup(config: Record<string, unknown>): HangupConfig {
  return { promptKey: optionalText(config.promptKey, 'promptKey') };
}

function assertNoNewline(value: string, field: string): string {
  if (/[\r\n]/.test(value)) {
    throw new Error(`${field} must not contain a newline`);
  }
  return value;
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${field} is required`);
  }
  const trimmed = assertNoNewline(value, field).trim();
  if (!trimmed) {
    throw new Error(`${field} is required`);
  }
  return trimmed;
}

function optionalText(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new Error(`${field} must be a string`);
  }
  const trimmed = assertNoNewline(value, field).trim();
  return trimmed || null;
}

function requiredTime(value: unknown, field: string): string {
  const text = requiredText(value, field);
  if (!TIME_PATTERN.test(text)) {
    throw new Error(`${field} must be HH:MM`);
  }
  return text;
}

function boundedInteger(
  value: unknown,
  field: string,
  fallback: number,
  range: { min: number; max: number },
): number {
  if (value === undefined || value === null) return fallback;
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < range.min || parsed > range.max) {
    throw new Error(`${field} must be an integer between ${range.min} and ${range.max}`);
  }
  return parsed;
}

function toCleanStringList(value: unknown, field: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array`);
  }
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => assertNoNewline(item, field).trim())
    .filter((item) => item.length > 0);
}
