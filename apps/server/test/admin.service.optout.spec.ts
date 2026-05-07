import { BadRequestException } from '@nestjs/common';
import { AdminService } from '../src/modules/admin/admin.service';

function createService() {
  const prisma = {
    branches: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    agents: {
      findMany: jest.fn(),
    },
    queues: {
      findMany: jest.fn(),
    },
    asteriskDid: {
      findMany: jest.fn(),
    },
    asteriskPrompt: {
      findMany: jest.fn(),
    },
    asteriskIvrMenu: {
      findMany: jest.fn(),
    },
    asteriskForwardingRules: {
      findMany: jest.fn(),
    },
    tenantSystemSettings: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    tenantSmsTemplate: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    branchAgents: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    branchQueues: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    branchDids: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    tenants: {
      update: jest.fn(),
    },
    $transaction: jest.fn(async (callback: (tx: any) => Promise<void>) =>
      callback({
        branchAgents: prisma.branchAgents,
        branchQueues: prisma.branchQueues,
        branchDids: prisma.branchDids,
        branches: {
          updateMany: prisma.branches.updateMany,
        },
      }),
    ),
  } as any;

  const queuesService = {} as any;
  const asteriskReloadService = {
    executeReload: jest.fn(),
  } as any;
  const healthSummary = {} as any;
  const realtimeGateway = {} as any;

  return {
    prisma,
    asteriskReloadService,
    service: new AdminService(
      prisma,
      queuesService,
      asteriskReloadService,
      healthSummary,
      realtimeGateway,
    ),
  };
}

