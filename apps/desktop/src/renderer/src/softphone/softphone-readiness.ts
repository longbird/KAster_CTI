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

export function evaluateSoftphoneReadiness(input: {
  runtimeConnection: 'idle' | 'connected' | 'reconnecting' | 'disconnected' | 'error';
  softphone: SoftphoneState | null;
}): SoftphoneReadiness {
  const softphone = input.softphone;
  const latestDiagnostic = softphone?.diagnostics[0] ?? null;

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
      status:
        softphone?.config.enabled
        && Boolean(softphone.config.sipUri)
        && Boolean(softphone.config.wsServer)
        && Boolean(softphone.config.authorizationUsername)
          ? 'ok'
          : 'error',
      detail: softphone?.config.enabled ? 'enabled' : 'disabled',
      hint:
        softphone?.config.enabled
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
      status: latestDiagnostic ? (latestDiagnostic.severity === 'error' ? 'error' : 'warning') : 'ok',
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
