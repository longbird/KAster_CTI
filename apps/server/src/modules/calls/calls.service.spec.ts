import { ForbiddenException } from '@nestjs/common';
import { CallsService } from './calls.service';

function createService(overrides?: {
  redisSet?: jest.Mock;
  agentSettingsProfile?: unknown;
}) {
  const redisSet = overrides?.redisSet ?? jest.fn().mockResolvedValue('OK');
  const prisma = {
    agents: {
      findFirst: jest.fn().mockResolvedValue({
        agentId: 'agent-1001',
        extension: '1001',
        role: 'agent',
        settingsProfile: overrides?.agentSettingsProfile ?? {
          outboundDialPermissions: {
            phoneDirect: false,
            phoneDirectAllowedIps: [],
            domestic: true,
            representative: true,
            paid: false,
            international: false,
          },
        },
      }),
    },
    tenantSystemSettings: {
      findUnique: jest.fn().mockResolvedValue({
        allowedOutboundCallerIds: '07052346380',
        defaultOutboundCallerId: '07052346380',
      }),
    },
  };
  const redis = {
    getClient: jest.fn(() => ({
      set: redisSet,
    })),
  };
  const eventBus = {
    publish: jest.fn().mockResolvedValue(undefined),
  };
  const asteriskManager = {
    originate: jest.fn().mockReturnValue({ channel: 'PJSIP/1001' }),
  };
  const sessionEngine = {
    registerPendingOriginate: jest.fn(),
  };

  const service = new CallsService(
    prisma as any,
    redis as any,
    eventBus as any,
    asteriskManager as any,
    {} as any,
    sessionEngine as any,
  );

  return {
    service,
    prisma,
    redisSet,
    eventBus,
    asteriskManager,
    sessionEngine,
  };
}

describe('CallsService client originate protocol', () => {
  const actor = {
    agentId: 'agent-1001',
    extension: '1001',
    role: 'agent',
  };

  it('derives agent extension from the authenticated actor and sends client command metadata', async () => {
    const { service, asteriskManager, eventBus } = createService();

    const result = await service.originateFromClientProtocol(
      'tenant-1',
      {
        commandId: 'cmd-1',
        phoneNumber: '01012345678',
        callerId: '07052346380',
      },
      {
        protocol: 'kaster-desktop-v1',
        timestamp: String(Date.now()),
        nonce: 'nonce-1234567890123456',
      },
      {
        correlationId: 'corr-1',
        idempotencyKey: 'idem-1',
      },
      actor,
    );

    expect(result.data.accepted).toBe(true);
    expect(asteriskManager.originate).toHaveBeenCalledWith({
      agentExtension: '1001',
      phoneNumber: '01012345678',
      callerId: '07052346380',
    });
    expect(eventBus.publish).toHaveBeenCalledWith(
      'client.call.command.originate.accepted',
      expect.objectContaining({
        commandId: 'cmd-1',
        protocol: 'kaster-desktop-v1',
        requestedByAgentId: 'agent-1001',
        requestedByExtension: '1001',
        correlationId: 'corr-1',
        idempotencyKey: 'idem-1',
      }),
      'tenant-1',
    );
  });

  it('rejects stale command timestamps before sending PBX Originate', async () => {
    const { service, asteriskManager } = createService();

    await expect(service.originateFromClientProtocol(
      'tenant-1',
      {
        commandId: 'cmd-1',
        phoneNumber: '01012345678',
      },
      {
        protocol: 'kaster-desktop-v1',
        timestamp: String(Date.now() - 120_000),
        nonce: 'nonce-1234567890123456',
      },
      {
        correlationId: 'corr-1',
        idempotencyKey: 'idem-1',
      },
      actor,
    )).rejects.toBeInstanceOf(ForbiddenException);

    expect(asteriskManager.originate).not.toHaveBeenCalled();
  });

  it('rejects duplicate nonces before sending PBX Originate', async () => {
    const { service, asteriskManager } = createService({
      redisSet: jest.fn().mockResolvedValue(null),
    });

    await expect(service.originateFromClientProtocol(
      'tenant-1',
      {
        commandId: 'cmd-1',
        phoneNumber: '01012345678',
      },
      {
        protocol: 'kaster-desktop-v1',
        timestamp: String(Date.now()),
        nonce: 'nonce-1234567890123456',
      },
      {
        correlationId: 'corr-1',
        idempotencyKey: 'idem-1',
      },
      actor,
    )).rejects.toBeInstanceOf(ForbiddenException);

    expect(asteriskManager.originate).not.toHaveBeenCalled();
  });
});
