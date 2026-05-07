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
});
