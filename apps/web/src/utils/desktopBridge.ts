const DESKTOP_BRIDGE_HEALTH_URL = 'http://127.0.0.1:48125/health';

function sleep(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function deriveCenterServerUrl(apiBaseUrl: string) {
  const url = new URL(apiBaseUrl, window.location.origin);
  url.pathname = url.pathname.replace(/\/api\/v\d+\/?$/i, '') || '/';
  return url.toString().replace(/\/$/, '');
}

export function buildDesktopConnectUrl(input: {
  serverUrl: string;
  handoffToken: string;
  channel?: string;
}) {
  const params = new URLSearchParams({
    serverUrl: input.serverUrl,
    handoffToken: input.handoffToken,
  });

  if (input.channel) {
    params.set('channel', input.channel);
  }

  return `kaster-agent://connect?${params.toString()}`;
}

export function launchDesktopProtocol(url: string) {
  const frame = document.createElement('iframe');
  frame.style.display = 'none';
  frame.src = url;
  document.body.appendChild(frame);
  window.setTimeout(() => {
    frame.remove();
  }, 1_000);
}

async function checkDesktopBridgeHealth() {
  try {
    const response = await fetch(DESKTOP_BRIDGE_HEALTH_URL, {
      cache: 'no-store',
    });
    if (!response.ok) {
      return false;
    }

    const payload = (await response.json()) as { status?: string };
    return payload.status === 'ok';
  } catch {
    return false;
  }
}

async function getDesktopHandoffStatus(handoffToken: string) {
  try {
    const response = await fetch(
      `${DESKTOP_BRIDGE_HEALTH_URL.replace(/\/health$/, '/handoff-status')}?handoffToken=${encodeURIComponent(handoffToken)}`,
      {
        cache: 'no-store',
      },
    );

    if (!response.ok) {
      return { state: 'unknown' as const };
    }

    return (await response.json()) as {
      state: 'pending' | 'connected' | 'failed' | 'unknown';
      reason?: string;
    };
  } catch {
    return { state: 'unknown' as const };
  }
}

export async function ensureDesktopAgentReady() {
  if (await checkDesktopBridgeHealth()) {
    return { ready: true as const };
  }

  launchDesktopProtocol('kaster-agent://ping');

  for (let attempt = 0; attempt < 6; attempt += 1) {
    await sleep(500);
    if (await checkDesktopBridgeHealth()) {
      return { ready: true as const };
    }
  }

  return {
    ready: false as const,
    message:
      '소프트폰 사용을 위해 KAster Agent Desktop 이 설치되고 실행 중이어야 합니다. 설치 후 다시 시도해 주세요.',
  };
}

export async function waitForDesktopHandoff(handoffToken: string) {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    await sleep(500);
    const status = await getDesktopHandoffStatus(handoffToken);
    if (status.state === 'connected') {
      return { connected: true as const };
    }

    if (status.state === 'failed') {
      return {
        connected: false as const,
        message: status.reason || '데스크톱 연결에 실패했습니다.',
      };
    }
  }

  return {
    connected: false as const,
    message: '데스크톱 앱이 자동 연결을 완료하지 못했습니다. 앱 설치/실행 상태를 확인해 주세요.',
  };
}
