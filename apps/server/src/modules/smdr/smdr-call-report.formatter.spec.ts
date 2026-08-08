import { REALTIME_EVENTS } from '../realtime/realtime-events';
import { buildSmdrCallReport, resolveReportType } from './smdr-call-report.formatter';

describe('SMDR call report formatter', () => {
  const now = new Date('2026-07-29T12:34:56+09:00');

  it('skips call creation because Samsung SMDR emits CDR records', () => {
    expect(buildSmdrCallReport(REALTIME_EVENTS.CALL_CREATED, {
      callId: 'call-1',
      direction: 'inbound',
    })).toBeNull();
  });

  it('resolves only ended events to Samsung CDR reports', () => {
    expect(resolveReportType(REALTIME_EVENTS.CALL_CREATED, { direction: 'outbound' })).toBeNull();
    expect(resolveReportType(REALTIME_EVENTS.CALL_ENDED, { direction: 'outbound' })).toBe('SAMSUNG_CDR');
  });

  it('formats an inbound ended call as Samsung OfficeServ extended fixed-width CDR', () => {
    const report = buildSmdrCallReport(
      REALTIME_EVENTS.CALL_ENDED,
      {
        callId: 'call-2',
        linkedid: 'linked-2',
        direction: 'inbound',
        ani: '01012345678',
        dnis: '15990001',
        trunkName: '07012345678',
        queueName: '7001',
        primaryAgent: { extension: '1001' },
        startedAt: now,
        endedAt: now,
        talkSeconds: 37,
        waitSeconds: 5,
      },
      now,
    );

    expect(report?.reportType).toBe('SAMSUNG_CDR');
    expect(report?.line.length).toBe(154);
    expect(report?.line.endsWith('\r\n\0')).toBe(true);
    expect(report?.line.slice(9, 15).trim()).toBe('1001');
    expect(report?.line.slice(26, 40)).toBe('07/29 12:34:56');
    expect(report?.line.slice(41, 49)).toBe('00:00:37');
    expect(report?.line.slice(50, 52)).toBe('78');
    expect(report?.line.slice(53, 71).trim()).toBe('15990001');
    expect(report?.line.slice(101, 117).trim()).toBe('01012345678');
    expect(report?.line.slice(137, 143).trim()).toBe('7001');
    expect(report?.line.slice(143, 151)).toBe('00:00:05');
  });

  it('formats an outbound ended call as Samsung OfficeServ standard fixed-width CDR', () => {
    const report = buildSmdrCallReport(
      REALTIME_EVENTS.CALL_ENDED,
      {
        callId: 'call-3',
        linkedid: 'linked-3',
        direction: 'outbound',
        dnis: '01098765432',
        primaryAgent: { extension: '1001' },
        endedAt: now,
        talkSeconds: 3661,
      },
      now,
    );

    expect(report?.line.length).toBe(122);
    expect(report?.line.slice(9, 15).trim()).toBe('1001');
    expect(report?.line.slice(41, 49)).toBe('01:01:01');
    expect(report?.line.slice(50, 52).trim()).toBe('O');
    expect(report?.line.slice(53, 71).trim()).toBe('01098765432');
  });

  it('omits original caller id when a CID program disables 원번호', () => {
    const report = buildSmdrCallReport(
      REALTIME_EVENTS.CALL_ENDED,
      {
        callId: 'call-5',
        linkedid: 'linked-5',
        direction: 'inbound',
        ani: '01012345678',
        dnis: '15990001',
        primaryAgent: { extension: '1001' },
        endedAt: now,
        talkSeconds: 10,
      },
      now,
      { includeOriginalCallerId: false },
    );

    expect(report?.line.slice(101, 117).trim()).toBe('');
  });

  it('skips non-call status updates', () => {
    expect(buildSmdrCallReport(REALTIME_EVENTS.CALL_UPDATED, {
      callId: 'call-4',
      sessionStatus: 'AFTER_CALL_WORK',
    })).toBeNull();
  });
});

describe('SMDR CDR 시각의 타임존 독립성', () => {
  // 서버가 UTC 로 배포돼도 CID 프로그램에는 KST 로 찍혀야 한다.
  // getHours() 같은 로컬 접근자를 쓰면 9시간 어긋난 통화 이력이 현장에 표시된다.
  const KST_NOON = new Date('2026-07-29T12:34:56+09:00');

  function lineFor(date: Date) {
    return buildSmdrCallReport(REALTIME_EVENTS.CALL_ENDED, {
      callId: 'call-tz',
      direction: 'inbound',
      ani: '15990001',
      dnis: '1001',
      startedAt: date,
      answeredAt: date,
      endedAt: date,
      talkSeconds: 37,
      agentExtension: '1001',
    } as any)?.line;
  }

  it('프로세스 TZ 와 무관하게 같은 시각을 낸다', () => {
    const original = process.env.TZ;
    try {
      const rendered = new Set<string>();
      for (const tz of ['UTC', 'America/New_York', 'Asia/Seoul']) {
        process.env.TZ = tz;
        rendered.add(lineFor(KST_NOON)?.slice(26, 40) ?? 'none');
      }
      expect([...rendered]).toEqual(['07/29 12:34:56']);
    } finally {
      process.env.TZ = original;
    }
  });
});
