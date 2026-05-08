import { describe, expect, it } from 'vitest';
import { evaluateSoftphoneReadiness } from './softphone-readiness';

describe('evaluateSoftphoneReadiness', () => {
  it('정상 구성에서는 준비 완료 체크를 반환한다', () => {
    const readiness = evaluateSoftphoneReadiness({
      runtimeConnection: 'connected',
      softphone: {
        registration: 'registered',
        transport: 'connected',
        config: {
          enabled: true,
          sipUri: 'sip:1001@pbx.example.com',
          wsServer: 'wss://pbx.example.com:8089/ws',
          authorizationUsername: '1001',
          displayName: '상담원1',
          iceServers: [],
        },
        lastError: null,
        diagnostics: [],
        session: null,
        remoteAudioActive: false,
        localMuted: false,
        localHold: false,
      },
    });

    expect(readiness.overall).toBe('ready');
    expect(readiness.items.map((item) => item.status)).toEqual(['ok', 'ok', 'ok', 'ok', 'ok']);
    expect(readiness.items[1].hint).toBeNull();
  });

  it('runtime 단절과 softphone 진단이 있으면 blocked 상태와 조치 문구를 반환한다', () => {
    const readiness = evaluateSoftphoneReadiness({
      runtimeConnection: 'disconnected',
      softphone: {
        registration: 'error',
        transport: 'not-connected',
        config: {
          enabled: true,
          sipUri: 'sip:1001@pbx.example.com',
          wsServer: 'wss://pbx.example.com:8089/ws',
          authorizationUsername: '1001',
          displayName: '상담원1',
          iceServers: [],
        },
        lastError: 'register failed',
        diagnostics: [
          {
            code: 'REGISTER_FAILED',
            message: 'SIP 등록 실패',
            hint: 'PBX 계정과 WSS 응답을 확인하세요.',
            source: 'registration',
            severity: 'error',
            occurredAt: '2026-04-23T00:00:00.000Z',
          },
        ],
        session: null,
        remoteAudioActive: false,
        localMuted: false,
        localHold: false,
      },
    });

    expect(readiness.overall).toBe('blocked');
    expect(readiness.items[0]).toMatchObject({
      key: 'runtime',
      status: 'error',
    });
    expect(readiness.items[4]).toMatchObject({
      key: 'diagnostics',
      status: 'error',
      hint: 'PBX 계정과 WSS 응답을 확인하세요.',
    });
  });

  it('설정이 비활성화되면 config 관련 항목을 error 로 표시한다', () => {
    const readiness = evaluateSoftphoneReadiness({
      runtimeConnection: 'connected',
      softphone: {
        registration: 'disabled',
        transport: 'not-configured',
        config: {
          enabled: false,
          sipUri: null,
          wsServer: null,
          authorizationUsername: null,
          displayName: '상담원1',
          iceServers: [],
        },
        lastError: null,
        diagnostics: [],
        session: null,
        remoteAudioActive: false,
        localMuted: false,
        localHold: false,
      },
    });

    expect(readiness.overall).toBe('blocked');
    expect(readiness.items[1]).toMatchObject({
      key: 'config',
      status: 'error',
    });
    expect(readiness.items[2]).toMatchObject({
      key: 'transport',
      status: 'error',
    });
  });

  it('성공한 미디어 진단은 준비 상태를 degraded 로 낮추지 않는다', () => {
    const readiness = evaluateSoftphoneReadiness({
      runtimeConnection: 'connected',
      softphone: {
        registration: 'registered',
        transport: 'connected',
        config: {
          enabled: true,
          sipUri: 'sip:1001@pbx.example.com',
          wsServer: 'wss://pbx.example.com:8089/ws',
          authorizationUsername: '1001',
          displayName: '상담원1',
          iceServers: [],
        },
        lastError: null,
        diagnostics: [
          {
            code: 'MEDIA_RTP_STATS',
            message: 'RTP audio stats inbound=37440/234, outbound=37440/234',
            hint: '데스크톱까지 오디오 패킷이 도착했고 마이크 송신도 확인됐습니다.',
            source: 'media',
            severity: 'info',
            occurredAt: '2026-05-07T06:45:00.000Z',
          },
        ],
        session: null,
        remoteAudioActive: true,
        localMuted: false,
        localHold: false,
      },
    });

    expect(readiness.overall).toBe('ready');
    expect(readiness.items[4]).toMatchObject({
      key: 'diagnostics',
      status: 'ok',
    });
  });

  it('RTP 수신 성공이 있으면 ICE 후보쌍 카운터 오류만으로 blocked 처리하지 않는다', () => {
    const readiness = evaluateSoftphoneReadiness({
      runtimeConnection: 'connected',
      softphone: {
        registration: 'registered',
        transport: 'connected',
        config: {
          enabled: true,
          sipUri: 'sip:1001@pbx.example.com',
          wsServer: 'wss://pbx.example.com:8089/ws',
          authorizationUsername: '1001',
          displayName: '상담원1',
          iceServers: [],
        },
        lastError: null,
        diagnostics: [
          {
            code: 'MEDIA_ICE_CANDIDATE_PAIR',
            message: 'ICE pair waiting local=relay/udp/49.247.46.86:49196 remote=prflx/udp/:14238 sent=0 recv=0',
            hint: 'ICE 후보쌍에서 수신 바이트가 없습니다.',
            source: 'media',
            severity: 'error',
            occurredAt: '2026-05-08T09:45:01.000Z',
          },
          {
            code: 'MEDIA_RTP_STATS',
            message: 'RTP audio stats inbound=12480/78, outbound=39520/247',
            hint: '데스크톱까지 오디오 패킷이 도착했고 마이크 송신도 확인됐습니다.',
            source: 'media',
            severity: 'info',
            occurredAt: '2026-05-08T09:45:00.000Z',
          },
        ],
        session: null,
        remoteAudioActive: true,
        localMuted: false,
        localHold: false,
      },
    });

    expect(readiness.overall).toBe('ready');
    expect(readiness.items[4]).toMatchObject({
      key: 'diagnostics',
      status: 'ok',
      detail: 'RTP audio stats inbound=12480/78, outbound=39520/247',
    });
  });
});
