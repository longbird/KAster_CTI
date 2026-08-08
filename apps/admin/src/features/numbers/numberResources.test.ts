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
      ]),
    );
  });

  describe('기능코드', () => {
    // 예전에는 *8 / *2 가 하드코딩돼 늘 ACTIVE 로 보였다. 어느 dialplan 에도
    // 렌더링되지 않았으므로 화면이 사실과 달랐다. 이제 registry 를 그대로 반영한다.
    it('registry 를 받지 못하면 기능코드 행을 만들지 않는다', () => {
      const rows = buildNumberResourceRows({ dids: [], agents: [] });
      expect(rows.filter((row) => row.resourceType === 'FEATURE_CODE')).toEqual([]);
    });

    it('코드가 없는 기능은 행을 만들지 않는다', () => {
      const rows = buildNumberResourceRows({
        dids: [],
        agents: [],
        featureCodes: [
          { featureKey: 'hold', label: '보류', code: null, enabled: false, invocation: 'SERVER_DTMF' },
        ],
      });
      expect(rows.filter((row) => row.resourceType === 'FEATURE_CODE')).toEqual([]);
    });

    it('호출 방식을 표기하고 설정 화면으로 보낸다', () => {
      const rows = buildNumberResourceRows({
        dids: [],
        agents: [],
        featureCodes: [
          { featureKey: 'pickup', label: '대리응답', code: '*8', enabled: true, invocation: 'HANDSET_DIAL' },
          { featureKey: 'hold', label: '보류', code: '*71', enabled: true, invocation: 'SERVER_DTMF' },
        ],
      });

      expect(rows).toEqual(expect.arrayContaining([
        expect.objectContaining({
          number: '*8',
          resourceType: 'FEATURE_CODE',
          routeSummary: '대리응답 · 단말 다이얼',
          status: 'ACTIVE',
          targetRoute: '/asterisk?tab=feature-codes',
        }),
        expect.objectContaining({
          number: '*71',
          // 서버가 보내는 DTMF 다. 단말에서 눌러도 동작하지 않는다는 사실을 표기에 남긴다.
          routeSummary: '보류 · 서버 전송 (단말 다이얼 불가)',
        }),
      ]));
    });

    it('비활성 기능코드는 INACTIVE 로 표시한다', () => {
      const rows = buildNumberResourceRows({
        dids: [],
        agents: [],
        featureCodes: [
          { featureKey: 'pickup', label: '대리응답', code: '*8', enabled: false, invocation: 'HANDSET_DIAL' },
        ],
      });

      expect(rows.find((row) => row.number === '*8')?.status).toBe('INACTIVE');
    });
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
