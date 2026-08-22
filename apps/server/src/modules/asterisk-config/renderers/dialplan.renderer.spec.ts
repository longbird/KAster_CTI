import { renderDialplan } from './dialplan.renderer';

const baseMenu = {
  id: 'm1', name: 'Main Menu',
  welcomePrompt: 'custom/welcome', menuPrompt: 'custom/main_menu', timeoutSecs: 5,
  entries: [
    { id: 'e1', digit: '1', label: 'Sales', queueName: 'sales', tenantId: 't1', menuId: 'm1' },
    { id: 'e2', digit: '2', label: 'Support', queueName: 'support', tenantId: 't1', menuId: 'm1' },
  ],
};

describe('renderDialplan', () => {
  // extensions.conf 에서 ; 는 주석의 시작이다. 값 안에 그냥 두면 그 줄이 거기서
  // 잘려나가 Set() 의 괄호와 ${} 가 짝을 잃는다. 통화마다
  // "Error in extension logic (missing '}')" 가 찍히고 CDR userfield 가 통째로 빈다.
  // 파일만 봐서는 멀쩡해 보이기 때문에 렌더 단계에서 막는다.
  it('escapes semicolons so the CDR line is not cut off as a comment', () => {
    const { extensionsQueue } = renderDialplan({ dids: [], ivrMenus: [] });
    const line = extensionsQueue.split('\n').find((l) => l.includes('CDR(userfield)'));

    expect(line).toBeDefined();
    expect(line).not.toMatch(/[^\\];/);
    expect(line).toContain('queue=');
    expect(line).toContain('rec=');
  });

  /**
   * Asterisk 는 상대 경로 음원을 언어 디렉터리(sounds/en/custom/) 밑에서 찾는다.
   * 우리는 sounds/custom/ 에 쓰므로 상대 경로로 부르면 못 찾고, 발신자는 45초를
   * 기다린 끝에 아무 말도 없이 끊긴다. 로그에는 "발신자가 포기함" 으로만 남는다.
   * 다른 안내(Smart ARS 등)가 모두 절대 경로인 것과 짝을 맞춘다.
   */
  it('큐 대기 초과 안내를 Asterisk 가 찾을 수 있는 경로로 부른다', () => {
    const { extensionsQueue } = renderDialplan({ dids: [], ivrMenus: [] });

    expect(extensionsQueue).toContain('Playback(/var/lib/asterisk/sounds/custom/queue_timeout)');
    expect(extensionsQueue).not.toContain('Playback(custom/queue_timeout)');
  });

  /**
   * ss-noservice 는 Asterisk 가 기본 제공하는 영어 안내다("The number you have dialed
   * is not in service"). 수신 거부를 등록해 둔 한국 고객이 자기 번호로 전화를 걸었을 때
   * 영어로 "없는 번호" 안내를 듣게 된다 — 안내가 틀렸을 뿐 아니라 무슨 일이 일어난
   * 것인지 알 수 없다.
   */
  it('수신 거부된 번호에게 한국어로 이유를 알린다', () => {
    const { extensionsInbound } = renderDialplan({ dids: [], ivrMenus: [] });
    const blocked = extensionsInbound.slice(extensionsInbound.indexOf('[blocked-ani]'));

    expect(blocked).toContain('Playback(/var/lib/asterisk/sounds/custom/blocked_ani)');
    expect(blocked).not.toContain('ss-noservice');
  });

  it('수신 거부 등록이 실패했을 때도 한국어로 알린다', () => {
    const { extensionsQueue } = renderDialplan({ dids: [], ivrMenus: [] });
    const failure = extensionsQueue.slice(extensionsQueue.indexOf('[080-optout-failure]'));

    expect(failure).toContain('Playback(/var/lib/asterisk/sounds/custom/optout_failed)');
    expect(failure).not.toContain('ss-noservice');
  });

  /**
   * 큐에 들어가면 곧바로 대기음이 시작된다. 발신자 입장에서는 자기 선택이 접수된
   * 것인지 알 수 없고, 음악만 나오니 잘못 걸린 줄 알고 끊는다.
   * 상담원 연결 선택뿐 아니라 큐로 바로 들어오는 DID 도 같은 자리를 지나므로
   * 여기 한 곳에 두면 경로를 빠뜨릴 일이 없다.
   */
  it('대기음 전에 연결 중이라고 알린다', () => {
    const { extensionsQueue } = renderDialplan({ dids: [], ivrMenus: [] });
    const entry = extensionsQueue.slice(0, extensionsQueue.indexOf('[queue-exit]'));
    const connecting = entry.indexOf('Playback(/var/lib/asterisk/sounds/custom/queue_connecting)');
    const queueApp = entry.indexOf('Queue(${QUEUE_NAME}');

    expect(connecting).toBeGreaterThan(-1);
    expect(connecting).toBeLessThan(queueApp);
  });

  it('renders inbound-main context', () => {
    const { extensionsInbound } = renderDialplan({ dids: [], ivrMenus: [] });
    expect(extensionsInbound).toContain('[inbound-main]');
  });

  it('uses RAW recording file names when stereo recording is enabled', () => {
    const { extensionsQueue } = renderDialplan({
      dids: [],
      ivrMenus: [],
      recordingChannelMode: 'STEREO_RAW',
    } as any);

    expect(extensionsQueue).toContain('Set(__REC_FILE=${STRFTIME(${EPOCH},,%Y/%m/%d)}/${CHANNEL(linkedid)}-${UNIQUEID}.raw)');
    expect(extensionsQueue).not.toContain('${UNIQUEID}.wav)');
  });

  it('renders DID with IVR menu link', () => {
    const { extensionsInbound } = renderDialplan({
      dids: [{ id: 'd1', did: '07012345678', ivrMenuId: 'm1', directQueue: null, enabled: true, description: null }],
      ivrMenus: [baseMenu],
    });
    expect(extensionsInbound).toContain('exten => 07012345678');
    expect(extensionsInbound).toContain('ivr-menu-main-menu');
  });

  it('renders DID with direct queue', () => {
    const { extensionsInbound } = renderDialplan({
      dids: [{ id: 'd2', did: '07099999999', ivrMenuId: null, directQueue: 'sales', enabled: true, description: null }],
      ivrMenus: [],
    });
    expect(extensionsInbound).toContain('exten => 07099999999');
    expect(extensionsInbound).toContain('Goto(queue-entry,sales,1)');
  });

  it('routes opt-out DID to immediate 080 entry flow', () => {
    const { extensionsInbound, extensionsQueue } = renderDialplan({
      dids: [{
        id: 'did-optout-immediate',
        did: '0801234567',
        ivrMenuId: null,
        directQueue: 'sales',
        enabled: true,
        description: null,
        branchOptOut080: {
          enabled: true,
          tenantId: 'tenant-1',
          branchId: 'branch-1',
          mode: 'IMMEDIATE_OPT_OUT',
          basePromptKey: 'custom/080_base',
          completionPromptKey: 'custom/080_done',
          smsTemplateId: 'tpl-1',
        },
      }],
      ivrMenus: [],
    });

    expect(extensionsInbound).toContain('Set(__OPT_OUT_MODE=IMMEDIATE_OPT_OUT)');
    expect(extensionsInbound).toContain('Set(__OPT_OUT_TENANT_ID=tenant-1)');
    expect(extensionsInbound).toContain('Set(__OPT_OUT_BRANCH_ID=branch-1)');
    expect(extensionsInbound).toContain('Set(__OPT_OUT_BASE_PROMPT=/var/lib/asterisk/sounds/custom/080_base)');
    expect(extensionsInbound).toContain('Goto(080-optout-entry,${EXTEN},1)');
    expect(extensionsInbound).not.toContain('Goto(queue-entry,sales,1)');

    expect(extensionsQueue).toContain('[080-optout-entry]');
    expect(extensionsQueue).toContain('GotoIf($["${OPT_OUT_MODE}"="IMMEDIATE_OPT_OUT"]?immediate)');
    expect(extensionsQueue).toContain("/var/lib/asterisk/sounds/custom/kaster-opt-out-hook.sh 'register'");
  });

  it('renders DTMF opt-out menu actions with queue and hook execution', () => {
    const { extensionsInbound, extensionsQueue } = renderDialplan({
      dids: [{
        id: 'did-optout-dtmf',
        did: '0807654321',
        ivrMenuId: null,
        directQueue: 'sales',
        enabled: true,
        description: null,
        branchOptOut080: {
          enabled: true,
          tenantId: 'tenant-1',
          branchId: 'branch-1',
          mode: 'DTMF_MENU',
          basePromptKey: 'custom/080_menu',
          basePromptInputDelaySeconds: 0,
          completionPromptKey: 'custom/080_done',
          smsTemplateId: 'tpl-default',
          dtmfMenu: {
            timeoutSeconds: 4,
            maxRetries: 2,
            invalidPromptKey: 'custom/080_invalid',
            timeoutPromptKey: 'custom/080_timeout',
            mappings: [
              { digit: '1', actionType: 'QUEUE_ROUTE', queueName: 'sales', smsTemplateId: null },
              { digit: '2', actionType: 'REGISTER_OPT_OUT', queueName: null, smsTemplateId: null },
              { digit: '3', actionType: 'UNREGISTER_OPT_OUT', queueName: null, smsTemplateId: null },
              { digit: '4', actionType: 'SEND_SMS', queueName: null, smsTemplateId: 'tpl-4' },
            ],
          },
        },
      }],
      ivrMenus: [],
    });

    expect(extensionsInbound).toContain('Set(__OPT_OUT_DTMF_ACTION_1=QUEUE_ROUTE)');
    expect(extensionsInbound).toContain('Set(__OPT_OUT_DTMF_QUEUE_1=sales)');
    expect(extensionsInbound).toContain('Set(__OPT_OUT_DTMF_ACTION_4=SEND_SMS)');
    expect(extensionsInbound).toContain('Set(__OPT_OUT_DTMF_SMS_4=tpl-4)');

    expect(extensionsQueue).toContain('[080-optout-dtmf]');
    expect(extensionsQueue).toContain('AGI(/var/lib/asterisk/sounds/custom/kaster-guarded-digit.agi,${OPT_OUT_BASE_PROMPT},${OPT_OUT_BASE_PROMPT_INPUT_DELAY},${OPT_OUT_DTMF_TIMEOUT},0123456789)');
    expect(extensionsQueue).toContain('Set(__OPT_OUT_SELECTED_ACTION=${OPT_OUT_DTMF_ACTION_${EXTEN}})');
    expect(extensionsQueue).toContain('GotoIf($["${LEN(${OPT_OUT_SELECTED_ACTION})}"="0"]?080-optout-dtmf-invalid,s,1)');
    expect(extensionsQueue).toContain('[080-optout-dtmf-invalid]');
    expect(extensionsQueue).toContain('Goto(queue-entry,${OPT_OUT_SELECTED_QUEUE},1)');
    expect(extensionsQueue).toContain("/var/lib/asterisk/sounds/custom/kaster-opt-out-hook.sh 'unregister'");
    expect(extensionsQueue).toContain("/var/lib/asterisk/sounds/custom/kaster-opt-out-hook.sh 'sms'");
    expect(extensionsQueue).toContain('GotoIf($["${SYSTEMSTATUS}"!="SUCCESS"]?080-optout-failure,s,1)');
    expect(extensionsQueue).toContain('[080-optout-failure]');
  });

  it('renders guarded 080 base prompt playback when input delay is configured', () => {
    const { extensionsInbound, extensionsQueue } = renderDialplan({
      dids: [{
        id: 'did-optout-dtmf-delay',
        did: '0807654322',
        ivrMenuId: null,
        directQueue: null,
        enabled: true,
        description: null,
        branchOptOut080: {
          enabled: true,
          tenantId: 'tenant-1',
          branchId: 'branch-1',
          mode: 'DTMF_MENU',
          basePromptKey: 'custom/080_menu',
          basePromptInputDelaySeconds: 3,
          dtmfMenu: {
            timeoutSeconds: 4,
            maxRetries: 0,
            mappings: [
              { digit: '1', actionType: 'REGISTER_OPT_OUT', queueName: null, smsTemplateId: null },
            ],
          },
        },
      }],
      ivrMenus: [],
    });

    expect(extensionsInbound).toContain('Set(__OPT_OUT_BASE_PROMPT_INPUT_DELAY=3)');
    expect(extensionsQueue).toContain('AGI(/var/lib/asterisk/sounds/custom/kaster-guarded-digit.agi,${OPT_OUT_BASE_PROMPT},${OPT_OUT_BASE_PROMPT_INPUT_DELAY},${OPT_OUT_DTMF_TIMEOUT},0123456789)');
  });

  it('renders smart opt-out input and confirm flow with same-number rejection', () => {
    const { extensionsInbound, extensionsQueue } = renderDialplan({
      dids: [{
        id: 'did-optout-smart',
        did: '0809999000',
        ivrMenuId: null,
        directQueue: 'sales',
        enabled: true,
        description: null,
        branchOptOut080: {
          enabled: true,
          tenantId: 'tenant-9',
          branchId: 'branch-9',
          mode: 'SMART_OPT_OUT',
          basePromptKey: 'custom/080_smart_base',
          smartFlow: {
            inputPromptKey: 'custom/080_input',
            reentryPromptKey: 'custom/080_retry',
            sameNumberPromptKey: 'custom/080_same',
            confirmPrefixPromptKey: 'custom/080_confirm_prefix',
            confirmSuffixPromptKey: 'custom/080_confirm_suffix',
            confirmMenuPromptKey: 'custom/080_confirm_menu',
            failurePromptKey: 'custom/080_fail',
            finalPromptKey: 'custom/080_final',
            inputTimeoutSeconds: 6,
            maxRetries: 3,
            confirmationMappings: [
              { digit: '1', actionType: 'REGISTER_OPT_OUT', queueName: null, smsTemplateId: null },
              { digit: '2', actionType: 'REENTER_NUMBER', queueName: null, smsTemplateId: null },
              { digit: '3', actionType: 'SEND_SMS', queueName: null, smsTemplateId: 'tpl-smart' },
              { digit: '4', actionType: 'HANGUP', queueName: null, smsTemplateId: null },
            ],
          },
        },
      }],
      ivrMenus: [],
    });

    expect(extensionsInbound).toContain('Set(__OPT_OUT_SMART_END_DIGIT=#)');
    expect(extensionsInbound).toContain('Set(__OPT_OUT_SMART_CONFIRM_ACTION_2=REENTER_NUMBER)');
    expect(extensionsInbound).toContain('Set(__OPT_OUT_SMART_CONFIRM_SMS_3=tpl-smart)');

    expect(extensionsQueue).toContain('[080-optout-smart-input]');
    expect(extensionsQueue).toContain('Read(OPT_OUT_SMART_TARGET,,16,,1,${OPT_OUT_SMART_TIMEOUT})');
    expect(extensionsQueue).toContain('GotoIf($["${OPT_OUT_TARGET_PHONE}"="${REQUESTER_PHONE}"]?080-optout-smart-same-number,s,1)');
    expect(extensionsQueue).toContain('[080-optout-smart-same-number]');
    expect(extensionsQueue).toContain('Playback(${OPT_OUT_SMART_SAME_NUMBER_PROMPT})');
    expect(extensionsQueue).toContain('Goto(080-optout-smart-input,s,read)');
    expect(extensionsQueue).toContain('[080-optout-smart-confirm]');
    expect(extensionsQueue).toContain('SayDigits(${OPT_OUT_TARGET_PHONE})');
    expect(extensionsQueue).toContain('GotoIf($["${LEN(${OPT_OUT_SELECTED_ACTION})}"="0"]?080-optout-smart-confirm-invalid,s,1)');
    expect(extensionsQueue).toContain('[080-optout-smart-confirm-invalid]');
    expect(extensionsQueue).toContain('GotoIf($["${OPT_OUT_SELECTED_ACTION}"="REENTER_NUMBER"]?080-optout-smart-input,reenter,1)');
    expect(extensionsQueue).toContain('exten => reenter,1,NoOp(Restart smart opt-out number entry)\n same => n,Goto(080-optout-smart-input,s,read)');
    expect(extensionsQueue).toContain('Set(__OPT_OUT_RESULT_PROMPT=${IF($["${OPT_OUT_MODE}"="SMART_OPT_OUT"]?${OPT_OUT_SMART_FINAL_PROMPT}:${OPT_OUT_COMPLETION_PROMPT})})');
    expect(extensionsQueue).toContain('NoOp(080 Opt-Out Failure / ACTION=${OPT_OUT_SELECTED_ACTION} / STATUS=${SYSTEMSTATUS})');
    expect(extensionsQueue).toContain('Playback(/var/lib/asterisk/sounds/custom/optout_failed)');
  });

  it('renders branch Smart ARS runtime route with all configured action types', () => {
    const { extensionsInbound, extensionsQueue } = renderDialplan({
      dids: [{
        id: 'did-smart-ars',
        did: '07070001111',
        ivrMenuId: null,
        directQueue: 'fallback',
        enabled: true,
        description: null,
        branchSmartArs: {
          enabled: true,
          tenantId: 'tenant-1',
          branchId: 'branch-1',
          guidePromptKey: 'custom/smart_ars_guide',
          invalidPromptKey: 'custom/smart_ars_invalid',
          failPromptKey: 'custom/smart_ars_fail',
          timeoutSeconds: 5,
          maxRetries: 2,
          actions: [
            { digit: '0', actionType: 'QUEUE_ROUTE', queueName: 'sales', transferNumber: null, smsTemplateId: null, promptKey: null },
            { digit: '1', actionType: 'TRANSFER', queueName: null, transferNumber: '01012345678', smsTemplateId: null, promptKey: null },
            { digit: '2', actionType: 'SEND_SMS', queueName: null, transferNumber: null, smsTemplateId: 'tpl-1', promptKey: null },
            { digit: '3', actionType: 'OPT_OUT', queueName: null, transferNumber: null, smsTemplateId: null, promptKey: null },
            { digit: '4', actionType: 'PLAY_PROMPT', queueName: null, transferNumber: null, smsTemplateId: null, promptKey: 'custom/office_hours' },
          ],
        },
      }],
      ivrMenus: [],
    });

    expect(extensionsInbound).toContain('Goto(smart-ars-did-smart-ars,s,1)');
    expect(extensionsInbound).not.toContain('Goto(queue-entry,fallback,1)');
    expect(extensionsQueue).toContain('[smart-ars-did-smart-ars]');
    expect(extensionsQueue).toContain('Background(/var/lib/asterisk/sounds/custom/smart_ars_guide)');
    expect(extensionsQueue).toContain('WaitExten(${SMART_ARS_TIMEOUT})');
    expect(extensionsQueue).toContain('[smart-ars-retry-did-smart-ars]');
    expect(extensionsQueue).toContain('GotoIf($[${SMART_ARS_RETRY_COUNT}<=${SMART_ARS_MAX_RETRIES}]?smart-ars-did-smart-ars,s,loop)');
    expect(extensionsQueue).toContain('exten => 0,1,NoOp(Smart ARS digit 0 action QUEUE_ROUTE)');
    expect(extensionsQueue).toContain('Goto(queue-entry,sales,1)');
    expect(extensionsQueue).toContain('exten => 1,1,NoOp(Smart ARS digit 1 action TRANSFER)');
    expect(extensionsQueue).toContain('Goto(transfer-target,01012345678,1)');
    expect(extensionsQueue).toContain("kaster-smart-ars-hook.sh 'sms'");
    expect(extensionsQueue).toContain("kaster-smart-ars-hook.sh 'opt-out'");
    expect(extensionsQueue).toContain('Playback(/var/lib/asterisk/sounds/custom/office_hours)');
    expect(extensionsQueue).toContain('[smart-ars-failure-did-smart-ars]');
    expect(extensionsQueue).toContain('Playback(/var/lib/asterisk/sounds/custom/smart_ars_fail)');
  });

  it('renders branch prompt playback before direct queue routing when wait-for-completion is enabled', () => {
    const { extensionsInbound } = renderDialplan({
      dids: [{
        id: 'd-prompt',
        did: '07088887777',
        ivrMenuId: null,
        directQueue: 'sales',
        branchPromptKeys: ['custom/smart080_same_number'],
        branchPromptQueueDelaySeconds: 7,
        branchPromptWaitForCompletion: true,
        enabled: true,
        description: null,
      }],
      ivrMenus: [],
    });
    const answerIndex = extensionsInbound.indexOf('Answer()');
    const languageIndex = extensionsInbound.indexOf('Set(CHANNEL(language)=)');
    const playbackIndex = extensionsInbound.indexOf('Playback(/var/lib/asterisk/sounds/custom/smart080_same_number)');
    const waitIndex = extensionsInbound.indexOf('Wait(7)');
    const queueIndex = extensionsInbound.indexOf('Goto(queue-entry,sales,1)');

    expect(answerIndex).toBeGreaterThan(-1);
    expect(languageIndex).toBeGreaterThan(answerIndex);
    expect(playbackIndex).toBeGreaterThan(languageIndex);
    expect(waitIndex).toBeGreaterThan(playbackIndex);
    expect(playbackIndex).toBeGreaterThan(-1);
    expect(queueIndex).toBeGreaterThan(waitIndex);
  });

  it('starts prompt MOH before delayed queue entry when wait-for-completion is disabled', () => {
    const { extensionsInbound, extensionsQueue } = renderDialplan({
      dids: [{
        id: 'd-prompt-delay',
        did: '07088886666',
        ivrMenuId: null,
        directQueue: 'sales',
        branchPromptKeys: ['custom/smart080_same_number'],
        branchPromptQueueDelaySeconds: 5,
        branchPromptWaitForCompletion: false,
        enabled: true,
        description: null,
      }],
      ivrMenus: [],
    });

    expect(extensionsInbound).toContain('Set(__QUEUE_PROMPT_MOH_CLASS=branch-prompt-smart080_same_number)');
    expect(extensionsInbound).toContain('Set(__QUEUE_PROMPT_KEEP_IN_QUEUE=1)');
    expect(extensionsInbound).toContain('Set(__QUEUE_PROMPT_PRESTARTED=1)');
    expect(extensionsInbound).toContain('StartMusicOnHold(${QUEUE_PROMPT_MOH_CLASS})');
    expect(extensionsInbound).toContain('Wait(5)');
    expect(extensionsInbound).not.toContain('StopMusicOnHold()');
    expect(extensionsInbound).not.toContain('Playback(/var/lib/asterisk/sounds/custom/smart080_same_number)');
    expect(extensionsQueue).toContain('exten => h,1,NoOp(Queue Entry Hangup)');
    expect(extensionsQueue).toContain('"${QUEUE_PROMPT_PRESTARTED}"!="1"');
    expect(extensionsQueue).toContain('"${QUEUE_PROMPT_KEEP_IN_QUEUE}"="1"');
  });

  it('renders DID forwarding rule to extension before default DID target', () => {
    const { extensionsInbound, extensionsQueue } = renderDialplan({
      dids: [{ id: 'd-forward', did: '07055555555', ivrMenuId: null, directQueue: 'sales', enabled: true, description: null }],
      ivrMenus: [],
      forwardingRules: [
        {
          id: 'f1',
          didId: 'd-forward',
          forwardType: 'EXTENSION',
          targetValue: '1001',
          forwardTriggerMode: 'IMMEDIATE',
          queueWaitSeconds: null,
          stickyCallbackWindowMinutes: null,
          conditionType: 'ALWAYS',
          timeStart: null,
          timeEnd: null,
          daysOfWeek: null,
          enabled: true,
        },
      ],
    });
    expect(extensionsInbound).toContain('exten => 07055555555');
    expect(extensionsInbound).toContain('Goto(forwarding-rule-f1,s,1)');
    expect(extensionsQueue).toContain('GotoIf($["${FORWARD_TYPE}"="EXTENSION"]?from-queue,${FORWARD_TARGET},1)');
    expect(extensionsInbound).not.toContain('Goto(queue-entry,sales,1)');
  });

  it('renders conditional forwarding rule with DID fallback', () => {
    const { extensionsInbound } = renderDialplan({
      dids: [{ id: 'd-conditional', did: '07055550000', ivrMenuId: null, directQueue: 'sales', enabled: true, description: null }],
      ivrMenus: [],
      forwardingRules: [
        {
          id: 'f2',
          didId: 'd-conditional',
          forwardType: 'QUEUE',
          targetValue: 'night',
          forwardTriggerMode: 'IMMEDIATE',
          queueWaitSeconds: null,
          stickyCallbackWindowMinutes: null,
          conditionType: 'TIME_RANGE',
          timeStart: '18:00',
          timeEnd: '23:00',
          daysOfWeek: 'mon,tue',
          enabled: true,
        },
      ],
    });
    expect(extensionsInbound).toContain('GotoIfTime(18:00-23:00,mon,*,*?forwarding-rule-f2,s,1)');
    expect(extensionsInbound).toContain('GotoIfTime(18:00-23:00,tue,*,*?forwarding-rule-f2,s,1)');
    expect(extensionsInbound).toContain('Goto(queue-entry,sales,1)');
  });

  it('renders forwarding rule to external number', () => {
    const { extensionsInbound, extensionsQueue } = renderDialplan({
      dids: [{ id: 'd-external', did: '07055551234', ivrMenuId: null, directQueue: 'sales', enabled: true, description: null }],
      ivrMenus: [],
      forwardingRules: [
        {
          id: 'f-external',
          didId: 'd-external',
          forwardType: 'EXTERNAL_NUMBER',
          targetValue: '01012345678',
          forwardTriggerMode: 'IMMEDIATE',
          queueWaitSeconds: null,
          stickyCallbackWindowMinutes: null,
          conditionType: 'ALWAYS',
          timeStart: null,
          timeEnd: null,
          daysOfWeek: null,
          scheduleJson: JSON.stringify([{ conditionType: 'ALWAYS', timeStart: null, timeEnd: null, daysOfWeek: [] }]),
          enabled: true,
        },
      ],
    });
    expect(extensionsInbound).toContain('Goto(forwarding-rule-f-external,s,1)');
    expect(extensionsQueue).toContain('GotoIf($["${FORWARD_TYPE}"="EXTERNAL_NUMBER"]?transfer-target,${FORWARD_TARGET},1)');
  });

  it('renders multiple conditional forwarding windows from scheduleJson', () => {
    const { extensionsInbound } = renderDialplan({
      dids: [{ id: 'd-multi', did: '07055559876', ivrMenuId: null, directQueue: 'sales', enabled: true, description: null }],
      ivrMenus: [],
      forwardingRules: [
        {
          id: 'f-multi',
          didId: 'd-multi',
          forwardType: 'QUEUE',
          targetValue: 'night',
          forwardTriggerMode: 'IMMEDIATE',
          queueWaitSeconds: null,
          stickyCallbackWindowMinutes: null,
          conditionType: 'TIME_RANGE',
          timeStart: null,
          timeEnd: null,
          daysOfWeek: null,
          scheduleJson: JSON.stringify([
            { conditionType: 'TIME_RANGE', timeStart: '09:00', timeEnd: '12:00', daysOfWeek: ['mon', 'tue'] },
            { conditionType: 'TIME_RANGE', timeStart: '14:00', timeEnd: '18:00', daysOfWeek: ['wed', 'thu'] },
          ]),
          enabled: true,
        },
      ],
    });
    expect(extensionsInbound).toContain('GotoIfTime(09:00-12:00,mon,*,*?forwarding-rule-f-multi,s,1)');
    expect(extensionsInbound).toContain('GotoIfTime(09:00-12:00,tue,*,*?forwarding-rule-f-multi,s,1)');
    expect(extensionsInbound).toContain('GotoIfTime(14:00-18:00,wed,*,*?forwarding-rule-f-multi,s,1)');
    expect(extensionsInbound).toContain('GotoIfTime(14:00-18:00,thu,*,*?forwarding-rule-f-multi,s,1)');
    expect(extensionsInbound).toContain('Goto(queue-entry,sales,1)');
  });

  it('renders DID with direct extension', () => {
    const { extensionsInbound } = renderDialplan({
      dids: [{ id: 'd-direct-ext', did: '07088887777', ivrMenuId: null, directQueue: null, directExtension: '1001', enabled: true, description: null }],
      ivrMenus: [],
    });

    expect(extensionsInbound).toContain('exten => 07088887777');
    expect(extensionsInbound).toContain('NoOp(Direct DID to extension 1001)');
    expect(extensionsInbound).toContain('Dial(PJSIP/1001,20,tTU(agent-pre-bridge))');
  });

  it('routes holiday dates to the configured forwarding rule before business-hour checks', () => {
    const { extensionsInbound } = renderDialplan({
      dids: [{
        id: 'd-holiday',
        did: '07055551200',
        branchId: 'branch-1',
        ivrMenuId: null,
        directQueue: 'sales',
        enabled: true,
        description: null,
      }],
      ivrMenus: [],
      holidayRules: [
        {
          holidayRuleId: 'h-tenant',
          branchId: null,
          ruleType: 'ANNUAL',
          holidayDate: null,
          monthDay: '05-05',
          isActive: true,
        },
        {
          holidayRuleId: 'h-workday',
          branchId: 'branch-1',
          ruleType: 'WORKDAY_OVERRIDE',
          holidayDate: '2026-05-05',
          monthDay: null,
          isActive: true,
        },
        {
          holidayRuleId: 'h-branch',
          branchId: 'branch-1',
          ruleType: 'DATE',
          holidayDate: '2026-05-06',
          monthDay: null,
          isActive: true,
        },
      ],
      forwardingRules: [
        {
          id: 'f-holiday',
          didId: 'd-holiday',
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
            { conditionType: 'TIME_RANGE', timeStart: '09:00', timeEnd: '18:00', daysOfWeek: ['mon', 'tue', 'wed', 'thu', 'fri'] },
          ]),
          enabled: true,
        },
      ],
    });

    expect(extensionsInbound).toContain('GotoIf($["${STRFTIME(${EPOCH},,%Y-%m-%d)}"="2026-05-05"]?holiday-workday-d-holiday)');
    expect(extensionsInbound).toContain('GotoIf($["${STRFTIME(${EPOCH},,%Y-%m-%d)}"="2026-05-06"]?forwarding-rule-f-holiday,s,1)');
    expect(extensionsInbound).toContain('GotoIf($["${STRFTIME(${EPOCH},,%m-%d)}"="05-05"]?forwarding-rule-f-holiday,s,1)');
    expect(extensionsInbound.indexOf('?holiday-workday-d-holiday')).toBeLessThan(
      extensionsInbound.indexOf('?forwarding-rule-f-holiday,s,1)'),
    );
    expect(extensionsInbound).toContain('GotoIfTime(09:00-18:00,mon,*,*?forwarding-rule-f-holiday,s,1)');
    expect(extensionsInbound).toContain('Goto(queue-entry,sales,1)');
  });

  it('splits a cross-midnight forwarding window across two weekdays', () => {
    const { extensionsInbound } = renderDialplan({
      dids: [{ id: 'd-night', did: '07066667777', ivrMenuId: null, directQueue: 'sales', enabled: true, description: null }],
      ivrMenus: [],
      forwardingRules: [
        {
          id: 'f-night',
          didId: 'd-night',
          forwardType: 'QUEUE',
          targetValue: 'night-desk',
          forwardTriggerMode: 'IMMEDIATE',
          queueWaitSeconds: null,
          stickyCallbackWindowMinutes: null,
          conditionType: 'TIME_RANGE',
          timeStart: null,
          timeEnd: null,
          daysOfWeek: null,
          scheduleJson: JSON.stringify([
            { conditionType: 'TIME_RANGE', timeStart: '22:00', timeEnd: '06:00', daysOfWeek: ['mon'] },
          ]),
          enabled: true,
        },
      ],
    });
    expect(extensionsInbound).toContain('GotoIfTime(22:00-23:59,mon,*,*?forwarding-rule-f-night,s,1)');
    expect(extensionsInbound).toContain('GotoIfTime(00:00-06:00,tue,*,*?forwarding-rule-f-night,s,1)');
    expect(extensionsInbound).not.toContain('GotoIfTime(00:00-06:00,mon,');
  });

  it('rolls Sunday cross-midnight window over to Monday', () => {
    const { extensionsInbound } = renderDialplan({
      dids: [{ id: 'd-sun', did: '07088889999', ivrMenuId: null, directQueue: 'sales', enabled: true, description: null }],
      ivrMenus: [],
      forwardingRules: [
        {
          id: 'f-sun',
          didId: 'd-sun',
          forwardType: 'QUEUE',
          targetValue: 'night-desk',
          forwardTriggerMode: 'IMMEDIATE',
          queueWaitSeconds: null,
          stickyCallbackWindowMinutes: null,
          conditionType: 'TIME_RANGE',
          timeStart: null,
          timeEnd: null,
          daysOfWeek: null,
          scheduleJson: JSON.stringify([
            { conditionType: 'TIME_RANGE', timeStart: '23:00', timeEnd: '05:00', daysOfWeek: ['sun'] },
          ]),
          enabled: true,
        },
      ],
    });
    expect(extensionsInbound).toContain('GotoIfTime(23:00-23:59,sun,*,*?forwarding-rule-f-sun,s,1)');
    expect(extensionsInbound).toContain('GotoIfTime(00:00-05:00,mon,*,*?forwarding-rule-f-sun,s,1)');
  });

  it('renders queue wait forwarding trigger', () => {
    const { extensionsInbound } = renderDialplan({
      dids: [{ id: 'd-wait', did: '07011112222', ivrMenuId: null, directQueue: 'sales', enabled: true, description: null }],
      ivrMenus: [],
      forwardingRules: [
        {
          id: 'f-wait',
          didId: 'd-wait',
          forwardType: 'EXTERNAL_NUMBER',
          targetValue: '01055556666',
          forwardTriggerMode: 'AFTER_QUEUE_WAIT',
          queueWaitSeconds: 20,
          stickyCallbackWindowMinutes: null,
          conditionType: 'ALWAYS',
          timeStart: null,
          timeEnd: null,
          daysOfWeek: null,
          enabled: true,
        },
      ],
    });
    expect(extensionsInbound).toContain('[forwarding-rule-f-wait]');
    expect(extensionsInbound).toContain('Set(__FORWARD_AFTER_QUEUE_ENABLED=1)');
    expect(extensionsInbound).toContain('Set(__QUEUE_TIMEOUT_SECS=20)');
    expect(extensionsInbound).toContain('Goto(queue-entry,sales,1)');
  });

  it('renders queue overflow rules for IVR-routed queue timeout', () => {
    const { extensionsQueue } = renderDialplan({
      dids: [{ id: 'd-ivr', did: '15771577', ivrMenuId: 'm1', directQueue: null, enabled: true, description: null }],
      ivrMenus: [baseMenu],
      queueOverflowRules: [
        {
          id: 'qo-1',
          queueName: 'sales',
          triggerMode: 'AFTER_WAIT',
          waitSeconds: 25,
          targetType: 'EXTERNAL_NUMBER',
          targetValue: '07080120000',
          resultCode: 'AI_OVERFLOW',
          enabled: true,
          priority: 100,
        },
      ],
    });

    expect(extensionsQueue).toContain('[queue-overflow-timeout]');
    expect(extensionsQueue).toContain('exten => sales,1,Set(__QUEUE_TIMEOUT_SECS=25)');
    expect(extensionsQueue).toContain('[queue-overflow]');
    expect(extensionsQueue).toContain('exten => sales,1,NoOp(Queue Overflow / sales / AI_OVERFLOW)');
    expect(extensionsQueue).toContain('Goto(transfer-target,07080120000,1)');
    expect(extensionsQueue).toContain('GotoIf($["${QUEUESTATUS}"="TIMEOUT"]?queue-overflow,${QUEUE_NAME},1)');
  });

  it('renders smart forwarding trigger when no ready agents', () => {
    const { extensionsInbound, extensionsQueue } = renderDialplan({
      dids: [{ id: 'd-smart', did: '07011113333', ivrMenuId: null, directQueue: 'sales', enabled: true, description: null }],
      ivrMenus: [],
      forwardingRules: [
        {
          id: 'f-smart',
          didId: 'd-smart',
          forwardType: 'EXTERNAL_NUMBER',
          targetValue: '01077778888',
          forwardTriggerMode: 'SMART_NO_READY',
          queueWaitSeconds: null,
          stickyCallbackWindowMinutes: null,
          conditionType: 'ALWAYS',
          timeStart: null,
          timeEnd: null,
          daysOfWeek: null,
          enabled: true,
        },
      ],
    });
    expect(extensionsInbound).toContain('Set(__SMART_FORWARD_ENABLED=1)');
    expect(extensionsQueue).toContain('Set(__QUEUE_READY_COUNT=${QUEUE_MEMBER(${QUEUE_NAME},ready)})');
    expect(extensionsQueue).toContain('Goto(forward-dispatch,s,1)');
  });

  it('renders sticky callback override for repeat caller forwarding', () => {
    const { extensionsInbound, extensionsQueue } = renderDialplan({
      dids: [{ id: 'd-sticky', did: '07011114444', ivrMenuId: null, directQueue: 'sales', enabled: true, description: null }],
      ivrMenus: [],
      forwardingRules: [
        {
          id: 'f-sticky',
          didId: 'd-sticky',
          forwardType: 'EXTERNAL_NUMBER',
          targetValue: '01099990000',
          forwardTriggerMode: 'AFTER_QUEUE_WAIT',
          queueWaitSeconds: 15,
          stickyCallbackWindowMinutes: 30,
          conditionType: 'ALWAYS',
          timeStart: null,
          timeEnd: null,
          daysOfWeek: null,
          enabled: true,
        },
      ],
    });
    expect(extensionsInbound).toContain('Set(__FORWARD_STICKY_KEY=forward-sticky/${ENTRY_DID}/${CALLERID(num)})');
    expect(extensionsInbound).toContain('Set(__FORWARD_STICKY_WINDOW_SECS=1800)');
    expect(extensionsQueue).toContain('Set(DB(${FORWARD_STICKY_KEY})=${EPOCH}|${FORWARD_TARGET}|${FORWARD_TYPE})');
  });

  it('renders blocklist check before DID routing', () => {
    const { extensionsInbound } = renderDialplan({
      dids: [{ id: 'd-block', did: '07012341234', ivrMenuId: null, directQueue: 'sales', enabled: true, description: null }],
      ivrMenus: [],
      blocklistEntries: [
        { id: 'b1', matchType: 'EXACT', phoneNumber: '08012345678', isActive: true },
      ],
    });
    expect(extensionsInbound).toContain('GotoIf($["${CALLERID(num)}"="08012345678"]?blocked-ani,s,1)');
    expect(extensionsInbound).toContain('[blocked-ani]');
    expect(extensionsInbound).toContain('Playback(/var/lib/asterisk/sounds/custom/blocked_ani)');
  });

  it('renders prefix blocklist check before DID routing', () => {
    const { extensionsInbound } = renderDialplan({
      dids: [{ id: 'd-block-prefix', did: '07012340000', ivrMenuId: null, directQueue: 'sales', enabled: true, description: null }],
      ivrMenus: [],
      blocklistEntries: [
        { id: 'b2', matchType: 'PREFIX', phoneNumber: '080', isActive: true },
      ],
    });
    expect(extensionsInbound).toContain('GotoIf($["${CALLERID(num):0:3}"="080"]?blocked-ani,s,1)');
  });

  it('skips disabled DIDs', () => {
    const { extensionsInbound } = renderDialplan({
      dids: [{ id: 'd3', did: '07011111111', ivrMenuId: null, directQueue: 'sales', enabled: false, description: null }],
      ivrMenus: [],
    });
    expect(extensionsInbound).not.toContain('07011111111');
  });

  it('renders IVR menu context with DTMF entries', () => {
    const { extensionsQueue } = renderDialplan({ dids: [], ivrMenus: [baseMenu] });
    expect(extensionsQueue).toContain('[queue-entry]');
    expect(extensionsQueue).toContain('Queue(${QUEUE_NAME},tT,,,${QUEUE_TIMEOUT_SECS},,,agent-pre-bridge)');
    expect(extensionsQueue).toContain('[ivr-menu-main-menu]');
    expect(extensionsQueue).toContain('Playback(/var/lib/asterisk/sounds/custom/welcome)');
    expect(extensionsQueue).toContain('Background(/var/lib/asterisk/sounds/custom/main_menu)');
    expect(extensionsQueue).toContain('exten => 1,1,Goto(queue-entry,sales,1)');
    expect(extensionsQueue).toContain('exten => 2,1,Goto(queue-entry,support,1)');
    expect(extensionsQueue).toContain('exten => t,1,Playback(vm-goodbye)');
  });

  it('skips DID with no target and emits warning', () => {
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { extensionsInbound } = renderDialplan({
      dids: [{ id: 'd4', did: '07022222222', ivrMenuId: null, directQueue: null, enabled: true, description: null }],
      ivrMenus: [],
    });
    expect(extensionsInbound).not.toContain('07022222222');
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('07022222222'));
    spy.mockRestore();
  });

  it('skips IVR menu with no entries in extensionsQueue', () => {
    const emptyMenu = { id: 'm2', name: 'Empty Menu', welcomePrompt: null, menuPrompt: null, timeoutSecs: 5, entries: [] };
    const { extensionsQueue } = renderDialplan({ dids: [], ivrMenus: [emptyMenu] });
    expect(extensionsQueue).toContain('[queue-entry]');
    expect(extensionsQueue).not.toContain('[ivr-menu-empty-menu]');
  });

  it('throws on newline injection in did number', () => {
    expect(() => renderDialplan({
      dids: [{ id: 'd5', did: '070\n999', ivrMenuId: null, directQueue: 'sales', enabled: true, description: null }],
      ivrMenus: [],
    })).toThrow('illegal newline');
  });

  it('throws on newline injection in directQueue', () => {
    expect(() => renderDialplan({
      dids: [{ id: 'd6', did: '07033333333', ivrMenuId: null, directQueue: 'sales\nmalicious', enabled: true, description: null }],
      ivrMenus: [],
    })).toThrow('illegal newline');
  });

  it('throws on empty slug from IVR menu name', () => {
    expect(() => renderDialplan({
      dids: [],
      ivrMenus: [{ id: 'm3', name: '!!!', welcomePrompt: null, menuPrompt: null, timeoutSecs: 5, entries: [{ id: 'e3', digit: '1', label: 'X', queueName: 'q', tenantId: 't1', menuId: 'm3' }] }],
    })).toThrow('empty slug');
  });

  it('throws on invalid timeoutSecs', () => {
    expect(() => renderDialplan({
      dids: [],
      ivrMenus: [{ id: 'm4', name: 'ValidMenu', welcomePrompt: null, menuPrompt: null, timeoutSecs: 0, entries: [{ id: 'e4', digit: '1', label: 'X', queueName: 'q', tenantId: 't1', menuId: 'm4' }] }],
    })).toThrow('invalid timeoutSecs');
  });

  /**
   * 제안 대기 시간은 호분배룰(큐)마다 다르다. 상담원을 부르는 `agent-offer` context 는 모든 큐가
   * 함께 쓰므로 거기에는 어느 큐인지가 없다 — 값이 호를 따라가야 한다.
   */
  describe('agent-offer-timeout', () => {
    const offerContext = (queues: Array<{ queueName: string; agentOfferTimeoutSeconds?: number | null }>) => {
      const { extensionsQueue } = renderDialplan({ dids: [], ivrMenus: [], queueOfferTimeouts: queues });
      return extensionsQueue.slice(extensionsQueue.indexOf('[agent-offer-timeout]'));
    };

    it('큐마다 다른 대기 시간을 심는다', () => {
      const rendered = offerContext([
        { queueName: 'sales', agentOfferTimeoutSeconds: 7 },
        { queueName: 'support', agentOfferTimeoutSeconds: 20 },
      ]);

      expect(rendered).toContain('exten => sales,1,Set(__KASTER_OFFER_TIMEOUT=7)');
      expect(rendered).toContain('exten => support,1,Set(__KASTER_OFFER_TIMEOUT=20)');
    });

    /**
     * 밑줄 두 개가 이 기능의 전부다. 큐가 상담원을 부를 때 만드는 `Local/{내선}@agent-offer`
     * 채널은 발신자 채널에서 <b>상속되는 변수만</b> 물려받는다. 하나라도 빠뜨리면 읽는 쪽이
     * 언제나 빈 값을 보고, 관리자가 넣은 값이 조용히 무시된다.
     */
    it('상속되는 변수로 심는다', () => {
      const rendered = offerContext([{ queueName: 'sales', agentOfferTimeoutSeconds: 7 }]);

      expect(rendered).toContain('Set(__KASTER_OFFER_TIMEOUT=');
      expect(rendered).not.toContain('Set(KASTER_OFFER_TIMEOUT=');
    });

    /** 등록되지 않은 큐로 들어와도 다이얼플랜이 멈추지 않아야 한다. */
    it('모르는 큐는 그냥 돌아간다', () => {
      expect(offerContext([])).toContain('exten => _.,1,Return()');
    });

    /**
     * DB 에는 범위 밖 값이 들어올 수 있다 — 마이그레이션 이전 행, DB 직접 수정.
     * 그 값이 그대로 나가면 AGI 가 롱폴 검증(1~60초)에 걸려 400 을 받고,
     * AGI 는 실패하면 ACCEPT 로 연다 — 전 상담원이 묻지도 않고 자동 수락된다.
     */
    it('상한을 넘는 값은 상한으로 깎는다', () => {
      expect(offerContext([{ queueName: 'sales', agentOfferTimeoutSeconds: 900 }]))
        .toContain('exten => sales,1,Set(__KASTER_OFFER_TIMEOUT=60)');
    });

    it('하한보다 짧은 값은 하한으로 올린다', () => {
      expect(offerContext([{ queueName: 'sales', agentOfferTimeoutSeconds: 0 }]))
        .toContain('exten => sales,1,Set(__KASTER_OFFER_TIMEOUT=1)');
    });

    it('값이 없으면 기본값으로 심는다', () => {
      expect(offerContext([{ queueName: 'sales', agentOfferTimeoutSeconds: null }]))
        .toContain('exten => sales,1,Set(__KASTER_OFFER_TIMEOUT=10)');
    });

    it('큐 진입에서 값을 심고, 못 심었으면 기본값으로 채운다', () => {
      const { extensionsQueue } = renderDialplan({ dids: [], ivrMenus: [] });

      expect(extensionsQueue).toContain('Gosub(agent-offer-timeout,${QUEUE_NAME},1)');
      expect(extensionsQueue).toContain(
        'ExecIf($["${LEN(${KASTER_OFFER_TIMEOUT})}"="0"]?Set(__KASTER_OFFER_TIMEOUT=10))',
      );
    });
  });
});
