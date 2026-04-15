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

  it('skips disabled DIDs', () => {
    const { extensionsInbound } = renderDialplan({
      dids: [{ id: 'd3', did: '07011111111', ivrMenuId: null, directQueue: 'sales', enabled: false, description: null }],
      ivrMenus: [],
    });
    expect(extensionsInbound).not.toContain('07011111111');
  });

  it('renders IVR menu context with DTMF entries', () => {
    const { extensionsQueue } = renderDialplan({ dids: [], ivrMenus: [baseMenu] });
    expect(extensionsQueue).toContain('[ivr-menu-main-menu]');
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
    expect(extensionsQueue).toBe('');
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
