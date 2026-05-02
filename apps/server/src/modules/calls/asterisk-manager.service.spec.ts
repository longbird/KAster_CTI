import { AsteriskManagerService } from './asterisk-manager.service';

describe('AsteriskManagerService', () => {
  const ami = {
    sendAction: jest.fn(),
  };
  let originalContext: string | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    originalContext = process.env.ASTERISK_OUTBOUND_CONTEXT;
    delete process.env.ASTERISK_OUTBOUND_CONTEXT;
  });

  afterEach(() => {
    if (originalContext === undefined) {
      delete process.env.ASTERISK_OUTBOUND_CONTEXT;
    } else {
      process.env.ASTERISK_OUTBOUND_CONTEXT = originalContext;
    }
  });

  it('originate uses the agent-specific outbound context by default', () => {
    const service = new AsteriskManagerService(ami as never);

    service.originate({
      agentExtension: '1001',
      phoneNumber: '01034623453',
      callerId: '07052346380',
    });

    expect(ami.sendAction).toHaveBeenCalledWith(expect.objectContaining({
      Action: 'Originate',
      Channel: 'PJSIP/1001',
      Context: 'outbound-main-1001',
      Exten: '01034623453',
      CallerID: '07052346380',
      Async: 'true',
    }));
  });

  it('originate still honors an explicit context override', () => {
    const service = new AsteriskManagerService(ami as never);

    service.originate({
      agentExtension: '1001',
      phoneNumber: '01034623453',
      context: 'custom-outbound',
    });

    expect(ami.sendAction).toHaveBeenCalledWith(expect.objectContaining({
      Context: 'custom-outbound',
    }));
  });

  it('originate treats ASTERISK_OUTBOUND_CONTEXT as a base context name', () => {
    process.env.ASTERISK_OUTBOUND_CONTEXT = 'site-outbound';
    const service = new AsteriskManagerService(ami as never);

    service.originate({
      agentExtension: '1001',
      phoneNumber: '01034623453',
    });

    expect(ami.sendAction).toHaveBeenCalledWith(expect.objectContaining({
      Context: 'site-outbound-1001',
    }));
  });
});
