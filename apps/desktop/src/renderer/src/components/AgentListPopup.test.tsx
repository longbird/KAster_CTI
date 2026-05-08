// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentListPopup } from './AgentListPopup';

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, 'desktopApi');
  vi.restoreAllMocks();
});

const SAMPLE_DIRECTORY = [
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
    agentGroup: { agentGroupId: 'g-team-a', groupCode: 'TEAM_A', groupName: '1 팀' },
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
    agentGroup: { agentGroupId: 'g-team-b', groupCode: 'TEAM_B', groupName: '2 팀' },
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
    agentGroup: null,
  },
];

function installDesktopApi() {
  Object.defineProperty(window, 'desktopApi', {
    configurable: true,
    value: {
      getAgentDirectory: vi.fn(async () => SAMPLE_DIRECTORY),
    },
  });
}

describe('AgentListPopup', () => {
  it('상담원 상태를 한글 가용성 라벨로 표시한다', async () => {
    installDesktopApi();
    render(<AgentListPopup />);

    expect(await screen.findByText('1002 / 상담 가능')).toBeTruthy();
    expect(screen.getByText('1003 / 휴식')).toBeTruthy();
    expect(screen.getByText('1004 / 전화기 미등록')).toBeTruthy();
  });

  it('그룹별 섹션을 렌더하고 그룹 필터로 한 그룹만 남길 수 있다', async () => {
    installDesktopApi();
    render(<AgentListPopup />);

    // 초기 — 3개 그룹(1팀/2팀/미지정)
    expect(await screen.findByText('1 팀')).toBeTruthy();
    expect(screen.getByText('2 팀')).toBeTruthy();
    expect(screen.getByText('미지정')).toBeTruthy();

    // 그룹 셀렉트로 1팀만 남김
    fireEvent.change(screen.getByLabelText('그룹 선택'), { target: { value: 'g-team-a' } });
    expect(screen.getByText('1 팀')).toBeTruthy();
    expect(screen.queryByText('2 팀')).toBeNull();
    expect(screen.queryByText('미지정')).toBeNull();
    expect(screen.getByText('상담가능')).toBeTruthy();
    expect(screen.queryByText('휴식상담원')).toBeNull();
  });

  it('검색어가 그룹명에도 매칭된다', async () => {
    installDesktopApi();
    render(<AgentListPopup />);

    await screen.findByText('1 팀');
    fireEvent.change(screen.getByLabelText('상담원 검색'), { target: { value: '2 팀' } });

    expect(screen.queryByText('1 팀')).toBeNull();
    expect(screen.getByText('2 팀')).toBeTruthy();
    expect(screen.getByText('휴식상담원')).toBeTruthy();
  });
});
