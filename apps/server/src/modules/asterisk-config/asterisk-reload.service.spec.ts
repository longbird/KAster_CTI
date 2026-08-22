import { AsteriskReloadService } from './asterisk-reload.service';
import { DEFAULT_AGENT_OFFER_TIMEOUT_SECONDS } from '../../common/call-routing.constants';

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
    const service = new AsteriskReloadService(
      prisma,
      config,
      { sendAction: jest.fn(), isConnected: jest.fn() } as any,
      { save: jest.fn().mockResolvedValue(undefined) } as any,
    );

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
    const service = new AsteriskReloadService(
      prisma,
      config,
      { sendAction: jest.fn(), isConnected: jest.fn() } as any,
      { save: jest.fn().mockResolvedValue(undefined) } as any,
    );

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
          sipRegisterPort: 48950,
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
    const service = new AsteriskReloadService(
      prisma,
      config,
      { sendAction: jest.fn(), isConnected: jest.fn() } as any,
      { save: jest.fn().mockResolvedValue(undefined) } as any,
    );

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
          sipRegisterPort: 48950,
          recordingChannelMode: 'STEREO_RAW',
        }),
      },
      outboundCallerIdRules: { findMany: jest.fn().mockResolvedValue([]) },
    } as any;
    const config = {
      get: jest.fn((key: string, fallback?: string) => fallback),
    } as any;
    const service = new AsteriskReloadService(
      prisma,
      config,
      { sendAction: jest.fn(), isConnected: jest.fn() } as any,
      { save: jest.fn().mockResolvedValue(undefined) } as any,
    );

    const preview = await service.previewConfFiles('tenant-1');

    expect(prisma.tenantSystemSettings.findUnique).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1' },
      select: expect.objectContaining({ recordingChannelMode: true }),
    });
    expect(preview.extensionsQueue).toContain('${UNIQUEID}.raw)');
    expect(preview.extensionsAgent).toContain('MixMonitor(${REC_BASE_DIR}/${REC_FILE},bD)');
  });
});

