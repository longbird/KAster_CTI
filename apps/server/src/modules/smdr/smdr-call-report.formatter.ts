import { REALTIME_EVENTS } from '../realtime/realtime-events';

export type SmdrReportType = 'SAMSUNG_CDR';

export interface SmdrCallSessionPayload {
  callId?: string | null;
  linkedid?: string | null;
  direction?: string | null;
  ani?: string | null;
  dnis?: string | null;
  queueName?: string | null;
  trunkName?: string | null;
  sessionStatus?: string | null;
  startedAt?: string | Date | null;
  ringingAt?: string | Date | null;
  answeredAt?: string | Date | null;
  endedAt?: string | Date | null;
  talkSeconds?: number | null;
  waitSeconds?: number | null;
  primaryAgentId?: string | null;
  primaryAgent?: {
    extension?: string | null;
    agentName?: string | null;
  } | null;
}

export interface SmdrCallReport {
  reportType: SmdrReportType;
  callId: string;
  line: string;
}

export interface SmdrCallReportOptions {
  includeOriginalCallerId?: boolean;
}

const CALL_REPORT_EVENTS = new Set<string>([
  REALTIME_EVENTS.CALL_ENDED,
]);

const SAMSUNG_STANDARD_RECORD_LENGTH = 122;
const SAMSUNG_EXTENDED_RECORD_LENGTH = 154;

export function buildSmdrCallReport(
  event: string,
  payload: SmdrCallSessionPayload,
  now = new Date(),
  options: SmdrCallReportOptions = {},
): SmdrCallReport | null {
  if (!CALL_REPORT_EVENTS.has(event)) return null;
  const callId = payload.callId || payload.linkedid;
  if (!callId) return null;

  return {
    reportType: 'SAMSUNG_CDR',
    callId,
    line: formatSamsungOfficeServCdr(payload, callId, now, options),
  };
}

export function resolveReportType(event: string, payload: SmdrCallSessionPayload): SmdrReportType | null {
  return event === REALTIME_EVENTS.CALL_ENDED && payload ? 'SAMSUNG_CDR' : null;
}

function formatSamsungOfficeServCdr(
  payload: SmdrCallSessionPayload,
  callId: string,
  now: Date,
  options: SmdrCallReportOptions,
) {
  const includeOriginalCallerId = options.includeOriginalCallerId ?? true;
  const ani = includeOriginalCallerId ? payload.ani : null;
  const includeExtendedCallerFields = Boolean(ani || payload.queueName || payload.waitSeconds);
  const body = fixedRecord(includeExtendedCallerFields ? 151 : 119);
  const occurredAt = toDate(payload.startedAt) ?? toDate(payload.answeredAt) ?? toDate(payload.endedAt) ?? now;

  write(body, 2, 6, numericCallIndex(payload.linkedid ?? callId));
  write(body, 9, 6, resolveExtension(payload));
  write(body, 16, 9, '');
  write(body, 26, 14, formatSamsungDateTime(occurredAt));
  write(body, 41, 8, formatHhMmSs(resolveDurationSeconds(payload)));
  write(body, 50, 2, resolveTrunkOrCallType(payload));
  write(body, 53, 18, resolveDialedPhone(payload));
  write(body, 72, 17, '');
  write(body, 90, 10, '0.00', false);
  write(body, 101, 16, ani ?? '');

  if (includeExtendedCallerFields) {
    write(body, 118, 18, '');
    write(body, 137, 6, payload.queueName ?? '');
    write(body, 143, 8, formatHhMmSs(Math.max(0, Number(payload.waitSeconds ?? 0) || 0)));
  }

  const line = body.join('') + '\r\n\0';
  const expectedLength = includeExtendedCallerFields ? SAMSUNG_EXTENDED_RECORD_LENGTH : SAMSUNG_STANDARD_RECORD_LENGTH;
  return line.length === expectedLength ? line : line.padEnd(expectedLength - 1, ' ') + '\0';
}

function resolveExtension(payload: SmdrCallSessionPayload) {
  return payload.primaryAgent?.extension ?? payload.primaryAgentId ?? '';
}

function resolveDurationSeconds(payload: SmdrCallSessionPayload) {
  return Math.max(0, Number(payload.talkSeconds ?? 0) || 0);
}

function resolveDialedPhone(payload: SmdrCallSessionPayload) {
  if (payload.direction === 'outbound') return payload.dnis ?? '';
  return payload.dnis ?? payload.queueName ?? '';
}

function resolveTrunkOrCallType(payload: SmdrCallSessionPayload) {
  const trunk = String(payload.trunkName ?? '').replace(/\D/g, '');
  if (trunk) return trunk.slice(-2).padStart(2, '0');
  if (payload.direction === 'outbound') return 'O';
  if (payload.direction === 'internal') return 'T';
  return 'I';
}

function toDate(value?: string | Date | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// CDR 시각은 서버의 로컬 타임존이 아니라 **명시된 타임존**으로 찍는다.
// getHours() 같은 로컬 접근자를 쓰면 UTC 로 배포된 서버가 CID 프로그램에 9시간 어긋난
// 시각을 보낸다. 현장 프로그램은 이 값을 그대로 통화 이력으로 표시한다.
const CDR_TIMEZONE = process.env.PBX_CDR_TIMEZONE?.trim() || 'Asia/Seoul';

const CDR_DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: CDR_TIMEZONE,
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

function formatSamsungDateTime(value: Date) {
  const parts = Object.fromEntries(
    CDR_DATE_FORMAT.formatToParts(value)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  // hour12:false 는 자정을 '24' 로 주는 구현이 있어 '00' 으로 정규화한다.
  const hh = parts.hour === '24' ? '00' : parts.hour;
  return `${parts.month}/${parts.day} ${hh}:${parts.minute}:${parts.second}`;
}

function formatHhMmSs(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hh = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const mm = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function numericCallIndex(value: string) {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) % 1_000_000;
  }
  return String(hash).padStart(6, '0');
}

function fixedRecord(length: number) {
  return Array.from({ length }, () => ' ');
}

function write(record: string[], start: number, width: number, value: unknown, alignLeft = true) {
  const text = String(value ?? '').replace(/[\r\n\t]/g, ' ').slice(0, width);
  const padded = alignLeft ? text.padEnd(width, ' ') : text.padStart(width, ' ');
  for (let i = 0; i < width; i += 1) {
    record[start + i] = padded[i] ?? ' ';
  }
}
