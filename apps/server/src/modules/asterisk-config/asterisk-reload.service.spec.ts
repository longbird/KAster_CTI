import { AsteriskReloadService } from './asterisk-reload.service';

describe('AsteriskReloadService Smart ARS preview', () => {
  it('maps branch Smart ARS settings into generated DID dialplan', async () => {
    const prisma = {
      asteriskTrunk: { findMany: jest.fn().mockResolvedValue([]) },
      agents: { findMany: jest.fn().mockResolvedValue([]) },
      asteriskDid: {
        findMany: jest.fn().mockResolvedValue([{
          id: 'did-smart',
          tenantId: 'tenant-1',
          did: '07070001111',
          representativeNumber: null,
          description: null,
          ivrMenuId: null,
          directQueue: 'fallback',
          enabled: true,
          branchMappings: [{
            branchId: 'branch-1',
            branch: {
              isActive: true,
              settingsProfile: {
                smartArs: {
                  enabled: true,
                  guidePromptId: 'prompt-guide',
                  invalidPromptId: 'prompt-invalid',
                  failPromptId: 'prompt-fail',
                  timeoutSeconds: 5,
                  maxRetries: 2,
                  actions: [
                    { digit: '0', actionType: 'QUEUE_ROUTE', queueId: 'queue-sales' },
                    { digit: '1', actionType: 'TRANSFER', transferNumber: '01012345678' },
                    { digit: '2', actionType: 'SEND_SMS', smsTemplateId: 'tpl-1' },
                    { digit: '3', actionType: 'OPT_OUT' },
                    { digit: '4', actionType: 'PLAY_PROMPT', promptId: 'prompt-hours' },
                  ],
                },
              },
            },
          }],
        }]),
      },
      asteriskIvrMenu: { findMany: jest.fn().mockResolvedValue([]) },
      asteriskForwardingRules: { findMany: jest.fn().mockResolvedValue([]) },
      asteriskBlocklistEntry: { findMany: jest.fn().mockResolvedValue([]) },
      tenantHolidayRules: { findMany: jest.fn().mockResolvedValue([]) },
      asteriskPrompt: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'prompt-guide', promptKey: 'custom/smart_ars_guide' },
          { id: 'prompt-invalid', promptKey: 'custom/smart_ars_invalid' },
          { id: 'prompt-fail', promptKey: 'custom/smart_ars_fail' },
          { id: 'prompt-hours', promptKey: 'custom/office_hours' },
        ]),
      },
      queues: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ queueId: 'queue-sales', queueName: 'sales' }])
          .mockResolvedValueOnce([]),
      },
      tenantSystemSettings: { findUnique: jest.fn().mockResolvedValue(null) },
      outboundCallerIdRules: { findMany: jest.fn().mockResolvedValue([]) },
    } as any;
    const config = {
      get: jest.fn((key: string, fallback?: string) => fallback),
    } as any;
    const service = new AsteriskReloadService(prisma, config, { sendAction: jest.fn(), isConnected: jest.fn() } as any);

    const preview = await service.previewConfFiles('tenant-1');

    expect(preview.extensionsInbound).toContain('Goto(smart-ars-did-smart,s,1)');
    expect(preview.extensionsQueue).toContain('Background(/var/lib/asterisk/sounds/custom/smart_ars_guide)');
    expect(preview.extensionsQueue).toContain('Goto(queue-entry,sales,1)');
    expect(preview.extensionsQueue).toContain('Goto(transfer-target,01012345678,1)');
    expect(preview.extensionsQueue).toContain("kaster-smart-ars-hook.sh 'sms'");
    expect(preview.extensionsQueue).toContain("kaster-smart-ars-hook.sh 'opt-out'");
    expect(preview.extensionsQueue).toContain('Playback(/var/lib/asterisk/sounds/custom/office_hours)');
  });

  it('passes branch-specific holiday rules into generated DID dialplan', async () => {
    const prisma = {
      asteriskTrunk: { findMany: jest.fn().mockResolvedValue([]) },
      agents: { findMany: jest.fn().mockResolvedValue([]) },
      asteriskDid: {
        findMany: jest.fn().mockResolvedValue([{
          id: 'did-holiday',
          tenantId: 'tenant-1',
          did: '07070002222',
          representativeNumber: null,
          description: null,
          ivrMenuId: null,
          directQueue: 'sales',
          enabled: true,
          branchMappings: [{
            branchId: 'branch-1',
            branch: { isActive: true, settingsProfile: {} },
          }],
        }]),
      },
      asteriskIvrMenu: { findMany: jest.fn().mockResolvedValue([]) },
      asteriskForwardingRules: {
        findMany: jest.fn().mockResolvedValue([{
          id: 'forward-holiday',
          didId: 'did-holiday',
          forwardType: 'QUEUE',
          targetValue: 'holiday-desk',
          forwardTriggerMode: 'IMMEDIATE',
          queueWaitSeconds: null,
          stickyCallbackWindowMinutes: null,
          conditionType: 'TIME_RANGE',
          timeStart: null,
          timeEnd: null,
          daysOfWeek: null,
          scheduleJson: JSON.stringify([
            { conditionType: 'TIME_RANGE', timeStart: '09:00', timeEnd: '18:00', daysOfWeek: ['mon'] },
          ]),
          enabled: true,
        }]),
      },
      asteriskBlocklistEntry: { findMany: jest.fn().mockResolvedValue([]) },
      tenantHolidayRules: {
        findMany: jest.fn().mockResolvedValue([{
          holidayRuleId: 'holiday-1',
          branchId: 'branch-1',
          ruleType: 'DATE',
          holidayDate: '2026-05-06',
          monthDay: null,
          isActive: true,
        }]),
      },
      asteriskPrompt: { findMany: jest.fn().mockResolvedValue([]) },
      queues: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([]),
      },
      tenantSystemSettings: { findUnique: jest.fn().mockResolvedValue(null) },
      outboundCallerIdRules: { findMany: jest.fn().mockResolvedValue([]) },
    } as any;
    const config = {
      get: jest.fn((key: string, fallback?: string) => fallback),
    } as any;
    const service = new AsteriskReloadService(prisma, config, { sendAction: jest.fn(), isConnected: jest.fn() } as any);

    const preview = await service.previewConfFiles('tenant-1');

    expect(prisma.tenantHolidayRules.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', isActive: true },
    });
    expect(preview.extensionsInbound).toContain('GotoIf($["${STRFTIME(${EPOCH},,%Y-%m-%d)}"="2026-05-06"]?forwarding-rule-forward-holiday,s,1)');
  });

  it('passes branch-specific outbound caller-id rules into agent dialplan preview', async () => {
    const prisma = {
      asteriskTrunk: { findMany: jest.fn().mockResolvedValue([{ name: 'Carrier Main', enabled: true }]) },
      agents: {
        findMany: jest.fn().mockResolvedValue([{
          agentId: 'agent-1',
          tenantId: 'tenant-1',
          extension: '1001',
          agentName: 'Agent 1',
          sipPassword: null,
          settingsProfile: {},
          extensionLockMode: 'UNLOCKED',
          branchMappings: [{ branchId: 'branch-1' }],
        }]),
      },
      asteriskDid: { findMany: jest.fn().mockResolvedValue([]) },
      asteriskIvrMenu: { findMany: jest.fn().mockResolvedValue([]) },
      asteriskForwardingRules: { findMany: jest.fn().mockResolvedValue([]) },
      asteriskBlocklistEntry: { findMany: jest.fn().mockResolvedValue([]) },
      tenantHolidayRules: { findMany: jest.fn().mockResolvedValue([]) },
      asteriskPrompt: { findMany: jest.fn().mockResolvedValue([]) },
      queues: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([]),
      },
      tenantSystemSettings: {
        findUnique: jest.fn().mockResolvedValue({
          allowDirectSipDial: true,
          defaultSipPassword: null,
          allowedOutboundCallerIds: '0299999999\n0211111111',
          defaultOutboundCallerId: '0299999999',
          sipRegisterPort: 36070,
        }),
      },
      outboundCallerIdRules: {
        findMany: jest.fn().mockResolvedValue([{
          branchId: 'branch-1',
          matchType: 'PREFIX',
          sourceNumberPattern: '010',
          callerIdNumber: '0211111111',
          displayName: 'A지사',
          priority: 10,
          enabled: true,
        }]),
      },
    } as any;
    const config = {
      get: jest.fn((key: string, fallback?: string) => fallback),
    } as any;
    const service = new AsteriskReloadService(prisma, config, { sendAction: jest.fn(), isConnected: jest.fn() } as any);

    const preview = await service.previewConfFiles('tenant-1');

    expect(prisma.outboundCallerIdRules.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', enabled: true },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      select: expect.objectContaining({ branchId: true }),
    });
    expect(preview.extensionsAgent).toContain('Gosub(outbound-cid-rules-1001,${EXTEN},1)');
    expect(preview.extensionsAgent).toContain('Set(CALLERID(num)=0211111111)');
  });

  it('passes system stereo recording mode into generated queue and agent dialplans', async () => {
    const prisma = {
      asteriskTrunk: { findMany: jest.fn().mockResolvedValue([{ name: 'Carrier Main', enabled: true }]) },
      agents: {
        findMany: jest.fn().mockResolvedValue([{
          agentId: 'agent-1',
          tenantId: 'tenant-1',
          extension: '1001',
          agentName: 'Agent 1',
          sipPassword: null,
          settingsProfile: { liveRecording: 'USE' },
          extensionLockMode: 'UNLOCKED',
          branchMappings: [],
        }]),
      },
      asteriskDid: { findMany: jest.fn().mockResolvedValue([]) },
      asteriskIvrMenu: { findMany: jest.fn().mockResolvedValue([]) },
      asteriskForwardingRules: { findMany: jest.fn().mockResolvedValue([]) },
      asteriskBlocklistEntry: { findMany: jest.fn().mockResolvedValue([]) },
      tenantHolidayRules: { findMany: jest.fn().mockResolvedValue([]) },
      asteriskPrompt: { findMany: jest.fn().mockResolvedValue([]) },
      queues: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([]),
      },
      tenantSystemSettings: {
        findUnique: jest.fn().mockResolvedValue({
          allowDirectSipDial: false,
          defaultSipPassword: null,
          allowedOutboundCallerIds: '',
          defaultOutboundCallerId: null,
          sipRegisterPort: 36070,
          recordingChannelMode: 'STEREO_RAW',
        }),
      },
      outboundCallerIdRules: { findMany: jest.fn().mockResolvedValue([]) },
    } as any;
    const config = {
      get: jest.fn((key: string, fallback?: string) => fallback),
    } as any;
    const service = new AsteriskReloadService(prisma, config, { sendAction: jest.fn(), isConnected: jest.fn() } as any);

    const preview = await service.previewConfFiles('tenant-1');

    expect(prisma.tenantSystemSettings.findUnique).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1' },
      select: expect.objectContaining({ recordingChannelMode: true }),
    });
    expect(preview.extensionsQueue).toContain('${UNIQUEID}.raw)');
    expect(preview.extensionsAgent).toContain('MixMonitor(${REC_BASE_DIR}/${REC_FILE},bD)');
  });
});
