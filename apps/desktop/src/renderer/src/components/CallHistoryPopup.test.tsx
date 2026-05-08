// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CallHistoryPopup } from './CallHistoryPopup';

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, 'desktopApi');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('CallHistoryPopup', () => {
  it('상태와 통화시간을 운영 화면용 한글 형식으로 표시한다', async () => {
    Object.defineProperty(window, 'desktopApi', {
      configurable: true,
      value: {
        getCallHistory: vi.fn(async () => [
          {
            callId: 'call-1',
            ani: '<unknown>',
            dnis: 's',
            queueName: null,
            sessionStatus: 'ENDED',
            direction: 'OUTBOUND',
            startedAt: '2026-05-07T06:50:33.000Z',
            answeredAt: '2026-05-07T06:50:39.000Z',
            endedAt: '2026-05-07T06:50:55.000Z',
            talkSeconds: 16,
            primaryAgent: { agentName: '홍길동' },
            customer: null,
          },
        ]),
      },
    });

    render(<CallHistoryPopup />);

    expect(await screen.findByText('종료')).toBeTruthy();
    expect(screen.getByText('홍길동')).toBeTruthy();
    expect(screen.getByText('00:16')).toBeTruthy();
    expect(screen.getAllByText('-').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText('<unknown>')).toBeNull();
  });

  it('응답 시각이 없는 발신 내역도 시작/종료 시각으로 통화시간을 표시한다', async () => {
    Object.defineProperty(window, 'desktopApi', {
      configurable: true,
      value: {
        getCallHistory: vi.fn(async () => [
          {
            callId: 'outbound-call-without-answer',
            ani: '07052346380',
            dnis: '01034623453',
            queueName: null,
            sessionStatus: 'ENDED',
            direction: 'OUTBOUND',
            startedAt: '2026-05-07T06:50:33.000Z',
            answeredAt: null,
            endedAt: '2026-05-07T06:50:55.000Z',
            talkSeconds: 0,
            primaryAgent: { agentName: '홍길동' },
            customer: null,
          },
        ]),
      },
    });

    render(<CallHistoryPopup />);

    // answeredAt 없는 OUTBOUND 는 미연결 탭에서 보임
    fireEvent.click(await screen.findByRole('button', { name: /미연결/ }));
    expect(await screen.findByText('00:22')).toBeTruthy();
  });

  it('통화내역을 팝업에서 다시 갱신한다', async () => {
    const getCallHistory = vi
      .fn()
      .mockResolvedValueOnce([
        {
          callId: 'call-before-refresh',
          ani: '01011112222',
          dnis: '07052346380',
          queueName: null,
          sessionStatus: 'ENDED',
          direction: 'INBOUND',
          startedAt: '2026-05-07T06:50:33.000Z',
          answeredAt: '2026-05-07T06:50:39.000Z',
          endedAt: '2026-05-07T06:50:55.000Z',
          talkSeconds: 16,
          primaryAgent: { agentName: '홍길동' },
          customer: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          callId: 'call-after-refresh',
          ani: '01033334444',
          dnis: '07052346380',
          queueName: null,
          sessionStatus: 'ENDED',
          direction: 'INBOUND',
          startedAt: '2026-05-07T06:51:33.000Z',
          answeredAt: '2026-05-07T06:51:39.000Z',
          endedAt: '2026-05-07T06:51:55.000Z',
          talkSeconds: 16,
          primaryAgent: { agentName: '김상담' },
          customer: null,
        },
      ]);
    Object.defineProperty(window, 'desktopApi', {
      configurable: true,
      value: {
        getCallHistory,
      },
    });

    render(<CallHistoryPopup />);

    expect(await screen.findByText('홍길동')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '통화내역 새로고침' }));

    expect(await screen.findByText('김상담')).toBeTruthy();
    expect(screen.queryByText('홍길동')).toBeNull();
    expect(getCallHistory).toHaveBeenCalledTimes(2);
  });

  it('발신 통화는 수신번호 버튼으로만 재발신한다', async () => {
    const requestHistoryOriginate = vi.fn(async () => ({
      requestId: 'request-1',
      ok: true,
      message: '발신 요청 완료',
    }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    Object.defineProperty(window, 'desktopApi', {
      configurable: true,
      value: {
        getCallHistory: vi.fn(async () => [
          {
            callId: 'outbound-call',
            ani: '1001',
            dnis: '01034623453',
            queueName: null,
            sessionStatus: 'ENDED',
            direction: 'OUTBOUND',
            startedAt: '2026-05-07T06:50:33.000Z',
            answeredAt: '2026-05-07T06:50:39.000Z',
            endedAt: '2026-05-07T06:50:55.000Z',
            talkSeconds: 16,
            primaryAgent: { agentName: '홍길동' },
            customer: null,
          },
        ]),
        requestHistoryOriginate,
      },
    });

    render(<CallHistoryPopup />);

    expect(await screen.findByRole('button', { name: '수신번호 010-3462-3453 발신' })).toBeTruthy();
    expect(screen.getByText('010-3462-3453')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '발신번호 1001 발신' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '수신번호 010-3462-3453 발신' }));

    await waitFor(() => {
      expect(requestHistoryOriginate).toHaveBeenCalledWith({
        phoneNumber: '01034623453',
      });
    });
  });

  it('수신 통화는 발신번호 버튼으로만 재발신한다', async () => {
    const requestHistoryOriginate = vi.fn(async () => ({
      requestId: 'request-2',
      ok: true,
      message: '발신 요청 완료',
    }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    Object.defineProperty(window, 'desktopApi', {
      configurable: true,
      value: {
        getCallHistory: vi.fn(async () => [
          {
            callId: 'inbound-call',
            ani: '01040177893',
            dnis: '07052346380',
            queueName: null,
            sessionStatus: 'ENDED',
            direction: 'INBOUND',
            startedAt: '2026-05-07T06:50:33.000Z',
            answeredAt: '2026-05-07T06:50:39.000Z',
            endedAt: '2026-05-07T06:50:55.000Z',
            talkSeconds: 16,
            primaryAgent: { agentName: '홍길동' },
            customer: null,
          },
        ]),
        requestHistoryOriginate,
      },
    });

    render(<CallHistoryPopup />);

    expect(await screen.findByRole('button', { name: '발신번호 010-4017-7893 발신' })).toBeTruthy();
    expect(screen.getByText('070-5234-6380')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '수신번호 070-5234-6380 발신' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '발신번호 010-4017-7893 발신' }));

    await waitFor(() => {
      expect(requestHistoryOriginate).toHaveBeenCalledWith({
        phoneNumber: '01040177893',
      });
    });
  });
});
