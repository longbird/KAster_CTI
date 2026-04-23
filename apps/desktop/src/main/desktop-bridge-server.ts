import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

interface DesktopBridgeServerOptions {
  host?: string;
  port?: number;
}

interface DesktopBridgeAddress {
  host: string;
  port: number;
}

interface HandoffStatus {
  state: 'pending' | 'connected' | 'failed' | 'unknown';
  reason?: string;
}

export class DesktopBridgeServer {
  private readonly host: string;
  private readonly port: number;
  private server: ReturnType<typeof createServer> | null = null;
  private address: DesktopBridgeAddress | null = null;
  private startPromise: Promise<void> | null = null;
  private readonly handoffStatuses = new Map<string, HandoffStatus>();

  constructor(options?: DesktopBridgeServerOptions) {
    this.host = options?.host ?? '127.0.0.1';
    this.port = options?.port ?? 48125;
  }

  async start(): Promise<void> {
    if (this.server && this.address) {
      return;
    }

    if (this.startPromise) {
      await this.startPromise;
      return;
    }

    this.startPromise = this.startInternal();
    try {
      await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  private async startInternal(): Promise<void> {
    const server = createServer((request, response) => {
      this.handleRequest(request, response);
    });

    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(this.port, this.host, () => {
          server.off('error', reject);
          resolve();
        });
      });
    } catch (error) {
      server.close();
      throw error;
    }

    const address = server.address();
    if (!address || typeof address === 'string') {
      server.close();
      throw new Error('Desktop bridge address is unavailable.');
    }

    this.server = server;
    this.address = {
      host: this.host,
      port: address.port,
    };
  }

  async stop(): Promise<void> {
    if (this.startPromise) {
      await this.startPromise;
    }

    if (!this.server) {
      this.address = null;
      return;
    }

    const server = this.server;
    this.server = null;
    this.address = null;
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        server.off('error', reject);
        resolve();
      });
    });
  }

  getAddress(): DesktopBridgeAddress {
    if (!this.address) {
      throw new Error('Desktop bridge server is not running.');
    }

    return this.address;
  }

  markHandoffStatus(handoffToken: string, status: HandoffStatus) {
    if (!handoffToken) {
      return;
    }

    this.handoffStatuses.set(handoffToken, status);
  }

  private handleRequest(request: IncomingMessage, response: ServerResponse) {
    const requestUrl = new URL(request.url ?? '/', `http://${this.host}:${this.port}`);

    if (request.method === 'GET' && requestUrl.pathname === '/health') {
      const address = this.getAddress();
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({
        ok: true,
        status: 'ok',
        app: 'kaster-agent-desktop',
        protocol: 'kaster-agent',
        host: address.host,
        port: address.port,
        pid: process.pid,
      }));
      return;
    }

    if (request.method === 'GET' && requestUrl.pathname === '/handoff-status') {
      const handoffToken = requestUrl.searchParams.get('handoffToken') ?? '';
      const status = this.handoffStatuses.get(handoffToken) ?? { state: 'unknown' as const };
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({
        ok: true,
        handoffToken,
        ...status,
      }));
      return;
    }

    if (request.method !== 'GET') {
      response.writeHead(404, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ ok: false }));
      return;
    }

    response.writeHead(404, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ ok: false }));
  }
}
