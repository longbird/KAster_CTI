import { describe, expect, it } from 'vitest';
import { normalizeCenterConfig } from './center-config';

describe('normalizeCenterConfig', () => {
  it('공백이 포함된 서버 URL을 https 기준으로 정규화한다', () => {
    expect(
      normalizeCenterConfig({
        serverUrl: '  cti-center-a.example.com  ',
        channel: '',
      }),
    ).toEqual({
      serverUrl: 'https://cti-center-a.example.com',
      channel: 'stable',
    });
  });

  it('http 또는 https 스킴만 허용한다', () => {
    expect(() =>
      normalizeCenterConfig({
        serverUrl: 'ftp://cti-center-a.example.com',
        channel: 'pilot',
      }),
    ).toThrow('Center server URL must use http or https.');
  });
});
