export const SMDR_EVENT_TYPE_OPTIONS = [
  { value: 'CALL_START', label: '통화 시작' },
  { value: 'CALL_ANSWER', label: '통화 응답' },
  { value: 'CALL_END', label: '통화 종료' },
  { value: 'QUEUE_ENTER', label: '대기열 진입' },
  { value: 'TRANSFER', label: '전환' },
];

export interface SmdrProfile {
  enabled?: boolean;
  endpointUrl?: string | null;
  authToken?: string | null;
  secret?: string | null;
  timeoutSeconds?: number | null;
  eventTypes?: string[] | null;
}

export interface SmdrFormFields {
  smdrEnabled?: boolean;
  smdrEndpointUrl?: string;
  smdrAuthToken?: string;
  smdrSecret?: string;
  smdrTimeoutSeconds?: number;
  smdrEventTypes?: string[];
}

function normalizeOptionalText(value?: string | null): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeTimeoutSeconds(value?: number | null): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 5;
  }
  return Math.max(1, Math.min(30, Math.trunc(value)));
}

function normalizeEventTypes(value?: string[] | null): string[] {
  const eventTypes = Array.from(new Set((value ?? []).map((item) => item.trim()).filter(Boolean)));
  return eventTypes.length > 0 ? eventTypes : ['CALL_END'];
}

export function hydrateSmdrFormFields(profile?: SmdrProfile | null): Required<SmdrFormFields> {
  return {
    smdrEnabled: profile?.enabled ?? false,
    smdrEndpointUrl: profile?.endpointUrl ?? '',
    smdrAuthToken: profile?.authToken ?? '',
    smdrSecret: profile?.secret ?? '',
    smdrTimeoutSeconds: normalizeTimeoutSeconds(profile?.timeoutSeconds),
    smdrEventTypes: normalizeEventTypes(profile?.eventTypes),
  };
}

export function buildSmdrPayload(values: SmdrFormFields) {
  return {
    enabled: values.smdrEnabled ?? false,
    endpointUrl: normalizeOptionalText(values.smdrEndpointUrl),
    authToken: normalizeOptionalText(values.smdrAuthToken),
    secret: normalizeOptionalText(values.smdrSecret),
    timeoutSeconds: normalizeTimeoutSeconds(values.smdrTimeoutSeconds),
    eventTypes: normalizeEventTypes(values.smdrEventTypes),
  };
}
