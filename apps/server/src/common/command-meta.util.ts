import { randomUUID } from 'crypto';

export interface CommandMetaInput {
  correlationId?: string | null;
  idempotencyKey?: string | null;
}

export interface CommandMeta {
  correlationId: string;
  idempotencyKey: string | null;
  requestedAt: string;
}

function coerceCommandMeta(input?: CommandMetaInput | CommandMeta): CommandMeta {
  if (input && typeof input === 'object' && 'requestedAt' in input) {
    return {
      correlationId: input.correlationId,
      idempotencyKey: input.idempotencyKey,
      requestedAt: input.requestedAt,
    };
  }

  return normalizeCommandMeta(input);
}

export function normalizeCommandMeta(input?: CommandMetaInput): CommandMeta {
  const correlationId = input?.correlationId?.trim();
  const idempotencyKey = input?.idempotencyKey?.trim();

  return {
    correlationId: correlationId || randomUUID(),
    idempotencyKey: idempotencyKey || null,
    requestedAt: new Date().toISOString(),
  };
}

export function buildAcceptedCommand<T extends Record<string, unknown>>(
  data: T,
  input?: CommandMetaInput | CommandMeta,
): T & { accepted: true } & CommandMeta {
  const meta = coerceCommandMeta(input);
  return {
    ...data,
    accepted: true,
    ...meta,
  };
}
