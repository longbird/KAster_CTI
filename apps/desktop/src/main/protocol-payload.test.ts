import { describe, expect, it, vi } from 'vitest';
import { ProtocolConnectInbox, parseProtocolPayload } from './protocol-payload';

describe('parseProtocolPayload', () => {
  it('parses connect links with validated query payload', () => {
    const payload = parseProtocolPayload(
      'kaster-agent://connect?serverUrl=https%3A%2F%2Fcti-center-a.example.com&handoffToken=handoff-123&channel=stable',
    );

    expect(payload).toEqual({
      type: 'connect',
      serverUrl: 'https://cti-center-a.example.com',
      handoffToken: 'handoff-123',
      channel: 'stable',
    });
  });

  it('parses ping links', () => {
    expect(parseProtocolPayload('kaster-agent://ping')).toEqual({
      type: 'ping',
    });
  });

  it('rejects invalid protocol payloads', () => {
    expect(() => {
      parseProtocolPayload(
        'kaster-agent://connect?serverUrl=ftp%3A%2F%2Fcti-center-a.example.com&handoffToken=',
      );
    }).toThrow('Invalid protocol payload');
  });
});

describe('ProtocolConnectInbox', () => {
  it('replays queued connect payloads after renderer readiness is declared', () => {
    const listener = vi.fn();
    const inbox = new ProtocolConnectInbox();
    inbox.enqueue({
      type: 'connect',
      serverUrl: 'https://cti-center-a.example.com',
      handoffToken: 'handoff-1',
      channel: 'stable',
    });

    expect(listener).not.toHaveBeenCalled();

    inbox.attach(listener);
    inbox.markReady();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({
      type: 'connect',
      serverUrl: 'https://cti-center-a.example.com',
      handoffToken: 'handoff-1',
      channel: 'stable',
    });
  });

  it('holds delivery again after listener reset for a new window', () => {
    const firstListener = vi.fn();
    const secondListener = vi.fn();
    const inbox = new ProtocolConnectInbox();

    inbox.attach(firstListener);
    inbox.markReady();
    inbox.reset();
    inbox.enqueue({
      type: 'connect',
      serverUrl: 'https://cti-center-b.example.com',
      handoffToken: 'handoff-2',
    });

    expect(firstListener).not.toHaveBeenCalled();

    inbox.attach(secondListener);
    expect(secondListener).not.toHaveBeenCalled();

    inbox.markReady();

    expect(secondListener).toHaveBeenCalledTimes(1);
    expect(secondListener).toHaveBeenCalledWith({
      type: 'connect',
      serverUrl: 'https://cti-center-b.example.com',
      handoffToken: 'handoff-2',
    });
  });
});
