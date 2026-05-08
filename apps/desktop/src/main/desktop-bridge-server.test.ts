import { afterEach, describe, expect, it } from 'vitest';
import { DesktopBridgeServer } from './desktop-bridge-server';

describe('DesktopBridgeServer', () => {
  let server: DesktopBridgeServer | null = null;

  afterEach(async () => {
    await server?.stop();
    server = null;
  });

  it('returns a desktop health payload on /health', async () => {
    server = new DesktopBridgeServer({
      port: 0,
    });

    await server.start();
    const address = server.getAddress();
    const response = await fetch(`http://${address.host}:${address.port}/health`);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.protocol).toBe('kaster-agent');
    expect(payload.host).toBe('127.0.0.1');
    expect(payload.port).toBe(address.port);
    expect(payload.status).toBe('ok');
  });

  it('reports handoff status for known and unknown tokens', async () => {
    server = new DesktopBridgeServer({
      port: 0,
    });

    await server.start();
    server.markHandoffStatus('handoff-1', {
      state: 'connected',
    });

    const address = server.getAddress();
    const connectedResponse = await fetch(
      `http://${address.host}:${address.port}/handoff-status?handoffToken=handoff-1`,
    );
    const unknownResponse = await fetch(
      `http://${address.host}:${address.port}/handoff-status?handoffToken=handoff-missing`,
    );
    const connectedPayload = await connectedResponse.json();
    const unknownPayload = await unknownResponse.json();

    expect(connectedPayload.state).toBe('connected');
    expect(unknownPayload.state).toBe('unknown');
  });

  it('returns diagnostics payload when a provider is configured', async () => {
    server = new DesktopBridgeServer({
      port: 0,
      getDiagnostics: () => ({
        runtimeConnected: true,
        events: [{ stage: 'test' }],
      }),
    });

    await server.start();
    const address = server.getAddress();
    const response = await fetch(`http://${address.host}:${address.port}/diagnostics`);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.diagnostics.runtimeConnected).toBe(true);
    expect(payload.diagnostics.events[0].stage).toBe('test');
  });

  it('supports start-stop lifecycle without leaking the listening port', async () => {
    server = new DesktopBridgeServer({
      port: 0,
    });

    await server.start();
    const firstPort = server.getAddress().port;
    await server.stop();
    await server.start();

    expect(server.getAddress().port).toBeGreaterThan(0);
    expect(firstPort).toBeGreaterThan(0);
  });

  it('treats concurrent start calls as one in-flight listen operation', async () => {
    server = new DesktopBridgeServer({
      port: 0,
    });

    await Promise.all([
      server.start(),
      server.start(),
      server.start(),
    ]);

    const address = server.getAddress();
    const response = await fetch(`http://${address.host}:${address.port}/health`);

    expect(response.status).toBe(200);
    expect(address.port).toBeGreaterThan(0);
  });
});
