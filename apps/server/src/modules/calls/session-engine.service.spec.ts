import { computeFingerprint } from './session-engine.service';

describe('computeFingerprint', () => {
  it('distinguishes Smart ARS UserEvent stages emitted in the same second', () => {
    const base = {
      nodeId: 'node-1',
      eventName: 'UserEvent',
      linkedid: '1777273943.1589',
      uniqueid: '1777273943.1589',
      channel: 'PJSIP/loadtest-0001',
      eventTime: '2026-04-27T07:12:25.100Z',
      UserEvent: 'KasterSmartArs',
      Digit: '1',
    };

    const selection = computeFingerprint({ ...base, Stage: 'selection', Action: 'OPT_OUT', Result: 'selected' });
    const action = computeFingerprint({ ...base, Stage: 'action', Action: 'OPT_OUT', Result: 'started' });
    const result = computeFingerprint({ ...base, Stage: 'result', Action: 'OPT_OUT', Result: 'SUCCESS' });

    expect(new Set([selection, action, result]).size).toBe(3);
  });

  it('uses nested AMI raw fields when computing UserEvent fingerprints', () => {
    const base = {
      nodeId: 'node-1',
      eventName: 'UserEvent',
      linkedid: '1777273943.1589',
      uniqueid: '1777273943.1589',
      channel: 'PJSIP/loadtest-0001',
      eventTime: '2026-04-27T07:12:25.100Z',
    };

    const action = computeFingerprint({
      ...base,
      raw: { UserEvent: 'KasterSmartArs', Stage: 'action', Digit: '1', Action: 'OPT_OUT', Result: 'started' },
    });
    const result = computeFingerprint({
      ...base,
      raw: { UserEvent: 'KasterSmartArs', Stage: 'result', Digit: '1', Action: 'OPT_OUT', Result: 'SUCCESS' },
    });

    expect(action).not.toBe(result);
  });
});
