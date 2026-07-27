import { describe, expect, it } from 'vitest';
import { buildNumberResourceRows } from './numberResources';

describe('buildNumberResourceRows', () => {
  it('builds DID, extension, queue extension, and feature-code resources with target routes', () => {
    const rows = buildNumberResourceRows({
      dids: [
        {
          id: 'did-1',
          did: '07010001000',
          description: '대표 DID',
          ivrMenuName: 'ARS 1',
          primaryQueueName: null,
          isActive: true,
        },
      ],
      agents: [
        {
          agentId: 'agent-1',
          agentName: '홍길동',
          loginId: 'agent1',
          extension: '1001',
          isActive: true,
        },
      ],
      queues: [
        {
          queueId: 'queue-1',
          queueDisplayName: '상담 대표',
          queueName: 'support',
          queueExten: '5001',
          isActive: true,
        },
      ],
    });

    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          number: '07010001000',
          resourceType: 'DID',
          routeSummary: 'ARS 사용',
          targetRoute: '/asterisk?tab=dids&resourceId=did-1',
        }),
        expect.objectContaining({
          number: '1001',
          resourceType: 'EXTENSION',
          targetRoute: '/settings/agents?resourceId=agent-1',
        }),
        expect.objectContaining({
          number: '5001',
          resourceType: 'QUEUE',
          targetRoute: '/settings/queues?resourceId=queue-1',
        }),
        expect.objectContaining({
          number: '*8',
          resourceType: 'FEATURE_CODE',
          routeSummary: '대리응답',
          targetRoute: '/live-calls?feature=pickup',
        }),
      ]),
    );
  });

  it('uses source DID routing fields when display names are not loaded', () => {
    const rows = buildNumberResourceRows({
      dids: [
        {
          id: 'did-ivr',
          did: '07020001000',
          ivrMenuId: 'ivr-1',
          isActive: true,
        },
        {
          id: 'did-queue',
          did: '07020002000',
          directQueue: 'support',
          isActive: true,
        },
      ],
      agents: [],
    });

    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ number: '07020001000', routeSummary: 'ARS 사용' }),
        expect.objectContaining({ number: '07020002000', routeSummary: '호 분배룰 support' }),
      ]),
    );
  });

  it('marks duplicate numbers as conflicts', () => {
    const rows = buildNumberResourceRows({
      dids: [],
      agents: [
        { agentId: 'agent-1', agentName: 'A', loginId: 'a', extension: '1001', isActive: true },
      ],
      queues: [
        { queueId: 'queue-1', queueName: 'support', queueExten: '1001', isActive: true },
      ],
    });

    expect(rows.filter((row) => row.number === '1001').every((row) => row.hasConflict)).toBe(true);
  });
});
