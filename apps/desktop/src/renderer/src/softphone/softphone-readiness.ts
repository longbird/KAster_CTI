import type { SoftphoneState } from './softphone-runtime';

export interface SoftphoneReadinessItem {
  key: 'runtime' | 'config' | 'transport' | 'registration' | 'diagnostics';
  label: string;
  status: 'ok' | 'warning' | 'error';
  detail: string;
  hint: string | null;
}

export interface SoftphoneReadiness {
  overall: 'ready' | 'degraded' | 'blocked';
  items: SoftphoneReadinessItem[];
}

function hasInboundRtp(diagnostics: SoftphoneState['diagnostics']) {
  return diagnostics.some((diagnostic) => (
    diagnostic.code === 'MEDIA_RTP_STATS'
    && diagnostic.severity === 'info'
    && /inbound=(?!0\/0)([1-9][0-9]*)\//.test(diagnostic.message)
  ));
}

function selectReadinessDiagnostic(softphone: SoftphoneState | null) {
  const diagnostics = softphone?.diagnostics ?? [];
  if (!diagnostics.length) {
    return null;
  }

  if (hasInboundRtp(diagnostics)) {
    return diagnostics.find((diagnostic) => diagnostic.code === 'MEDIA_RTP_STATS' && diagnostic.severity === 'info')
      ?? diagnostics[0];
  }

  return diagnostics[0];
}

export function evaluateSoftphoneReadiness(input: {
  runtimeConnection: 'idle' | 'connected' | 'reconnecting' | 'disconnected' | 'error';
  softphone: SoftphoneState | null;
}): SoftphoneReadiness {
  const softphone = input.softphone;
  const latestDiagnostic = selectReadinessDiagnostic(softphone);
  const configReady = Boolean(
    softphone?.config.enabled
    && softphone.config.sipUri
    && softphone.config.wsServer
    && softphone.config.authorizationUsername,
  );

  const items: SoftphoneReadinessItem[] = [
    {
      key: 'runtime',
      label: 'CTI Runtime',
      status:
        input.runtimeConnection === 'connected'
          ? 'ok'
          : input.runtimeConnection === 'reconnecting'
            ? 'warning'
            : 'error',
      detail: input.runtimeConnection,
      hint:
        input.runtimeConnection === 'connected'
          ? null
          : '상담원 서버 연결과 로그인 세션을 다시 확인하세요.',
    },
    {
      key: 'config',
      label: 'Softphone 설정',
      status: configReady ? 'ok' : 'error',
      detail: softphone?.config.enabled ? 'enabled' : 'disabled',
      hint:
        configReady
          ? null
          : softphone?.config.enabled
          ? 'SIP URI, WSS 주소, 인증 계정 누락 여부를 확인하세요.'
          : '콜센터 서버에서 desktop softphone 설정이 내려오는지 확인하세요.',
    },
    {
      key: 'transport',
      label: 'WSS Transport',
      status:
        softphone?.transport === 'connected'
          ? 'ok'
          : softphone?.transport === 'connecting'
            ? 'warning'
            : 'error',
      detail: softphone?.transport ?? 'not-configured',
      hint:
        softphone?.transport === 'connected'
          ? null
          : 'PBX WSS 주소, 인증서, 방화벽 포트를 점검하세요.',
    },
    {
      key: 'registration',
      label: 'SIP Registration',
      status:
        softphone?.registration === 'registered'
          ? 'ok'
          : softphone?.registration === 'registering'
            ? 'warning'
            : 'error',
      detail: softphone?.registration ?? 'disabled',
      hint:
        softphone?.registration === 'registered'
          ? null
          : softphone?.lastError ?? '내선 인증 정보와 PBX 응답을 확인하세요.',
    },
    {
      key: 'diagnostics',
      label: '최근 진단',
      status: latestDiagnostic
        ? latestDiagnostic.severity === 'error'
          ? 'error'
          : latestDiagnostic.severity === 'warning'
            ? 'warning'
            : 'ok'
        : 'ok',
      detail: latestDiagnostic ? latestDiagnostic.message : '최근 진단 없음',
      hint: latestDiagnostic?.hint ?? null,
    },
  ];

  const overall = items.some((item) => item.status === 'error')
    ? 'blocked'
    : items.some((item) => item.status === 'warning')
      ? 'degraded'
      : 'ready';

  return {
    overall,
    items,
  };
}
