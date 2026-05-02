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
  softphone: null,
  callerIds: ['15777893', '07052346380'],
  defaultCallerId: '15777893',
  agentDirectory: [
    {
      agentId: 'agent-2',
      agentName: '박지영',
      extension: '1002',
      role: 'agent',
      isActive: true,
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

  it('changes agent status from the compact header selector', () => {
    render(<SoftphoneShell {...baseProps} />);

    fireEvent.change(screen.getByLabelText('상담원 상태'), {
      target: { value: 'BREAK' },
    });

    expect(baseProps.onChangeAgentStatus).toHaveBeenCalledWith('BREAK');
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
});
