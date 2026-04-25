import { ServiceUnavailableException } from '@nestjs/common';
import { SmartArsRuntimeService } from './smart-ars-runtime.service';

describe('SmartArsRuntimeService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends the selected SMS template to the caller through the configured webhook', async () => {
    const prisma = {
      asteriskBlocklistEntry: { findFirst: jest.fn().mockResolvedValue(null) },
      tenantSmsTemplate: {
        findFirst: jest.fn().mockResolvedValue({
          templateId: 'tpl-1',
          templateName: '예약 안내',
          content: '예약 안내 문자',
          category: 'RESERVATION_ALERT',
        }),
      },
    } as any;
    const optOut = { register: jest.fn() } as any;
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'SMART_ARS_SMS_WEBHOOK_URL') return 'http://sms-gateway.local/send';
        if (key === 'SMART_ARS_SMS_WEBHOOK_SECRET') return 'sms-secret';
        return undefined;
      }),
    } as any;
    const fetchMock = jest.spyOn(global, 'fetch' as any).mockResolvedValue({ ok: true, status: 200 } as any);
    const service = new SmartArsRuntimeService(prisma, optOut, config);

    const result = await service.sendSms({
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      entryDid: '07070001111',
      requesterPhoneNumber: '010-1234-5678',
      smsTemplateId: 'tpl-1',
    });

    expect(result.delivered).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://sms-gateway.local/send',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'content-type': 'application/json',
          'x-kaster-smart-ars-secret': 'sms-secret',
        }),
        body: JSON.stringify({
          tenantId: 'tenant-1',
          branchId: 'branch-1',
          entryDid: '07070001111',
          to: '01012345678',
          templateId: 'tpl-1',
          templateName: '예약 안내',
          content: '예약 안내 문자',
          sourceType: 'SMART_ARS_SMS',
        }),
      }),
    );
  });

  it('registers caller opt-out through the shared opt-out runtime', async () => {
    const prisma = {
      asteriskBlocklistEntry: { findFirst: jest.fn() },
      tenantSmsTemplate: { findFirst: jest.fn() },
    } as any;
    const optOut = {
      register: jest.fn().mockResolvedValue({ action: 'REGISTER', tenantId: 'tenant-1' }),
    } as any;
    const service = new SmartArsRuntimeService(prisma, optOut, { get: jest.fn() } as any);

    await service.registerOptOut({
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      entryDid: '07070001111',
      requesterPhoneNumber: '010-1234-5678',
      smsTemplateId: '',
    });

    expect(optOut.register).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      entryDid: '07070001111',
      requesterPhoneNumber: '01012345678',
      sourceType: 'SMART_ARS_OPT_OUT',
      smsTemplateId: null,
    });
  });

  it('fails SMS execution when no delivery webhook is configured', async () => {
    const service = new SmartArsRuntimeService(
      {
        asteriskBlocklistEntry: { findFirst: jest.fn().mockResolvedValue(null) },
        tenantSmsTemplate: { findFirst: jest.fn().mockResolvedValue({ templateId: 'tpl-1', templateName: 'T', content: 'C' }) },
      } as any,
      { register: jest.fn() } as any,
      { get: jest.fn().mockReturnValue(undefined) } as any,
    );

    await expect(service.sendSms({
      tenantId: 'tenant-1',
      branchId: null,
      entryDid: '07070001111',
      requesterPhoneNumber: '01012345678',
      smsTemplateId: 'tpl-1',
    })).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
