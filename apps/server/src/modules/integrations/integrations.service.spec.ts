import { IntegrationsService } from './integrations.service';

describe('IntegrationsService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('sends a real webhook test request and records lastTriggeredAt', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 202,
      text: jest.fn().mockResolvedValue('accepted'),
    });
    global.fetch = fetchMock as any;

    const prisma = {
      integrationAutomations: {
        findFirst: jest.fn().mockResolvedValue({
          integrationAutomationId: 'integration-1',
          tenantId: 'tenant-1',
          type: 'WEBHOOK',
          name: '콜 알림',
          config: {
            url: 'https://example.invalid/hook',
            secret: 'secret-1',
            headers: { 'x-extra': 'yes' },
          },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    } as any;
    const service = new IntegrationsService(prisma);

    const result = await service.test('tenant-1', 'integration-1', {
      payload: { source: 'admin-test' },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.invalid/hook',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'content-type': 'application/json',
          'x-kaster-secret': 'secret-1',
          'x-extra': 'yes',
        }),
      }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      type: 'WEBHOOK',
      name: '콜 알림',
      payload: { source: 'admin-test' },
    });
    expect(prisma.integrationAutomations.update).toHaveBeenCalledWith({
      where: { integrationAutomationId: 'integration-1' },
      data: { lastTriggeredAt: expect.any(Date) },
    });
    expect(result).toMatchObject({
      ok: true,
      dryRun: false,
      status: 202,
      responseBody: 'accepted',
    });
  });

  it('builds a VIX HTTP target from host, port, and route', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue('ok'),
    });
    global.fetch = fetchMock as any;

    const prisma = {
      integrationAutomations: {
        findFirst: jest.fn().mockResolvedValue({
          integrationAutomationId: 'integration-1',
          tenantId: 'tenant-1',
          type: 'VIX_PHONE',
          name: '전화 자동화',
          config: {
            host: '10.0.0.10',
            port: 8080,
            route: '/vix/phone',
            authToken: 'token-1',
          },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    } as any;
    const service = new IntegrationsService(prisma);

    await service.test('tenant-1', 'integration-1', { payload: {} });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://10.0.0.10:8080/vix/phone',
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: 'Bearer token-1',
        }),
      }),
    );
  });
});