describe('AdminService opt-out settings', () => {
  it('persists branch Smart ARS profiles and disables legacy ARS menu selection', async () => {
    const { prisma, service } = createService();

    prisma.branches.findFirst
      .mockResolvedValueOnce({
        branchId: 'branch-1',
        queueMappings: [{ queueId: 'queue-1' }],
        didMappings: [{ didId: 'did-1' }],
      })
      .mockResolvedValueOnce({
        branchId: 'branch-1',
        branchCode: 'BR-001',
        branchName: 'Branch 1',
        description: null,
        isActive: true,
        agentMappings: [],
        queueMappings: [{ queueId: 'queue-1' }],
        didMappings: [{ didId: 'did-1' }],
        settingsProfile: {
          smartArs: {
            enabled: true,
            guidePromptId: 'prompt-guide',
            timeoutSeconds: 5,
            maxRetries: 2,
            failPromptId: 'prompt-fail',
            invalidPromptId: 'prompt-invalid',
            actions: [
              {
                digit: '0',
                actionType: 'QUEUE_ROUTE',
                queueId: 'queue-1',
              },
              {
                digit: '1',
                actionType: 'TRANSFER',
                transferNumber: '010-1234-5678',
              },
              {
                digit: '3',
                actionType: 'OPT_OUT',
              },
              {
                digit: '4',
                actionType: 'PLAY_PROMPT',
                promptId: 'prompt-info',
              },
            ],
          },
        },
      });
    prisma.agents.findMany.mockResolvedValue([]);
    prisma.queues.findMany.mockResolvedValue([]);
    prisma.asteriskDid.findMany.mockResolvedValue([]);
    prisma.asteriskPrompt.findMany.mockResolvedValue([]);
    prisma.asteriskIvrMenu.findMany.mockResolvedValue([]);
    prisma.asteriskForwardingRules.findMany.mockResolvedValue([]);
    prisma.tenantSystemSettings.findUnique.mockResolvedValue({
      recordingEnabled: true,
      allowedOutboundCallerIds: '',
      defaultOutboundCallerId: '',
    });
    prisma.tenantSmsTemplate.findMany.mockResolvedValue([{ templateId: 'tpl-1' }]);
    prisma.branches.updateMany.mockResolvedValue({ count: 1 });
    prisma.$transaction.mockImplementation(async (callback: any) => callback(prisma));

    await service.updateBranchMappings('tenant-1', 'branch-1', {
      settingsProfile: {
        ars: {
          enabled: true,
          ids: ['legacy-menu-id'],
        },
        smartArs: {
          enabled: true,
          guidePromptId: 'prompt-guide',
          timeoutSeconds: 5,
          maxRetries: 2,
          failPromptId: 'prompt-fail',
          invalidPromptId: 'prompt-invalid',
          actions: [
            {
              digit: '0',
              actionType: 'QUEUE_ROUTE',
              queueId: 'queue-1',
            },
            {
              digit: '1',
              actionType: 'TRANSFER',
              transferNumber: '010-1234-5678',
            },
            {
              digit: '3',
              actionType: 'OPT_OUT',
            },
            {
              digit: '4',
              actionType: 'PLAY_PROMPT',
              promptId: 'prompt-info',
            },
          ],
        },
      },
    } as any);

    expect(prisma.branches.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          settingsProfile: expect.objectContaining({
            ars: { enabled: false, ids: [] },
            smartArs: {
              enabled: true,
              guidePromptId: 'prompt-guide',
              timeoutSeconds: 5,
              maxRetries: 2,
              failPromptId: 'prompt-fail',
              invalidPromptId: 'prompt-invalid',
              actions: [
                {
                  digit: '0',
                  actionType: 'QUEUE_ROUTE',
                  queueId: 'queue-1',
                  transferNumber: null,
                  smsTemplateId: null,
                  promptId: null,
                },
                {
                  digit: '1',
                  actionType: 'TRANSFER',
                  queueId: null,
                  transferNumber: '01012345678',
                  smsTemplateId: null,
                  promptId: null,
                },
                {
                  digit: '3',
                  actionType: 'OPT_OUT',
                  queueId: null,
                  transferNumber: null,
                  smsTemplateId: null,
                  promptId: null,
                },
                {
                  digit: '4',
                  actionType: 'PLAY_PROMPT',
                  queueId: null,
                  transferNumber: null,
                  smsTemplateId: null,
                  promptId: 'prompt-info',
                },
              ],
            },
          }),
        }),
      }),
    );
  });

  it('rejects Smart ARS actions with duplicate DTMF digits', async () => {
    const { prisma, service } = createService();

    prisma.branches.findFirst.mockResolvedValue({
      branchId: 'branch-1',
      queueMappings: [{ queueId: 'queue-1' }],
      didMappings: [],
    });

    await expect(
      service.updateBranchMappings('tenant-1', 'branch-1', {
        settingsProfile: {
          smartArs: {
            enabled: true,
            guidePromptId: 'prompt-guide',
            timeoutSeconds: 5,
            maxRetries: 2,
            actions: [
              {
                digit: '1',
                actionType: 'QUEUE_ROUTE',
                queueId: 'queue-1',
              },
              {
                digit: '1',
                actionType: 'OPT_OUT',
              },
            ],
          },
        },
      } as any),
    ).rejects.toThrow('스마트 ARS DTMF 키는 중복될 수 없습니다.');
  });

  it('rejects Smart ARS queue actions outside the branch queue scope', async () => {
    const { prisma, service } = createService();

    prisma.branches.findFirst.mockResolvedValue({
      branchId: 'branch-1',
      queueMappings: [{ queueId: 'queue-1' }],
      didMappings: [],
    });

    await expect(
      service.updateBranchMappings('tenant-1', 'branch-1', {
        settingsProfile: {
          smartArs: {
            enabled: true,
            guidePromptId: 'prompt-guide',
            timeoutSeconds: 5,
            maxRetries: 2,
            actions: [
              {
                digit: '0',
                actionType: 'QUEUE_ROUTE',
                queueId: 'queue-2',
              },
            ],
          },
        },
      } as any),
    ).rejects.toThrow('스마트 ARS 상담원 연결은 지사에 연결된 호 분배룰만 사용할 수 있습니다.');
  });

  it('rejects Smart ARS SMS actions before template lookup while SMS integration is deferred', async () => {
    const { prisma, service } = createService();

    prisma.branches.findFirst
      .mockResolvedValueOnce({
        branchId: 'branch-1',
        queueMappings: [],
        didMappings: [],
      })
      .mockResolvedValueOnce({
        branchId: 'branch-1',
        branchCode: 'BR-001',
        branchName: 'Branch 1',
        description: null,
        isActive: true,
        agentMappings: [],
        queueMappings: [],
        didMappings: [],
        settingsProfile: {},
      });
    prisma.tenantSmsTemplate.findMany.mockResolvedValue([]);

    await expect(
      service.updateBranchMappings('tenant-1', 'branch-1', {
        settingsProfile: {
          smartArs: {
            enabled: true,
            guidePromptId: 'prompt-guide',
            timeoutSeconds: 5,
            maxRetries: 2,
            actions: [
              {
                digit: '2',
                actionType: 'SEND_SMS',
                smsTemplateId: 'tpl-missing',
              },
            ],
          },
        },
      } as any),
    ).rejects.toThrow('SMS 발송은 외부 SMS 연동 후 사용할 수 있습니다.');
  });

  it('rejects Smart ARS SMS actions while external SMS integration is deferred', async () => {
    const { prisma, service } = createService();

    prisma.branches.findFirst
      .mockResolvedValueOnce({
        branchId: 'branch-1',
        queueMappings: [],
        didMappings: [],
      })
      .mockResolvedValueOnce({
        branchId: 'branch-1',
        branchCode: 'BR-001',
        branchName: 'Branch 1',
        description: null,
        isActive: true,
        agentMappings: [],
        queueMappings: [],
        didMappings: [],
        settingsProfile: {},
      });
    prisma.agents.findMany.mockResolvedValue([]);
    prisma.queues.findMany.mockResolvedValue([]);
    prisma.asteriskDid.findMany.mockResolvedValue([]);
    prisma.asteriskPrompt.findMany.mockResolvedValue([]);
    prisma.asteriskIvrMenu.findMany.mockResolvedValue([]);
    prisma.asteriskForwardingRules.findMany.mockResolvedValue([]);
    prisma.tenantSystemSettings.findUnique.mockResolvedValue(null);
    prisma.tenantSmsTemplate.findMany.mockResolvedValue([{ templateId: 'tpl-1' }]);

    await expect(
      service.updateBranchMappings('tenant-1', 'branch-1', {
        settingsProfile: {
          smartArs: {
            enabled: true,
            guidePromptId: 'prompt-guide',
            timeoutSeconds: 5,
            maxRetries: 2,
            actions: [
              {
                digit: '2',
                actionType: 'SEND_SMS',
                smsTemplateId: 'tpl-1',
              },
            ],
          },
        },
      } as any),
    ).rejects.toThrow('SMS 발송은 외부 SMS 연동 후 사용할 수 있습니다.');
  });

  it('rejects simultaneous Smart ARS and 080 opt-out activation', async () => {
    const { prisma, service } = createService();

    prisma.branches.findFirst
      .mockResolvedValueOnce({
        branchId: 'branch-1',
        queueMappings: [{ queueId: 'queue-1' }],
        didMappings: [{ didId: 'did-1' }],
      })
      .mockResolvedValueOnce({
        branchId: 'branch-1',
        branchCode: 'BR-001',
        branchName: 'Branch 1',
        description: null,
        isActive: true,
        agentMappings: [],
        queueMappings: [{ queueId: 'queue-1' }],
        didMappings: [{ didId: 'did-1' }],
        settingsProfile: {},
      });
    prisma.agents.findMany.mockResolvedValue([]);
    prisma.queues.findMany.mockResolvedValue([]);
    prisma.asteriskDid.findMany.mockResolvedValue([]);
    prisma.asteriskPrompt.findMany.mockResolvedValue([]);
    prisma.asteriskIvrMenu.findMany.mockResolvedValue([]);
    prisma.asteriskForwardingRules.findMany.mockResolvedValue([]);
    prisma.tenantSystemSettings.findUnique.mockResolvedValue(null);

    await expect(
      service.updateBranchMappings('tenant-1', 'branch-1', {
        settingsProfile: {
          smartArs: {
            enabled: true,
            guidePromptId: 'prompt-guide',
            timeoutSeconds: 5,
            maxRetries: 2,
            actions: [
              {
                digit: '0',
                actionType: 'QUEUE_ROUTE',
                queueId: 'queue-1',
              },
            ],
          },
          blocklist080: {
            enabled: true,
            mode: 'IMMEDIATE_OPT_OUT',
            basePromptId: 'prompt-080-start',
            completionPromptId: 'prompt-080-complete',
          },
        },
      } as any),
    ).rejects.toThrow('스마트 ARS와 080 수신거부는 같은 지사에서 동시에 사용할 수 없습니다.');
  });

  it('preserves existing Smart ARS settings when another branch settings form omits smartArs', async () => {
    const { prisma, service } = createService();

    prisma.branches.findFirst
      .mockResolvedValueOnce({
        branchId: 'branch-1',
        queueMappings: [{ queueId: 'queue-1' }],
        didMappings: [],
        settingsProfile: {
          smartArs: {
            enabled: true,
            guidePromptId: 'prompt-guide',
            timeoutSeconds: 5,
            maxRetries: 2,
            actions: [
              {
                digit: '0',
                actionType: 'QUEUE_ROUTE',
                queueId: 'queue-1',
              },
            ],
          },
        },
      })
      .mockResolvedValueOnce({
        branchId: 'branch-1',
        branchCode: 'BR-001',
        branchName: 'Branch 1',
        description: null,
        isActive: true,
        agentMappings: [],
        queueMappings: [{ queueId: 'queue-1' }],
        didMappings: [],
        settingsProfile: {
          smartArs: {
            enabled: true,
            guidePromptId: 'prompt-guide',
            timeoutSeconds: 5,
            maxRetries: 2,
            actions: [
              {
                digit: '0',
                actionType: 'QUEUE_ROUTE',
                queueId: 'queue-1',
              },
            ],
          },
        },
      });
    prisma.agents.findMany.mockResolvedValue([]);
    prisma.queues.findMany.mockResolvedValue([]);
    prisma.asteriskDid.findMany.mockResolvedValue([]);
    prisma.asteriskPrompt.findMany.mockResolvedValue([]);
    prisma.asteriskIvrMenu.findMany.mockResolvedValue([]);
    prisma.asteriskForwardingRules.findMany.mockResolvedValue([]);
    prisma.tenantSystemSettings.findUnique.mockResolvedValue({
      recordingEnabled: true,
      allowedOutboundCallerIds: '',
      defaultOutboundCallerId: '',
    });
    prisma.branches.updateMany.mockResolvedValue({ count: 1 });
    prisma.$transaction.mockImplementation(async (callback: any) => callback(prisma));

    await service.updateBranchMappings('tenant-1', 'branch-1', {
      settingsProfile: {
        recording: {
          enabled: false,
        },
      },
    } as any);

    expect(prisma.branches.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          settingsProfile: expect.objectContaining({
            recording: { enabled: false },
            smartArs: expect.objectContaining({
              enabled: true,
              guidePromptId: 'prompt-guide',
              actions: [
                {
                  digit: '0',
                  actionType: 'QUEUE_ROUTE',
                  queueId: 'queue-1',
                  transferNumber: null,
                  smsTemplateId: null,
                  promptId: null,
                },
              ],
            }),
          }),
        }),
      }),
    );
  });

  it('normalizes missing blocklist080 mode to immediate opt-out', async () => {
    const { prisma, service } = createService();

    prisma.branches.findFirst.mockResolvedValue({
      branchId: 'branch-1',
      branchCode: 'BR-001',
      branchName: 'Branch 1',
      description: null,
      isActive: true,
      agentMappings: [],
      queueMappings: [{ queueId: 'queue-1' }],
      didMappings: [{ didId: 'did-1' }],
      settingsProfile: {
        blocklist080: {
          enabled: true,
          basePromptId: 'prompt-base',
        },
      },
    });
    prisma.agents.findMany.mockResolvedValue([]);
    prisma.queues.findMany.mockResolvedValue([]);
    prisma.asteriskDid.findMany.mockResolvedValue([]);
    prisma.asteriskPrompt.findMany.mockResolvedValue([]);
    prisma.asteriskIvrMenu.findMany.mockResolvedValue([]);
    prisma.asteriskForwardingRules.findMany.mockResolvedValue([]);
    prisma.tenantSmsTemplate.findMany.mockResolvedValue([
      {
        templateId: 'tpl-1',
        templateName: '080 기본 안내',
        category: 'OPT_OUT_080',
        isActive: true,
      },
    ]);
    prisma.tenantSystemSettings.findUnique.mockResolvedValue({
      recordingEnabled: true,
      allowedOutboundCallerIds: '',
      defaultOutboundCallerId: '',
    });

    const result = await service.getBranchMappings('tenant-1', 'branch-1');

    expect(result.data.settingsProfile.blocklist080.mode).toBe('IMMEDIATE_OPT_OUT');
    expect(result.data.settingsProfile.blocklist080.enabled).toBe(true);
    expect(prisma.tenantSmsTemplate.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        isActive: true,
      },
      orderBy: [{ templateName: 'asc' }],
      select: {
        templateId: true,
        templateName: true,
        category: true,
        isActive: true,
      },
    });
    expect((result.data as any).availableSmsTemplates).toEqual([
      {
        templateId: 'tpl-1',
        templateName: '080 기본 안내',
        category: 'OPT_OUT_080',
        isActive: true,
      },
    ]);
  });

  it('rejects DTMF menu mappings that require queue ids for queue routes', async () => {
    const { prisma, service } = createService();

    prisma.branches.findFirst.mockResolvedValue({
      branchId: 'branch-1',
      queueMappings: [{ queueId: 'queue-1' }],
      didMappings: [],
    });

    await expect(
      service.updateBranchMappings('tenant-1', 'branch-1', {
        settingsProfile: {
          blocklist080: {
            enabled: true,
            mode: 'DTMF_MENU',
            basePromptId: 'prompt-base',
            dtmfMenu: {
              timeoutSeconds: 15,
              maxRetries: 2,
              invalidPromptId: 'prompt-invalid',
              timeoutPromptId: 'prompt-timeout',
              mappings: [
                {
                  digit: '1',
                  actionType: 'QUEUE_ROUTE',
                },
              ],
            },
          },
        },
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects DTMF menu mappings with unsupported actions', async () => {
    const { prisma, service } = createService();

    prisma.branches.findFirst.mockResolvedValue({
      branchId: 'branch-1',
      queueMappings: [{ queueId: 'queue-1' }],
      didMappings: [],
    });

    await expect(
      service.updateBranchMappings('tenant-1', 'branch-1', {
        settingsProfile: {
          blocklist080: {
            enabled: true,
            mode: 'DTMF_MENU',
            basePromptId: 'prompt-base',
            dtmfMenu: {
              timeoutSeconds: 15,
              maxRetries: 2,
              invalidPromptId: 'prompt-invalid',
              timeoutPromptId: 'prompt-timeout',
              mappings: [
                {
                  digit: '1',
                  actionType: 'NOT_ALLOWED',
                  queueId: 'queue-1',
                },
              ],
            },
          },
        },
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects DTMF menu queue routes that point to an unassigned queue', async () => {
    const { prisma, service } = createService();

    prisma.branches.findFirst.mockResolvedValue({
      branchId: 'branch-1',
      queueMappings: [{ queueId: 'queue-1' }],
      didMappings: [],
    });

    await expect(
      service.updateBranchMappings('tenant-1', 'branch-1', {
        settingsProfile: {
          blocklist080: {
            enabled: true,
            mode: 'DTMF_MENU',
            basePromptId: 'prompt-base',
            dtmfMenu: {
              timeoutSeconds: 15,
              maxRetries: 2,
              invalidPromptId: 'prompt-invalid',
              timeoutPromptId: 'prompt-timeout',
              mappings: [
                {
                  digit: '1',
                  actionType: 'QUEUE_ROUTE',
                  queueId: 'queue-2',
                },
              ],
            },
          },
        },
      } as any),
    ).rejects.toThrow('큐 분기 동작의 queueId는 지사에 연결된 큐여야 합니다.');
  });

  it('rejects smart flow confirmation mappings with invalid digits', async () => {
    const { prisma, service } = createService();

    prisma.branches.findFirst.mockResolvedValue({
      branchId: 'branch-1',
      queueMappings: [],
      didMappings: [],
    });

    await expect(
      service.updateBranchMappings('tenant-1', 'branch-1', {
        settingsProfile: {
          blocklist080: {
            enabled: true,
            mode: 'SMART_OPT_OUT',
            basePromptId: 'prompt-base',
            smartFlow: {
              inputPromptId: 'prompt-input',
              reentryPromptId: 'prompt-reentry',
              sameNumberPromptId: 'prompt-same',
              confirmPrefixPromptId: 'prompt-prefix',
              confirmSuffixPromptId: 'prompt-suffix',
              confirmMenuPromptId: 'prompt-menu',
              failurePromptId: 'prompt-failure',
              finalPromptId: 'prompt-final',
              inputTimeoutSeconds: 10,
              maxRetries: 3,
              confirmationMappings: [
                {
                  digit: 'A',
                  actionType: 'REENTER_NUMBER',
                },
              ],
            },
          },
        },
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects smart flow confirmation mappings with unsupported actions', async () => {
    const { prisma, service } = createService();

    prisma.branches.findFirst.mockResolvedValue({
      branchId: 'branch-1',
      queueMappings: [],
      didMappings: [],
    });

    await expect(
      service.updateBranchMappings('tenant-1', 'branch-1', {
        settingsProfile: {
          blocklist080: {
            enabled: true,
            mode: 'SMART_OPT_OUT',
            basePromptId: 'prompt-base',
            smartFlow: {
              inputPromptId: 'prompt-input',
              reentryPromptId: 'prompt-reentry',
              sameNumberPromptId: 'prompt-same',
              confirmPrefixPromptId: 'prompt-prefix',
              confirmSuffixPromptId: 'prompt-suffix',
              confirmMenuPromptId: 'prompt-menu',
              failurePromptId: 'prompt-failure',
              finalPromptId: 'prompt-final',
              inputTimeoutSeconds: 10,
              maxRetries: 3,
              confirmationMappings: [
                {
                  digit: '1',
                  actionType: 'NOT_ALLOWED',
                },
              ],
            },
          },
        },
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects smart flow end digit overrides', async () => {
    const { prisma, service } = createService();

    prisma.branches.findFirst.mockResolvedValue({
      branchId: 'branch-1',
      queueMappings: [],
      didMappings: [],
    });

    await expect(
      service.updateBranchMappings('tenant-1', 'branch-1', {
        settingsProfile: {
          blocklist080: {
            enabled: true,
            mode: 'SMART_OPT_OUT',
            basePromptId: 'prompt-base',
            smartFlow: {
              inputPromptId: 'prompt-input',
              reentryPromptId: 'prompt-reentry',
              sameNumberPromptId: 'prompt-same',
              confirmPrefixPromptId: 'prompt-prefix',
              confirmSuffixPromptId: 'prompt-suffix',
              confirmMenuPromptId: 'prompt-menu',
              failurePromptId: 'prompt-failure',
              finalPromptId: 'prompt-final',
              inputTimeoutSeconds: 10,
              maxRetries: 3,
              inputEndDigit: '0',
              confirmationMappings: [
                {
                  digit: '1',
                  actionType: 'REENTER_NUMBER',
                },
              ],
            },
          },
        },
      } as any),
    ).rejects.toThrow('스마트 수신거부의 종료 숫자는 #로 고정되어 있습니다.');
  });

  it('rejects smart flow end digit overrides written with snake case', async () => {
    const { prisma, service } = createService();

    prisma.branches.findFirst.mockResolvedValue({
      branchId: 'branch-1',
      queueMappings: [],
      didMappings: [],
    });

    await expect(
      service.updateBranchMappings('tenant-1', 'branch-1', {
        settingsProfile: {
          blocklist080: {
            enabled: true,
            mode: 'SMART_OPT_OUT',
            basePromptId: 'prompt-base',
            smartFlow: {
              inputPromptId: 'prompt-input',
              reentryPromptId: 'prompt-reentry',
              sameNumberPromptId: 'prompt-same',
              confirmPrefixPromptId: 'prompt-prefix',
              confirmSuffixPromptId: 'prompt-suffix',
              confirmMenuPromptId: 'prompt-menu',
              failurePromptId: 'prompt-failure',
              finalPromptId: 'prompt-final',
              inputTimeoutSeconds: 10,
              maxRetries: 3,
              input_end_digit: '0',
              confirmationMappings: [
                {
                  digit: '1',
                  actionType: 'REENTER_NUMBER',
                },
              ],
            },
          },
        },
      } as any),
    ).rejects.toThrow('스마트 수신거부의 종료 숫자는 #로 고정되어 있습니다.');
  });

  it('rejects smart flow end digit overrides written as termination_digit', async () => {
    const { prisma, service } = createService();

    prisma.branches.findFirst.mockResolvedValue({
      branchId: 'branch-1',
      queueMappings: [],
      didMappings: [],
    });

    await expect(
      service.updateBranchMappings('tenant-1', 'branch-1', {
        settingsProfile: {
          blocklist080: {
            enabled: true,
            mode: 'SMART_OPT_OUT',
            basePromptId: 'prompt-base',
            smartFlow: {
              inputPromptId: 'prompt-input',
              reentryPromptId: 'prompt-reentry',
              sameNumberPromptId: 'prompt-same',
              confirmPrefixPromptId: 'prompt-prefix',
              confirmSuffixPromptId: 'prompt-suffix',
              confirmMenuPromptId: 'prompt-menu',
              failurePromptId: 'prompt-failure',
              finalPromptId: 'prompt-final',
              inputTimeoutSeconds: 10,
              maxRetries: 3,
              termination_digit: '0',
              confirmationMappings: [
                {
                  digit: '1',
                  actionType: 'REENTER_NUMBER',
                },
              ],
            },
          },
        },
      } as any),
    ).rejects.toThrow('스마트 수신거부의 종료 숫자는 #로 고정되어 있습니다.');
  });

  it('accepts a valid smart flow profile without an end digit override', async () => {
    const { prisma, service } = createService();

    prisma.branches.findFirst
      .mockResolvedValueOnce({
        branchId: 'branch-1',
        queueMappings: [{ queueId: 'queue-1' }],
        didMappings: [],
      })
      .mockResolvedValueOnce({
        branchId: 'branch-1',
        branchCode: 'BR-001',
        branchName: 'Branch 1',
        description: null,
        isActive: true,
        agentMappings: [],
        queueMappings: [{ queueId: 'queue-1' }],
        didMappings: [],
        settingsProfile: {
          blocklist080: {
            enabled: true,
            mode: 'SMART_OPT_OUT',
            basePromptId: 'prompt-base',
            smartFlow: {
              inputPromptId: 'prompt-input',
              reentryPromptId: 'prompt-reentry',
              sameNumberPromptId: 'prompt-same',
              confirmPrefixPromptId: 'prompt-prefix',
              confirmSuffixPromptId: 'prompt-suffix',
              confirmMenuPromptId: 'prompt-menu',
              failurePromptId: 'prompt-failure',
              finalPromptId: 'prompt-final',
              inputTimeoutSeconds: 10,
              maxRetries: 3,
              confirmationMappings: [
                {
                  digit: '1',
                  actionType: 'REENTER_NUMBER',
                },
              ],
            },
          },
        },
      });
    prisma.agents.findMany.mockResolvedValue([]);
    prisma.queues.findMany.mockResolvedValue([]);
    prisma.asteriskDid.findMany.mockResolvedValue([]);
    prisma.asteriskPrompt.findMany.mockResolvedValue([]);
    prisma.asteriskIvrMenu.findMany.mockResolvedValue([]);
    prisma.asteriskForwardingRules.findMany.mockResolvedValue([]);
    prisma.tenantSystemSettings.findUnique.mockResolvedValue({
      recordingEnabled: true,
      allowedOutboundCallerIds: '',
      defaultOutboundCallerId: '',
    });
    prisma.branches.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.updateBranchMappings('tenant-1', 'branch-1', {
        settingsProfile: {
          blocklist080: {
            enabled: true,
            mode: 'SMART_OPT_OUT',
            basePromptId: 'prompt-base',
            smartFlow: {
              inputPromptId: 'prompt-input',
              reentryPromptId: 'prompt-reentry',
              sameNumberPromptId: 'prompt-same',
              confirmPrefixPromptId: 'prompt-prefix',
              confirmSuffixPromptId: 'prompt-suffix',
              confirmMenuPromptId: 'prompt-menu',
              failurePromptId: 'prompt-failure',
              finalPromptId: 'prompt-final',
              inputTimeoutSeconds: 10,
              maxRetries: 3,
              confirmationMappings: [
                {
                  digit: '1',
                  actionType: 'REENTER_NUMBER',
                },
              ],
            },
          },
        },
      } as any),
    ).resolves.toBeTruthy();
  });

  it('rejects branch opt-out profiles that reference missing SMS templates', async () => {
    const { prisma, service } = createService();

    prisma.branches.findFirst
      .mockResolvedValueOnce({
        branchId: 'branch-1',
        queueMappings: [{ queueId: 'queue-1' }],
        didMappings: [],
      })
      .mockResolvedValueOnce({
        branchId: 'branch-1',
        branchCode: 'BR-001',
        branchName: 'Branch 1',
        description: null,
        isActive: true,
        agentMappings: [],
        queueMappings: [{ queueId: 'queue-1' }],
        didMappings: [],
        settingsProfile: {
          blocklist080: {
            enabled: true,
            mode: 'IMMEDIATE_OPT_OUT',
            smsTemplateId: 'tpl-missing',
          },
        },
      });
    prisma.agents.findMany.mockResolvedValue([]);
    prisma.queues.findMany.mockResolvedValue([]);
    prisma.asteriskDid.findMany.mockResolvedValue([]);
    prisma.asteriskPrompt.findMany.mockResolvedValue([]);
    prisma.asteriskIvrMenu.findMany.mockResolvedValue([]);
    prisma.asteriskForwardingRules.findMany.mockResolvedValue([]);
    prisma.tenantSystemSettings.findUnique.mockResolvedValue({
      recordingEnabled: true,
      allowedOutboundCallerIds: '',
      defaultOutboundCallerId: '',
    });
    prisma.tenantSmsTemplate.findMany.mockResolvedValue([]);
    prisma.tenantSmsTemplate.count.mockResolvedValue(0);

    await expect(
      service.updateBranchMappings('tenant-1', 'branch-1', {
        settingsProfile: {
          blocklist080: {
            enabled: true,
            mode: 'IMMEDIATE_OPT_OUT',
            smsTemplateId: 'tpl-missing',
          },
        },
      } as any),
    ).rejects.toThrow('선택한 SMS 템플릿을 찾을 수 없습니다.');
  });

  it('rejects 080 opt-out SMS actions while external SMS integration is deferred', async () => {
    const { prisma, service } = createService();

    prisma.branches.findFirst
      .mockResolvedValueOnce({
        branchId: 'branch-1',
        queueMappings: [],
        didMappings: [],
      })
      .mockResolvedValueOnce({
        branchId: 'branch-1',
        branchCode: 'BR-001',
        branchName: 'Branch 1',
        description: null,
        isActive: true,
        agentMappings: [],
        queueMappings: [],
        didMappings: [],
        settingsProfile: {},
      });
    prisma.agents.findMany.mockResolvedValue([]);
    prisma.queues.findMany.mockResolvedValue([]);
    prisma.asteriskDid.findMany.mockResolvedValue([]);
    prisma.asteriskPrompt.findMany.mockResolvedValue([]);
    prisma.asteriskIvrMenu.findMany.mockResolvedValue([]);
    prisma.asteriskForwardingRules.findMany.mockResolvedValue([]);
    prisma.tenantSystemSettings.findUnique.mockResolvedValue(null);
    prisma.tenantSmsTemplate.findMany.mockResolvedValue([{ templateId: 'tpl-general' }]);

    await expect(
      service.updateBranchMappings('tenant-1', 'branch-1', {
        settingsProfile: {
          blocklist080: {
            enabled: true,
            mode: 'DTMF_MENU',
            basePromptId: 'prompt-start',
            completionPromptId: 'prompt-complete',
            dtmfMenu: {
              timeoutSeconds: 5,
              maxRetries: 1,
              mappings: [
                {
                  digit: '1',
                  actionType: 'SEND_SMS',
                  smsTemplateId: 'tpl-general',
                },
              ],
            },
          },
        },
      } as any),
    ).rejects.toThrow('SMS 발송은 외부 SMS 연동 후 사용할 수 있습니다.');
  });

  it('accepts branch opt-out profiles that use non-SMS actions', async () => {
    const { prisma, service } = createService();

    prisma.branches.findFirst
      .mockResolvedValueOnce({
        branchId: 'branch-1',
        queueMappings: [{ queueId: 'queue-1' }],
        didMappings: [],
      })
      .mockResolvedValueOnce({
        branchId: 'branch-1',
        branchCode: 'BR-001',
        branchName: 'Branch 1',
        description: null,
        isActive: true,
        agentMappings: [],
        queueMappings: [{ queueId: 'queue-1' }],
        didMappings: [],
        settingsProfile: {
          blocklist080: {
            enabled: true,
            mode: 'DTMF_MENU',
            dtmfMenu: {
              timeoutSeconds: 10,
              maxRetries: 1,
              mappings: [
                {
                  digit: '4',
                  actionType: 'REGISTER_OPT_OUT',
                  smsTemplateId: null,
                },
              ],
            },
          },
        },
      });
    prisma.agents.findMany.mockResolvedValue([]);
    prisma.queues.findMany.mockResolvedValue([]);
    prisma.asteriskDid.findMany.mockResolvedValue([]);
    prisma.asteriskPrompt.findMany.mockResolvedValue([]);
    prisma.asteriskIvrMenu.findMany.mockResolvedValue([]);
    prisma.asteriskForwardingRules.findMany.mockResolvedValue([]);
    prisma.tenantSystemSettings.findUnique.mockResolvedValue({
      recordingEnabled: true,
      allowedOutboundCallerIds: '',
      defaultOutboundCallerId: '',
    });
    prisma.tenantSmsTemplate.findMany.mockResolvedValue([
      { templateId: 'tpl-general' },
    ]);
    prisma.branchAgents.deleteMany.mockResolvedValue({ count: 0 });
    prisma.branchAgents.createMany.mockResolvedValue({ count: 0 });
    prisma.branchQueues.deleteMany.mockResolvedValue({ count: 0 });
    prisma.branchQueues.createMany.mockResolvedValue({ count: 1 });
    prisma.branchDids.deleteMany.mockResolvedValue({ count: 0 });
    prisma.branchDids.createMany.mockResolvedValue({ count: 0 });
    prisma.branches.updateMany.mockResolvedValue({ count: 1 });
    prisma.$transaction.mockImplementation(async (callback: any) => callback(prisma));

    await expect(
      service.updateBranchMappings('tenant-1', 'branch-1', {
        settingsProfile: {
          blocklist080: {
            enabled: true,
            mode: 'DTMF_MENU',
            dtmfMenu: {
              timeoutSeconds: 10,
              maxRetries: 1,
              mappings: [
                {
                  digit: '4',
                  actionType: 'REGISTER_OPT_OUT',
                  smsTemplateId: null,
                },
              ],
            },
          },
        },
      } as any),
    ).resolves.toBeTruthy();
  });

  it('does not expose or persist legacy opt-out SMS template JSON in system settings', async () => {
    const { prisma, service, asteriskReloadService } = createService();

    prisma.tenantSystemSettings.upsert.mockResolvedValue({
      tenantId: 'tenant-1',
    });
    prisma.tenants.update.mockResolvedValue({
      tenantId: 'tenant-1',
      timezone: 'Asia/Seoul',
    });

    const result = await service.updateSystemSettings('tenant-1', {
      recordingEnabled: true,
      defaultMaxWaitSeconds: 45,
      allowDirectSipDial: false,
      defaultSipPassword: 'secret',
      allowedOutboundCallerIds: '01012341234',
      defaultOutboundCallerId: '01012341234',
      sipRegisterPort: 36070,
      timezone: 'Asia/Seoul',
      dateFormat: 'YYYY-MM-DD HH:mm:ss',
    } as any);

    expect(prisma.tenantSystemSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.not.objectContaining({
          optOutSmsTemplates: expect.anything(),
        }),
        update: expect.not.objectContaining({
          optOutSmsTemplates: expect.anything(),
        }),
      }),
    );
    expect(asteriskReloadService.executeReload).toHaveBeenCalledWith('tenant-1');
    expect(result.data).not.toHaveProperty('optOutSmsTemplates');
  });
});