describe('AsteriskReloadService LKG 캡처', () => {
  const { mkdtempSync, rmSync, writeFileSync } = require('fs');
  const { tmpdir } = require('os');
  const { join } = require('path');

  function buildService(confDir: string) {
    const configSnapshot = { save: jest.fn().mockResolvedValue(undefined) };
    const config = {
      get: jest.fn((key: string, fallback?: string) =>
        key === 'ASTERISK_CONF_DIR' ? confDir : fallback,
      ),
    } as any;
    const service = new AsteriskReloadService(
      {} as any,
      config,
      { sendAction: jest.fn(), isConnected: jest.fn().mockReturnValue(true) } as any,
      configSnapshot as any,
    ) as any;
    return { service, configSnapshot };
  }

  it('적용된 conf 파일의 다이제스트를 LKG 로 저장한다', async () => {
    const confDir = mkdtempSync(join(tmpdir(), 'kcti-conf-'));
    writeFileSync(join(confDir, 'pjsip.conf'), '[trunk]\npassword=super-secret\n');
    const { service, configSnapshot } = buildService(confDir);

    try {
      await service.captureLkg('tenant-1');

      expect(configSnapshot.save).toHaveBeenCalledWith(
        'tenant-1',
        'pbx',
        expect.objectContaining({ confDir }),
      );
      const payload = configSnapshot.save.mock.calls[0][2];
      const entry = Object.values(payload.files)[0] as any;
      expect(entry.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(entry.bytes).toBeGreaterThan(0);
    } finally {
      rmSync(confDir, { recursive: true, force: true });
    }
  });

  it('conf 본문(비밀번호 포함)을 LKG 에 담지 않는다', async () => {
    // pjsip.conf 에는 SIP 비밀번호가 평문으로 들어간다. 객체 키 기준 마스킹으로는
    // 파일 본문 안의 값을 걸러낼 수 없으므로 애초에 본문을 저장하지 않는다.
    const confDir = mkdtempSync(join(tmpdir(), 'kcti-conf-'));
    writeFileSync(join(confDir, 'pjsip.conf'), '[trunk]\npassword=super-secret\n');
    const { service, configSnapshot } = buildService(confDir);

    try {
      await service.captureLkg('tenant-1');

      expect(JSON.stringify(configSnapshot.save.mock.calls[0][2])).not.toContain('super-secret');
    } finally {
      rmSync(confDir, { recursive: true, force: true });
    }
  });

  it('conf 디렉터리가 없으면 조용히 넘어간다', async () => {
    const { service, configSnapshot } = buildService('/nonexistent/kcti-conf');

    await expect(service.captureLkg('tenant-1')).resolves.toBeUndefined();

    expect(configSnapshot.save).not.toHaveBeenCalled();
  });

  it('LKG 저장 실패가 reload 를 되돌리지 않는다', async () => {
    const confDir = mkdtempSync(join(tmpdir(), 'kcti-conf-'));
    writeFileSync(join(confDir, 'pjsip.conf'), 'x');
    const { service, configSnapshot } = buildService(confDir);
    configSnapshot.save.mockRejectedValue(new Error('disk full'));

    try {
      await expect(service.captureLkg('tenant-1')).resolves.toBeUndefined();
    } finally {
      rmSync(confDir, { recursive: true, force: true });
    }
  });
});

describe('AsteriskReloadService 상담원 제안 대기 시간', () => {
  const fs = require('fs');

  function buildPrisma(agentOfferTimeoutSeconds: number | null) {
    return {
      asteriskTrunk: { findMany: jest.fn().mockResolvedValue([]) },
      agents: {
        findMany: jest.fn().mockResolvedValue([{
          agentId: 'agent-1',
          extension: '1001',
          agentName: '상담원1',
          sipPassword: 'pw',
          settingsProfile: null,
          branchMappings: [],
        }]),
      },
      asteriskDid: { findMany: jest.fn().mockResolvedValue([]) },
      asteriskIvrMenu: { findMany: jest.fn().mockResolvedValue([]) },
      asteriskForwardingRules: { findMany: jest.fn().mockResolvedValue([]) },
      asteriskBlocklistEntry: { findMany: jest.fn().mockResolvedValue([]) },
      tenantHolidayRules: { findMany: jest.fn().mockResolvedValue([]) },
      asteriskPrompt: { findMany: jest.fn().mockResolvedValue([]) },
      queues: { findMany: jest.fn().mockResolvedValue([]) },
      tenantSystemSettings: {
        findUnique: jest.fn().mockResolvedValue({ agentOfferTimeoutSeconds }),
      },
      outboundCallerIdRules: { findMany: jest.fn().mockResolvedValue([]) },
    } as any;
  }

  function buildService(prisma: any) {
    const config = { get: jest.fn((key: string, fallback?: string) => fallback) } as any;
    return new AsteriskReloadService(
      prisma,
      config,
      { sendAction: jest.fn(), isConnected: jest.fn() } as any,
      { save: jest.fn().mockResolvedValue(undefined) } as any,
    );
  }

  it('미리보기가 테넌트에 저장된 대기 시간을 dialplan 에 넣는다', async () => {
    const service = buildService(buildPrisma(25));

    const preview = await service.previewConfFiles('tenant-1');

    expect(preview.extensionsAgent).toContain('kaster-agent-offer.agi,${EXTEN},25)');
  });

  /**
   * 실제 PBX 에 나가는 것은 writeConfFiles 쪽이다. 미리보기만 고치면
   * 화면에는 관리자가 정한 값이 보이는데 PBX 는 예전 값으로 도는 상태가 된다.
   */
  it('실제 conf 쓰기도 같은 대기 시간을 dialplan 에 넣는다', async () => {
    const service = buildService(buildPrisma(25));
    const written = new Map<string, string>();
    const spies = [
      jest.spyOn(fs, 'existsSync').mockReturnValue(true),
      jest.spyOn(fs, 'readFileSync').mockReturnValue('#include kaster_prompt_moh.conf\n'),
      jest.spyOn(fs, 'readdirSync').mockReturnValue([]),
      jest.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined),
      jest.spyOn(fs, 'chmodSync').mockImplementation(() => undefined),
      jest.spyOn(fs, 'rmSync').mockImplementation(() => undefined),
      jest.spyOn(fs, 'copyFileSync').mockImplementation(() => undefined),
      jest.spyOn(fs, 'writeFileSync').mockImplementation((filePath: any, content: any) => {
        written.set(String(filePath), String(content));
      }),
    ];

    try {
      await service.writeConfFiles('tenant-1');
    } finally {
      for (const spy of spies) spy.mockRestore();
    }

    const agentConf = [...written.entries()]
      .find(([filePath]) => filePath.endsWith('extensions_agent.conf'))?.[1];
    expect(agentConf).toContain('kaster-agent-offer.agi,${EXTEN},25)');
  });

  it('테넌트 설정이 없으면 기본값으로 렌더한다', async () => {
    const service = buildService(buildPrisma(null));

    const preview = await service.previewConfFiles('tenant-1');

    expect(preview.extensionsAgent).toContain(
      `kaster-agent-offer.agi,\${EXTEN},${DEFAULT_AGENT_OFFER_TIMEOUT_SECONDS})`,
    );
  });
});
