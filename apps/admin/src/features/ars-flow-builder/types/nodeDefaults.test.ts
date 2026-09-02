import { describe, expect, it } from 'vitest';
import { defaultConfigFor, describeNodeSummary, newNodeId } from './nodeDefaults';

describe('defaultConfigFor', () => {
  it('노드 타입마다 서버 파서가 받아들이는 기본값을 만든다', () => {
    expect(defaultConfigFor('PLAY')).toEqual({ promptKeys: [] });
    expect(defaultConfigFor('MENU')).toEqual({ promptKey: null, timeoutSeconds: 5, maxRetries: 2 });
    expect(defaultConfigFor('QUEUE')).toEqual({ queueName: '' });
    expect(defaultConfigFor('TRANSFER')).toEqual({ transferNumber: '' });
    expect(defaultConfigFor('SMS')).toEqual({ smsTemplateId: '' });
    expect(defaultConfigFor('OPT_OUT')).toEqual({ action: 'REGISTER' });
    expect(defaultConfigFor('HANGUP')).toEqual({ promptKey: null });
  });

  it('조건 분기는 시간 범위를 기본으로 한다', () => {
    expect(defaultConfigFor('CONDITION')).toEqual({
      conditionType: 'TIME_RANGE',
      timeStart: '09:00',
      timeEnd: '18:00',
      daysOfWeek: ['mon', 'tue', 'wed', 'thu', 'fri'],
    });
  });
});

describe('newNodeId', () => {
  // 서버 DTO 가 UUID 를 요구한다. 임의 문자열을 보내면 400 이다.
  it('UUID 를 만든다', () => {
    expect(newNodeId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('매번 다른 값이다', () => {
    expect(newNodeId()).not.toBe(newNodeId());
  });
});

describe('describeNodeSummary', () => {
  it('노드가 무엇을 하는지 한 줄로 말한다', () => {
    expect(describeNodeSummary('QUEUE', { queueName: 'sales' })).toBe('sales');
    expect(describeNodeSummary('TRANSFER', { transferNumber: '025551234' })).toBe('025551234');
    expect(describeNodeSummary('PLAY', { promptKeys: ['a', 'b'] })).toBe('a, b');
    expect(describeNodeSummary('MENU', { promptKey: 'menu', timeoutSeconds: 7 })).toBe('menu · 7초');
  });

  it('아직 정하지 않았으면 그렇게 말한다', () => {
    expect(describeNodeSummary('QUEUE', { queueName: '' })).toBe('미설정');
    expect(describeNodeSummary('PLAY', { promptKeys: [] })).toBe('미설정');
  });

  it('설정이 없는 노드는 빈 문자열', () => {
    expect(describeNodeSummary('HANGUP', { promptKey: null })).toBe('');
  });
});
