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
  it('renders inbound-main context', () => {
    const { extensionsInbound } = renderDialplan({ dids: [], ivrMenus: [] });
    expect(extensionsInbound).toContain('[inbound-main]');
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
    expect(extensionsInbound).toContain('Playback(ss-noservice)');
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
});
