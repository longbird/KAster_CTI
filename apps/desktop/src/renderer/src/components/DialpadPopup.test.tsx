// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DialpadPopup } from './DialpadPopup';

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, 'desktopApi');
  vi.restoreAllMocks();
});

function installDesktopApi(overrides: Partial<{
  callerIds: string[];
  defaultCallerId: string | null;
  requestHistoryOriginate: (input: { phoneNumber: string }) => Promise<{
    requestId: string;
    ok: boolean;
    message?: string;
  }>;
}> = {}) {
  const requestHistoryOriginate =
    overrides.requestHistoryOriginate ??
    vi.fn(async ({ phoneNumber }) => ({ requestId: 'r1', ok: true, message: `${phoneNumber} ok` }));
  Object.defineProperty(window, 'desktopApi', {
    configurable: true,
    value: {
      getCallerIds: vi.fn(async () => ({
        callerIds: overrides.callerIds ?? ['027001234'],
        defaultCallerId: overrides.defaultCallerId ?? '027001234',
      })),
      requestHistoryOriginate,
    },
  });
  return { requestHistoryOriginate };
}

describe('DialpadPopup', () => {
  it('키 버튼을 누르면 디스플레이에 누적되고 발신 시 IPC 로 번호를 보낸다', async () => {
    const { requestHistoryOriginate } = installDesktopApi();
    render(<DialpadPopup />);

    const display = (await screen.findByLabelText('발신 번호')) as HTMLInputElement;
    expect(display.value).toBe('');

    fireEvent.click(screen.getByLabelText('키 0'));
    fireEvent.click(screen.getByLabelText('키 1'));
    fireEvent.click(screen.getByLabelText('키 0'));
    expect(display.value).toBe('010');

    await act(async () => {
      fireEvent.click(screen.getByLabelText('발신'));
    });

    expect(requestHistoryOriginate).toHaveBeenCalledTimes(1);
    expect(requestHistoryOriginate).toHaveBeenCalledWith({ phoneNumber: '010' });
    // 성공 후 디스플레이는 비워진다
    expect((screen.getByLabelText('발신 번호') as HTMLInputElement).value).toBe('');
  });

  it('Backspace 와 C 버튼이 입력을 정리한다', async () => {
    installDesktopApi();
    render(<DialpadPopup />);

    fireEvent.click(await screen.findByLabelText('키 1'));
    fireEvent.click(screen.getByLabelText('키 2'));
    fireEvent.click(screen.getByLabelText('키 3'));
    expect((screen.getByLabelText('발신 번호') as HTMLInputElement).value).toBe('123');

    fireEvent.click(screen.getByLabelText('한 자리 지우기'));
    expect((screen.getByLabelText('발신 번호') as HTMLInputElement).value).toBe('12');

    fireEvent.click(screen.getByLabelText('모두 지우기'));
    expect((screen.getByLabelText('발신 번호') as HTMLInputElement).value).toBe('');
  });

  it('IPC 가 실패하면 에러 메시지를 보여준다', async () => {
    installDesktopApi({
      requestHistoryOriginate: vi.fn(async () => ({ requestId: 'r1', ok: false, message: '회선 없음' })),
    });
    render(<DialpadPopup />);

    fireEvent.click(await screen.findByLabelText('키 9'));
    await act(async () => {
      fireEvent.click(screen.getByLabelText('발신'));
    });

    expect(screen.getByText('회선 없음')).toBeTruthy();
    // 실패 시엔 입력값 유지
    expect((screen.getByLabelText('발신 번호') as HTMLInputElement).value).toBe('9');
  });
});
