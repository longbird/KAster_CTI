import type { DesktopAuthSession } from './auth-client';
import type { DesktopConfig } from '../shared/ipc';
import type { CtiEvent } from '../shared/cti';

interface RuntimeLike {
  connect(handlers: {
    onEvent: (event: CtiEvent) => void;
    onConnectionState?: (payload: {
      state: 'connected' | 'reconnecting' | 'disconnected' | 'error';
      reason?: string;
    }) => void;
  }): void;
  disconnect(): void;
}

export class RuntimeSupervisor {
  private runtime: RuntimeLike | null = null;
  private recoveryScheduled = false;

  constructor(
    private readonly options: {
      loadConfig: () => Promise<DesktopConfig | null>;
      loadSession: () => Promise<DesktopAuthSession | null>;
      saveSession: (session: DesktopAuthSession) => Promise<void>;
      refreshSession: (session: DesktopAuthSession) => Promise<DesktopAuthSession>;
      createRuntime: (input: { baseUrl: string; accessToken: string }) => RuntimeLike;
      broadcast: (event: CtiEvent) => void;
      scheduleRecovery: (task: () => Promise<void>) => void;
    },
  ) {}

  async connect() {
    const config = await this.options.loadConfig();
    const session = await this.options.loadSession();
    if (!config || !session) {
      throw new Error('Desktop runtime prerequisites are missing.');
    }

    this.startRuntime(config, session);
  }

  disconnect() {
    this.runtime?.disconnect();
    this.runtime = null;
  }

  private startRuntime(config: DesktopConfig, session: DesktopAuthSession) {
    this.runtime?.disconnect();
    this.runtime = this.options.createRuntime({
      baseUrl: config.serverUrl,
      accessToken: session.accessToken,
    });
    this.runtime.connect({
      onEvent: (event) => this.options.broadcast(event),
      onConnectionState: (payload) => {
        this.options.broadcast({
          type: 'runtime.connection.changed',
          payload,
        });
        if (payload.state === 'disconnected' || payload.state === 'error') {
          this.scheduleRecovery();
        }
      },
    });
  }

  private scheduleRecovery() {
    if (this.recoveryScheduled) {
      return;
    }

    this.recoveryScheduled = true;
    this.options.scheduleRecovery(async () => {
      this.recoveryScheduled = false;
      await this.recover();
    });
  }

  private async recover() {
    const config = await this.options.loadConfig();
    const storedSession = await this.options.loadSession();
    if (!config || !storedSession) {
      return;
    }

    let session = storedSession;
    try {
      session = await this.options.refreshSession(storedSession);
      await this.options.saveSession(session);
    } catch {
      session = storedSession;
    }

    this.startRuntime(config, session);
  }
}
