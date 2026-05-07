// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentListPopup } from './AgentListPopup';

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, 'desktopApi');
  vi.restoreAllMocks();
});

describe('AgentListPopup', () => {
  it('상담원 상태를 상담 가능 여부 중심의 한글 값으로 표시한다', async () => {
    Object.defineProperty(window, 'desktopApi', {
      configurable: true,
      value: {
        getAgentDirectory: vi.fn(async () => [
          {
            agentId: 'available-agent',
            agentName: '상담가능',
            extension: '1002',
            role: 'agent',
            isActive: true,
            loginStatus: 'LOGGED_IN',
            sipRegistration: {
              registered: true,
              registrationStatus: 'Reachable',
              contactUri: 'sip:1002@example.com',
              userAgent: 'test',
              roundtripUsec: null,
            },
            canCall: true,
            currentStatus: null,
          },
          {
            agentId: 'break-agent',
            agentName: '휴식상담원',
            extension: '1003',
            role: 'agent',
            isActive: true,
            loginStatus: 'LOGGED_IN',
            sipRegistration: {
              registered: true,
              registrationStatus: 'Reachable',
              contactUri: 'sip:1003@example.com',
              userAgent: 'test',
              roundtripUsec: null,
            },
            canCall: true,
            currentStatus: { statusCode: 'MEAL' },
          },
          {
            agentId: 'phone-agent',
            agentName: '전화기상담원',
            extension: '1004',
            role: 'agent',
            isActive: true,
            loginStatus: 'LOGGED_IN',
            sipRegistration: {
              registered: false,
              registrationStatus: 'UNKNOWN',
              contactUri: null,
              userAgent: null,
              roundtripUsec: null,
            },
            canCall: false,
            currentStatus: { statusCode: 'AVAILABLE' },
          },
        ]),
      },
    });

    render(<AgentListPopup />);

    expect(await screen.findByText('1002 / 상담 가능')).toBeTruthy();
    expect(screen.getByText('1003 / 휴식')).toBeTruthy();
    expect(screen.getByText('1004 / 전화기 미등록')).toBeTruthy();
    expect(screen.queryByText(/SIP 미등록/)).toBeNull();
    expect(screen.queryByText(/AVAILABLE/)).toBeNull();
    expect(screen.queryByText(/상태 없음/)).toBeNull();
  });
});
