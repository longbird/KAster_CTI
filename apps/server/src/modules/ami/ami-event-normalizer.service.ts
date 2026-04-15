import { Injectable } from '@nestjs/common';

@Injectable()
export class AmiEventNormalizerService {
  normalize(raw: string): Record<string, any> | null {
    const lines = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (!lines.length) return null;

    const payload: Record<string, any> = {};
    for (const line of lines) {
      const index = line.indexOf(':');
      if (index < 0) continue;
      const key = line.slice(0, index).trim();
      const value = line.slice(index + 1).trim();
      payload[key] = value;
    }

    if (!payload.Event) return null;

    return {
      eventName: payload.Event,
      tenantId: payload.TenantId || '00000000-0000-0000-0000-000000000001',
      linkedid: payload.Linkedid || payload.LinkedId || payload.Uniqueid,
      uniqueid: payload.Uniqueid,
      ani: payload.CallerIDNum || payload.CallerID || payload.CallerIDNum,
      dnis: payload.Exten,
      queueName: payload.Queue || payload.QueueName,
      agentId: payload.Interface || payload.MemberName,
      eventTime: new Date().toISOString(),
      raw: payload,
    };
  }
}
