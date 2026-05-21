import { describe, expect, it } from 'vitest';
import { buildSmdrPayload, hydrateSmdrFormFields } from './smdrSettings';

describe('SMDR branch settings payload', () => {
  it('builds normalized external alert settings for branch mapping saves', () => {
    expect(buildSmdrPayload({
      smdrEnabled: true,
      smdrEndpointUrl: ' https://ops.example.com/smdr ',
      smdrAuthToken: ' token-123 ',
      smdrSecret: ' secret-456 ',
      smdrTimeoutSeconds: 20.8,
      smdrEventTypes: ['CALL_END', 'CALL_START'],
    })).toEqual({
      enabled: true,
      endpointUrl: 'https://ops.example.com/smdr',
      authToken: 'token-123',
      secret: 'secret-456',
      timeoutSeconds: 20,
      eventTypes: ['CALL_END', 'CALL_START'],
    });
  });

  it('hydrates defaults from stored SMDR settings', () => {
    expect(hydrateSmdrFormFields({
      enabled: true,
      endpointUrl: 'https://ops.example.com/smdr',
      authToken: 'token-123',
      secret: 'secret-456',
      timeoutSeconds: 12,
      eventTypes: ['CALL_END'],
    })).toEqual({
      smdrEnabled: true,
      smdrEndpointUrl: 'https://ops.example.com/smdr',
      smdrAuthToken: 'token-123',
      smdrSecret: 'secret-456',
      smdrTimeoutSeconds: 12,
      smdrEventTypes: ['CALL_END'],
    });
  });
});
