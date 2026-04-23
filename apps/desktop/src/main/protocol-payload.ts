export interface DesktopProtocolPingPayload {
  type: 'ping';
}

export interface DesktopProtocolConnectPayload {
  type: 'connect';
  serverUrl: string;
  handoffToken: string;
  channel?: string;
}

export type DesktopProtocolPayload = DesktopProtocolPingPayload | DesktopProtocolConnectPayload;
type ProtocolConnectListener = (payload: DesktopProtocolConnectPayload) => void;

function invalidProtocolPayload(): never {
  throw new Error('Invalid protocol payload');
}

function normalizeServerUrl(raw: string | null): string {
  const trimmed = raw?.trim();
  if (!trimmed) {
    invalidProtocolPayload();
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    invalidProtocolPayload();
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    invalidProtocolPayload();
  }

  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

export function parseProtocolPayload(input: string): DesktopProtocolPayload {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    invalidProtocolPayload();
  }

  if (url.protocol !== 'kaster-agent:') {
    invalidProtocolPayload();
  }

  const route = (url.host || url.pathname.replace(/^\/+/, '')).trim().toLowerCase();
  if (route === 'ping') {
    return { type: 'ping' };
  }

  if (route !== 'connect') {
    invalidProtocolPayload();
  }

  const handoffToken = url.searchParams.get('handoffToken')?.trim();
  if (!handoffToken) {
    invalidProtocolPayload();
  }

  const channel = url.searchParams.get('channel')?.trim() || undefined;

  return {
    type: 'connect',
    serverUrl: normalizeServerUrl(url.searchParams.get('serverUrl')),
    handoffToken,
    ...(channel ? { channel } : {}),
  };
}

export class ProtocolConnectInbox {
  private readonly pending: DesktopProtocolConnectPayload[] = [];
  private listener: ProtocolConnectListener | null = null;
  private ready = false;

  enqueue(payload: DesktopProtocolConnectPayload) {
    if (!this.listener || !this.ready) {
      this.pending.push(payload);
      return;
    }

    this.listener(payload);
  }

  attach(listener: ProtocolConnectListener) {
    this.listener = listener;
    this.flush();
  }

  markReady() {
    this.ready = true;
    this.flush();
  }

  reset() {
    this.listener = null;
    this.ready = false;
  }

  private flush() {
    if (!this.listener || !this.ready || this.pending.length === 0) {
      return;
    }

    const queued = this.pending.splice(0, this.pending.length);
    queued.forEach((payload) => {
      this.listener?.(payload);
    });
  }
}
