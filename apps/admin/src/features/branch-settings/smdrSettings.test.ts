import { describe, expect, it } from 'vitest';
import { buildSmdrPayload, hydrateSmdrFormFields } from './smdrSettings';

describe('CID program branch settings payload', () => {
  it('always serializes the three supported program slots', () => {
    expect(
      buildSmdrPayload({
        smdrEnabled: true,
        smdrPrograms: [
          {
            programKey: 'CALLMANOR',
            enabled: true,
            inboundEnabled: true,
            outboundEnabled: false,
            includeOriginalCallerId: true,
          },
        ],
      }),
    ).toEqual({
      enabled: true,
      programs: [
        {
          programKey: 'LOGI',
          enabled: false,
          inboundEnabled: true,
          outboundEnabled: true,
          includeOriginalCallerId: true,
        },
        {
          programKey: 'CALLMANOR',
          enabled: true,
          inboundEnabled: true,
          outboundEnabled: false,
          includeOriginalCallerId: true,
        },
        {
          programKey: 'ICON',
          enabled: false,
          inboundEnabled: true,
          outboundEnabled: true,
          includeOriginalCallerId: true,
        },
      ],
    });
  });

  it('hydrates defaults from stored CID program settings', () => {
    expect(
      hydrateSmdrFormFields({
        enabled: true,
        programs: [
          {
            programKey: 'LOGI',
            enabled: true,
            inboundEnabled: false,
            outboundEnabled: true,
            includeOriginalCallerId: false,
          },
        ],
      }),
    ).toMatchObject({
      smdrEnabled: true,
      smdrPrograms: [
        {
          programKey: 'LOGI',
          enabled: true,
          inboundEnabled: false,
          outboundEnabled: true,
          includeOriginalCallerId: false,
        },
        { programKey: 'CALLMANOR', enabled: false },
        { programKey: 'ICON', enabled: false },
      ],
    });
  });
});
