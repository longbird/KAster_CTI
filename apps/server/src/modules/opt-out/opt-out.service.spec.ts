import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AsteriskConfigInternalController } from '../asterisk-config/asterisk-config.controller';
import { OptOutService } from './opt-out.service';

function createService() {
  const prisma = {
    asteriskBlocklistEntry: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    tenantSmsTemplate: {
      findFirst: jest.fn(),
    },
  } as any;

  return {
    prisma,
    service: new OptOutService(prisma),
  };
}

describe('OptOutService', () => {
  it('stores requester and target phones separately for smart opt-out registration', async () => {
    const { prisma, service } = createService();
    prisma.asteriskBlocklistEntry.findUnique.mockResolvedValue(null);
    prisma.asteriskBlocklistEntry.create.mockResolvedValue({ id: 'entry-1' });
    prisma.tenantSmsTemplate.findFirst.mockResolvedValue(null);

    await service.register({
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      entryDid: '0801234567',
      requesterPhoneNumber: '010-1234-5678',
      targetPhoneNumber: '010-9999-8888',
      sourceType: 'OPT_OUT_080_SMART',
    });

    expect(prisma.asteriskBlocklistEntry.findUnique).toHaveBeenCalledWith({
      where: {
        tenantId_matchType_phoneNumber: {
          tenantId: 'tenant-1',
          matchType: 'EXACT',
          phoneNumber: '01099998888',
        },
      },
    });
    expect(prisma.asteriskBlocklistEntry.create).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant-1',
        matchType: 'EXACT',
        phoneNumber: '01099998888',
        requesterPhoneNumber: '01012345678',
        normalizedPhoneNumber: '01099998888',
        normalizedRequesterPhone: '01012345678',
        sourceType: 'OPT_OUT_080_SMART',
        branchId: 'branch-1',
        entryDid: '0801234567',
        description: null,
        isActive: true,
      },
    });
  });

  it('uses requester ANI as the target phone number for ANI-based registration', async () => {
    const { prisma, service } = createService();
    prisma.asteriskBlocklistEntry.findUnique.mockResolvedValue(null);
    prisma.asteriskBlocklistEntry.create.mockResolvedValue({ id: 'entry-1' });
    prisma.tenantSmsTemplate.findFirst.mockResolvedValue(null);

    await service.register({
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      entryDid: '0801234567',
      requesterPhoneNumber: '010-1234-5678',
      sourceType: 'OPT_OUT_080_ANI',
    });

    expect(prisma.asteriskBlocklistEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          phoneNumber: '01012345678',
          requesterPhoneNumber: '01012345678',
          normalizedPhoneNumber: '01012345678',
          normalizedRequesterPhone: '01012345678',
          sourceType: 'OPT_OUT_080_ANI',
        }),
      }),
    );
  });

  it('treats create unique-conflict races as successful idempotent registration', async () => {
    const { prisma, service } = createService();
    const finalEntry = {
      id: 'entry-race',
      tenantId: 'tenant-1',
      matchType: 'EXACT',
      phoneNumber: '01012345678',
      requesterPhoneNumber: '01012345678',
      normalizedPhoneNumber: '01012345678',
      normalizedRequesterPhone: '01012345678',
      sourceType: 'OPT_OUT_080_ANI',
      branchId: 'branch-1',
      entryDid: '0801234567',
      description: null,
      isActive: true,
    };
    prisma.asteriskBlocklistEntry.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(finalEntry);
    prisma.asteriskBlocklistEntry.create.mockRejectedValueOnce({ code: 'P2002' });
    prisma.asteriskBlocklistEntry.update.mockResolvedValue(finalEntry);
    prisma.tenantSmsTemplate.findFirst.mockResolvedValue(null);

    const result = await service.register({
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      entryDid: '0801234567',
      requesterPhoneNumber: '01012345678',
      sourceType: 'OPT_OUT_080_ANI',
    });

    expect(prisma.asteriskBlocklistEntry.create).toHaveBeenCalledTimes(1);
    expect(prisma.asteriskBlocklistEntry.findUnique).toHaveBeenCalledTimes(2);
    expect(result.blocklistEntry).toEqual(finalEntry);
    expect(result.normalizedPhoneNumber).toBe('01012345678');
  });

  it('deactivates an opt-out-managed EXACT blocklist entry during unregister', async () => {
    const { prisma, service } = createService();
    prisma.asteriskBlocklistEntry.findUnique.mockResolvedValue({
      id: 'entry-1',
      tenantId: 'tenant-1',
      matchType: 'EXACT',
      phoneNumber: '01099998888',
      sourceType: 'OPT_OUT_080_SMART',
      isActive: true,
    });
    prisma.asteriskBlocklistEntry.update.mockResolvedValue({ id: 'entry-1', isActive: false });
    prisma.tenantSmsTemplate.findFirst.mockResolvedValue(null);

    const result = await service.unregister({
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      entryDid: '0801234567',
      requesterPhoneNumber: '01012345678',
      targetPhoneNumber: '01099998888',
      sourceType: 'OPT_OUT_080_SMART',
    });

    expect(prisma.asteriskBlocklistEntry.findUnique).toHaveBeenCalledWith({
      where: {
        tenantId_matchType_phoneNumber: {
          tenantId: 'tenant-1',
          matchType: 'EXACT',
          phoneNumber: '01099998888',
        },
      },
    });
    expect(prisma.asteriskBlocklistEntry.update).toHaveBeenCalledWith({
      where: {
        tenantId_matchType_phoneNumber: {
          tenantId: 'tenant-1',
          matchType: 'EXACT',
          phoneNumber: '01099998888',
        },
      },
      data: {
        isActive: false,
      },
    });
    expect(result.removed).toBe(true);
  });

  it('throws when unregister cannot find the EXACT blocklist entry', async () => {
    const { prisma, service } = createService();
    prisma.asteriskBlocklistEntry.findUnique.mockResolvedValue(null);
    prisma.tenantSmsTemplate.findFirst.mockResolvedValue(null);

    await expect(
      service.unregister({
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        entryDid: '0801234567',
        requesterPhoneNumber: '01012345678',
        targetPhoneNumber: '01099998888',
        sourceType: 'OPT_OUT_080_SMART',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('resolves SMS template metadata from managed tenant SMS templates', async () => {
    const { prisma, service } = createService();
    prisma.asteriskBlocklistEntry.findUnique.mockResolvedValue(null);
    prisma.asteriskBlocklistEntry.create.mockResolvedValue({ id: 'entry-1' });
    prisma.tenantSmsTemplate.findFirst.mockResolvedValue({
      templateId: 'tpl-1',
      templateName: 'Default',
      category: 'OPT_OUT_080',
      content: '수신거부 처리되었습니다.',
      isActive: true,
    });

    const result = await service.register({
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      entryDid: '0801234567',
      requesterPhoneNumber: '01012345678',
      sourceType: 'OPT_OUT_080_ANI',
      smsTemplateId: 'tpl-1',
    });

    expect(prisma.tenantSmsTemplate.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        templateId: 'tpl-1',
        isActive: true,
      },
      select: {
        templateId: true,
        templateName: true,
        category: true,
        content: true,
      },
    });
    expect(result.smsTemplate).toEqual({
      id: 'tpl-1',
      name: 'Default',
      content: '수신거부 처리되었습니다.',
      raw: {
        category: 'OPT_OUT_080',
        isActive: true,
        templateId: 'tpl-1',
        templateName: 'Default',
        content: '수신거부 처리되었습니다.',
      },
    });
  });

  it('preserves an existing manual EXACT blocklist entry during opt-out registration', async () => {
    const { prisma, service } = createService();
    const manualEntry = {
      id: 'manual-1',
      tenantId: 'tenant-1',
      matchType: 'EXACT',
      phoneNumber: '01099998888',
      sourceType: null,
      description: 'manual block',
      isActive: true,
    };
    prisma.asteriskBlocklistEntry.findUnique.mockResolvedValue(manualEntry);
    prisma.tenantSmsTemplate.findFirst.mockResolvedValue(null);

    const result = await service.register({
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      entryDid: '0801234567',
      requesterPhoneNumber: '01012345678',
      targetPhoneNumber: '01099998888',
      sourceType: 'OPT_OUT_080_SMART',
    });

    expect(prisma.asteriskBlocklistEntry.create).not.toHaveBeenCalled();
    expect(prisma.asteriskBlocklistEntry.update).not.toHaveBeenCalled();
    expect(result.blocklistEntry).toEqual(manualEntry);
  });

  it('reactivates an inactive manual EXACT blocklist entry during opt-out registration without changing ownership metadata', async () => {
    const { prisma, service } = createService();
    const manualEntry = {
      id: 'manual-2',
      tenantId: 'tenant-1',
      matchType: 'EXACT',
      phoneNumber: '01077776666',
      sourceType: 'MANUAL',
      description: 'manual block',
      isActive: false,
    };
    prisma.asteriskBlocklistEntry.findUnique.mockResolvedValue(manualEntry);
    prisma.asteriskBlocklistEntry.update.mockResolvedValue({
      ...manualEntry,
      isActive: true,
      requesterPhoneNumber: '01012345678',
      normalizedRequesterPhone: '01012345678',
      normalizedPhoneNumber: '01077776666',
      branchId: 'branch-1',
      entryDid: '0801234567',
    });
    prisma.tenantSmsTemplate.findFirst.mockResolvedValue(null);

    const result = await service.register({
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      entryDid: '0801234567',
      requesterPhoneNumber: '01012345678',
      targetPhoneNumber: '01077776666',
      sourceType: 'OPT_OUT_080_SMART',
    });

    expect(prisma.asteriskBlocklistEntry.create).not.toHaveBeenCalled();
    expect(prisma.asteriskBlocklistEntry.update).toHaveBeenCalledWith({
      where: {
        tenantId_matchType_phoneNumber: {
          tenantId: 'tenant-1',
          matchType: 'EXACT',
          phoneNumber: '01077776666',
        },
      },
      data: {
        isActive: true,
        requesterPhoneNumber: '01012345678',
        normalizedRequesterPhone: '01012345678',
        normalizedPhoneNumber: '01077776666',
        branchId: 'branch-1',
        entryDid: '0801234567',
      },
    });
    expect(result.blocklistEntry).toEqual({
      ...manualEntry,
      isActive: true,
      requesterPhoneNumber: '01012345678',
      normalizedRequesterPhone: '01012345678',
      normalizedPhoneNumber: '01077776666',
      branchId: 'branch-1',
      entryDid: '0801234567',
    });
  });

  it('deactivates a manual EXACT row that was reactivated by runtime opt-out', async () => {
    const { prisma, service } = createService();
    const reactivatedManualEntry = {
      id: 'manual-2',
      tenantId: 'tenant-1',
      matchType: 'EXACT',
      phoneNumber: '01077776666',
      sourceType: 'MANUAL',
      description: 'manual block',
      isActive: true,
      requesterPhoneNumber: '01012345678',
      normalizedRequesterPhone: '01012345678',
      normalizedPhoneNumber: '01077776666',
      branchId: 'branch-1',
      entryDid: '0801234567',
    };
    prisma.asteriskBlocklistEntry.findUnique.mockResolvedValue(reactivatedManualEntry);
    prisma.asteriskBlocklistEntry.update.mockResolvedValue({
      ...reactivatedManualEntry,
      isActive: false,
    });
    prisma.tenantSmsTemplate.findFirst.mockResolvedValue(null);

    const result = await service.unregister({
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      entryDid: '0801234567',
      requesterPhoneNumber: '01012345678',
      targetPhoneNumber: '01077776666',
      sourceType: 'OPT_OUT_080_SMART',
    });

    expect(prisma.asteriskBlocklistEntry.update).toHaveBeenCalledWith({
      where: {
        tenantId_matchType_phoneNumber: {
          tenantId: 'tenant-1',
          matchType: 'EXACT',
          phoneNumber: '01077776666',
        },
      },
      data: {
        isActive: false,
      },
    });
    expect(result.removed).toBe(true);
    expect(result.blocklistEntry).toEqual({
      ...reactivatedManualEntry,
      isActive: false,
    });
  });

  it('does not deactivate a manual EXACT blocklist entry during unregister', async () => {
    const { prisma, service } = createService();
    const manualEntry = {
      id: 'manual-1',
      tenantId: 'tenant-1',
      matchType: 'EXACT',
      phoneNumber: '01099998888',
      sourceType: 'MANUAL',
      description: 'manual block',
      isActive: true,
    };
    prisma.asteriskBlocklistEntry.findUnique.mockResolvedValue(manualEntry);
    prisma.tenantSmsTemplate.findFirst.mockResolvedValue(null);

    const result = await service.unregister({
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      entryDid: '0801234567',
      requesterPhoneNumber: '01012345678',
      targetPhoneNumber: '01099998888',
      sourceType: 'OPT_OUT_080_SMART',
    });

    expect(prisma.asteriskBlocklistEntry.update).not.toHaveBeenCalled();
    expect(prisma.asteriskBlocklistEntry.delete).not.toHaveBeenCalled();
    expect(result.removed).toBe(false);
    expect(result.blocklistEntry).toEqual(manualEntry);
  });
});

describe('AsteriskConfigInternalController', () => {
  it('rejects internal execution when KASTER_INTERNAL_SECRET is unset', async () => {
    const optOutService = {
      register: jest.fn(),
    } as any;
    const reload = {
      scheduleReload: jest.fn(),
    } as any;
    const config = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;
    const controller = new AsteriskConfigInternalController(optOutService, reload, config);

    await expect(
      controller.register(undefined, {
        tenantId: 'tenant-1',
        requesterPhoneNumber: '01012345678',
        sourceType: 'OPT_OUT_080_ANI',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(optOutService.register).not.toHaveBeenCalled();
    expect(reload.scheduleReload).not.toHaveBeenCalled();
  });
});
