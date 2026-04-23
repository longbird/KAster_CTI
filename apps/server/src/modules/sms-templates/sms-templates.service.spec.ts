import { BadRequestException } from '@nestjs/common';
import { SmsTemplatesService } from './sms-templates.service';

describe('SmsTemplatesService', () => {
  const prisma = {
    tenantSmsTemplate: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates an OPT_OUT_080 template with normalized content', async () => {
    prisma.tenantSmsTemplate.findFirst.mockResolvedValue(null);
    prisma.tenantSmsTemplate.create.mockResolvedValue({
      templateId: 'tpl-1',
      templateName: '080 기본 안내',
      category: 'OPT_OUT_080',
      content: '안녕하세요 {고객명}님',
      isActive: true,
    });

    const service = new SmsTemplatesService(prisma);

    const result = await service.create('tenant-1', {
      templateName: '080 기본 안내',
      category: 'OPT_OUT_080',
      content: ' 안녕하세요 {고객명}님 ',
      isActive: true,
    });

    expect(result.category).toBe('OPT_OUT_080');
    expect(prisma.tenantSmsTemplate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          content: '안녕하세요 {고객명}님',
        }),
      }),
    );
  });

  it('rejects duplicate template names within the same tenant', async () => {
    prisma.tenantSmsTemplate.findFirst.mockResolvedValue({
      templateId: 'tpl-dup',
      templateName: '중복 템플릿',
    });

    const service = new SmsTemplatesService(prisma);

    await expect(
      service.create('tenant-1', {
        templateName: '중복 템플릿',
        category: 'GENERAL_NOTICE',
        content: '본문',
        isActive: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
