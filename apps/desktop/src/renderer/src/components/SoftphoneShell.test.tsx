// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SoftphoneShell } from './SoftphoneShell';

const desktopApi = {
  setWindowMode: vi.fn().mockResolvedValue(undefined),
};

vi.stubGlobal('window', { desktopApi });

const baseProps = {
  config: {
    serverUrl: 'https://cti-center-a.example.com',
    channel: 'stable',
    deviceId: 'device-1',
  },
  agentName: '김민수',
  extension: '1001',
  agentStatus: 'AVAILABLE' as const,
  runtimeConnection: 'connected' as const,
  activeCall: null,
  audioPermission: 'unknown' as const,
  refreshingAudioDevices: false,
  audioPreferences: {
    inputDeviceId: null,
    outputDeviceId: null,
    ringDeviceId: null,
    echoCancellation: true,
    noiseSuppression: true,
  },
  audioDevices: {
    inputs: [{ deviceId: 'mic-1', label: 'USB Headset Mic' }],
    outputs: [{ deviceId: 'speaker-1', label: 'USB Headset Speaker' }],
  },
  audioCapabilities: {
    sinkSelectionSupported: true,
  },
  softphone: {
    registration: 'registered' as const,
    transport: 'connected' as const,
    config: {
      enabled: true,
      wsServer: 'wss://pbx.example.com/ws',
      sipUri: 'sip:1001@pbx.example.com',
      authorizationUsername: '1001',
      authorizationPassword: 'secret',
      displayName: '1001',
      iceServers: [],
    },
    lastError: null,
    diagnostics: [],
    session: null,
    remoteAudioActive: false,
    localMuted: false,
    localHold: false,
  },
  callerIds: ['15777893', '07052346380'],
  defaultCallerId: '15777893',
  agentDirectory: [
    {
      agentId: 'agent-2',
      agentName: '박지영',
      extension: '1002',
      role: 'agent',
      isActive: true,
      loginStatus: 'LOGGED_IN' as const,
      sipRegistration: {
        registered: true,
        registrationStatus: 'NonQual',
        contactUri: 'sip:1002@example.com',
        userAgent: 'test',
        roundtripUsec: null,
      },
      canCall: true,
      currentStatus: {
        statusCode: 'AVAILABLE' as const,
      },
    },
  ],
  onReconnectRuntime: vi.fn(),
  onPickup: vi.fn(),
  onOriginate: vi.fn(),
  onOriginateInternal: vi.fn(),
  onOpenCallHistoryPopup: vi.fn(),
  onOpenAgentListPopup: vi.fn(),
  onOpenDialpadPopup: vi.fn(),
  generalPreferences: {
    autoStart: false,
    autoLogin: true,
    alwaysOnTop: false,
    closeToTray: true,
    ringTonePresetId: 'classic' as const,
  },
  onChangeGeneralPreferences: vi.fn(),
  onMute: vi.fn(),
  onHangup: vi.fn(),
  onToggleHold: vi.fn(),
  onTransfer: vi.fn(),
  onCancelAttendedTransfer: vi.fn(),
  onCompleteAttendedTransfer: vi.fn(),
  onRefreshAudioDevices: vi.fn(),
  onRequestAudioPermission: vi.fn(),
  onChangeAudioPreferences: vi.fn(),
  onPlayOutputPreview: vi.fn(),
  onPlayRingPreview: vi.fn(),
  onStartSoftphone: vi.fn(),
  onStopSoftphone: vi.fn(),
  onAnswerSoftphoneCall: vi.fn(),
  onRejectSoftphoneCall: vi.fn(),
  onHangupSoftphoneCall: vi.fn(),
  onChangeAgentStatus: vi.fn(),
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SoftphoneShell', () => {
  it('대기 상태에서는 외부 발신과 내선 통화만 표시한다', () => {
    render(<SoftphoneShell {...baseProps} />);

    expect(screen.getByText('김민수')).toBeTruthy();
    expect(screen.getByText('대기 중')).toBeTruthy();
    expect(screen.getByText('외부 발신')).toBeTruthy();
    expect(screen.getByText('내선 통화')).toBeTruthy();
    expect(screen.getByLabelText('상담원 상태')).toBeTruthy();
    expect(screen.getByLabelText('상담원 상태').querySelectorAll('option')).toHaveLength(6);

    expect(screen.queryByText('전환')).toBeNull();
    expect(screen.queryByText('오디오 장치')).toBeNull();
    expect(desktopApi.setWindowMode).toHaveBeenCalledWith('idle');
  });

  it('설정 화면에만 오디오와 진단 제어를 표시한다', () => {
    render(<SoftphoneShell {...baseProps} />);

    fireEvent.click(screen.getByRole('button', { name: '설정' }));

    expect(screen.getByText('오디오')).toBeTruthy();
    expect(screen.getByLabelText('마이크')).toBeTruthy();
    expect(screen.getByRole('button', { name: '새로고침' })).toBeTruthy();

    expect(screen.getByRole('button', { name: '보기' })).toBeTruthy();
    expect(screen.queryByText('Runtime 재연결')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '보기' }));

    expect(screen.getByRole('button', { name: 'Runtime 재연결' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Softphone 등록' })).toBeTruthy();
    expect(desktopApi.setWindowMode).toHaveBeenCalledWith('settings');
  });

  it('changes agent status without reason for AVAILABLE', () => {
    render(<SoftphoneShell {...baseProps} />);

    fireEvent.change(screen.getByLabelText('상담원 상태'), {
      target: { value: 'AVAILABLE' },
    });

    expect(baseProps.onChangeAgentStatus).toHaveBeenCalledWith('AVAILABLE');
  });

  it('opens reason modal for BREAK and forwards reasonCode on confirm', () => {
    render(<SoftphoneShell {...baseProps} />);

    fireEvent.change(screen.getByLabelText('상담원 상태'), {
      target: { value: 'BREAK' },
    });

    // 모달이 열리고 콜백은 아직 호출되지 않음
    expect(baseProps.onChangeAgentStatus).not.toHaveBeenCalled();
    const textarea = screen.getByPlaceholderText('예: 점심, 휴식, 교육 등') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '커피' } });
    fireEvent.click(screen.getByRole('button', { name: '변경' }));

    expect(baseProps.onChangeAgentStatus).toHaveBeenCalledWith('BREAK', '커피');
  });

  it('통화 중일 때만 전환 기능을 표시한다', () => {
    render(
      <SoftphoneShell
        {...baseProps}
        activeCall={{
          callId: 'call-1',
          linkedid: 'linked-1',
          ani: '01012345678',
          dnis: '15777893',
          queueName: '대표',
          sessionStatus: 'TALKING',
          startedAt: '2026-05-02T12:00:00.000Z',
          answeredAt: '2026-05-02T12:00:05.000Z',
        }}
      />,
    );

    expect(screen.getByText('01012345678')).toBeTruthy();
    expect(screen.getByRole('heading', { name: '전환' })).toBeTruthy();
    expect(screen.queryByText('외부 발신')).toBeNull();
    expect(desktopApi.setWindowMode).toHaveBeenCalledWith('talking');
  });

  it('softphone 세션이 있으면 종료 제어는 서버 hangup 대신 softphone hangup 을 호출한다', () => {
    render(
      <SoftphoneShell
        {...baseProps}
        activeCall={{
          callId: 'server-call-1',
          linkedid: 'linked-1',
          ani: '01012345678',
          dnis: '07052346380',
          queueName: '직접 발신',
          sessionStatus: 'TALKING',
          startedAt: '2026-05-02T12:00:00.000Z',
          answeredAt: '2026-05-02T12:00:05.000Z',
        }}
        softphone={{
          ...baseProps.softphone,
          session: {
            id: 'sip-session-1',
            direction: 'outgoing',
            phase: 'active',
            remoteDisplayName: '01034623453',
            remoteUri: 'sip:01034623453@pbx.example.com',
          },
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '종료' }));

    expect(baseProps.onHangupSoftphoneCall).toHaveBeenCalled();
    expect(baseProps.onHangup).not.toHaveBeenCalled();
  });

  it('등록된 발신번호를 선택해 외부 발신한다', () => {
    render(<SoftphoneShell {...baseProps} />);

    fireEvent.change(screen.getByLabelText('외부 발신 번호'), {
      target: { value: '01012345678' },
    });
    fireEvent.change(screen.getByLabelText('발신번호'), {
      target: { value: '07052346380' },
    });
    fireEvent.click(screen.getByRole('button', { name: '발신' }));

    expect(baseProps.onOriginate).toHaveBeenCalledWith('01012345678', '07052346380');
  });

  it('내선 상담원 클릭 후 확인 팝업에서 연결한다', async () => {
    render(<SoftphoneShell {...baseProps} />);

    fireEvent.click(screen.getByRole('button', { name: /박지영/ }));

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('박지영 1002 연결을 시작할까요?')).toBeTruthy();
    expect(baseProps.onOriginateInternal).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '연결' }));

    expect(baseProps.onOriginateInternal).toHaveBeenCalledWith(baseProps.agentDirectory[0]);
  });

  it('내선 통화 상담원 상태를 통화 가능 여부 중심의 한글 값으로 표시한다', () => {
    render(
      <SoftphoneShell
        {...baseProps}
        agentDirectory={[
          {
            ...baseProps.agentDirectory[0],
            agentId: 'available-agent',
            agentName: '상담가능',
            extension: '1002',
            currentStatus: null,
          },
          {
            ...baseProps.agentDirectory[0],
            agentId: 'break-agent',
            agentName: '휴식상담원',
            extension: '1003',
            currentStatus: { statusCode: 'BREAK' },
          },
          {
            ...baseProps.agentDirectory[0],
            agentId: 'work-agent',
            agentName: '업무상담원',
            extension: '1004',
            currentStatus: { statusCode: 'AFTER_CALL_WORK' },
          },
          {
            ...baseProps.agentDirectory[0],
            agentId: 'logout-agent',
            agentName: '로그아웃상담원',
            extension: '1005',
            loginStatus: 'LOGGED_OUT',
            currentStatus: { statusCode: 'AVAILABLE' },
          },
          {
            ...baseProps.agentDirectory[0],
            agentId: 'phone-agent',
            agentName: '전화기상담원',
            extension: '1006',
            sipRegistration: {
              registered: false,
              registrationStatus: 'UNKNOWN',
              contactUri: null,
              userAgent: null,
              roundtripUsec: null,
            },
            currentStatus: { statusCode: 'AVAILABLE' },
          },
        ]}
      />,
    );

    expect(screen.getByText('1002 / 상담 가능')).toBeTruthy();
    expect(screen.getByText('1003 / 휴식')).toBeTruthy();
    expect(screen.getByText('1004 / 업무처리')).toBeTruthy();
    expect(screen.getByText('1005 / 로그아웃')).toBeTruthy();
    expect(screen.getByText('1006 / 전화기 미등록')).toBeTruthy();
    expect(screen.queryByText(/SIP 미등록/)).toBeNull();
    expect(screen.queryByText(/AVAILABLE/)).toBeNull();
    expect(screen.queryByText(/상태 없음/)).toBeNull();
  });
});
