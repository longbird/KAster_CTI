import { describe, expect, it } from 'vitest';
import { serverErrorMessage } from './serverError';

describe('serverErrorMessage', () => {
  it('서버가 준 메시지를 그대로 쓴다', () => {
    const error = { response: { data: { error: { message: '되돌릴 수 없는 기능은 끌 수 없습니다.' } } } };

    expect(serverErrorMessage(error, '실패')).toBe('되돌릴 수 없는 기능은 끌 수 없습니다.');
  });

  it('서버 메시지가 없으면 axios 메시지를 쓴다', () => {
    expect(serverErrorMessage({ message: 'Network Error' }, '실패')).toBe('Network Error');
  });

  it('서버 메시지가 비어 있으면 다음 후보로 넘어간다', () => {
    const error = { response: { data: { error: { message: '   ' } } }, message: 'Request failed' };

    expect(serverErrorMessage(error, '실패')).toBe('Request failed');
  });

  it('아무것도 없으면 기본 문구를 쓴다', () => {
    expect(serverErrorMessage(undefined, '저장하지 못했습니다.')).toBe('저장하지 못했습니다.');
    expect(serverErrorMessage(null, '저장하지 못했습니다.')).toBe('저장하지 못했습니다.');
    expect(serverErrorMessage({}, '저장하지 못했습니다.')).toBe('저장하지 못했습니다.');
  });

  it('메시지가 문자열이 아니면 무시한다', () => {
    const error = { response: { data: { error: { message: { code: 409 } } } } };

    expect(serverErrorMessage(error, '저장하지 못했습니다.')).toBe('저장하지 못했습니다.');
  });
});
