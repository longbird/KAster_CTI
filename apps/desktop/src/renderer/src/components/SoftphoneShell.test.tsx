// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SoftphoneShell } from './SoftphoneShell';

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
  onReconnectRuntime: vi.fn(),
  onPickup: vi.fn(),
  onOriginate: vi.fn(),
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
  it('shows the legacy-inspired compact agent console without technical diagnostics on the main screen', () => {
    render(<SoftphoneShell {...baseProps} />);

    expect(screen.getByText('맑은하늘')).toBeTruthy();
    expect(screen.getByText('김민수')).toBeTruthy();
    expect(screen.getByText('Ext. 1001')).toBeTruthy();
    expect(screen.getByText('진행 중인 통화 없음')).toBeTruthy();
    expect(screen.getByRole('button', { name: '설정' })).toBeTruthy();
    expect(screen.getByLabelText('상담원 상태')).toBeTruthy();
    expect(screen.getByLabelText('상담원 상태').querySelectorAll('option')).toHaveLength(6);
    expect(screen.getByRole('button', { name: '전화걸기' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '당겨받기' })).toBeTruthy();

    expect(screen.queryByText('Center URL')).toBeNull();
    expect(screen.queryByText('Device ID')).toBeNull();
    expect(screen.queryByText('Runtime')).toBeNull();
    expect(screen.queryByText('Softphone Runtime')).toBeNull();
    expect(screen.queryByText('오디오 장치')).toBeNull();
  });

  it('moves audio and diagnostic controls behind settings', () => {
    render(<SoftphoneShell {...baseProps} />);

    fireEvent.click(screen.getByRole('button', { name: '설정' }));

    expect(screen.getByText('설정')).toBeTruthy();
    expect(screen.getByText('오디오 장치')).toBeTruthy();
    expect(screen.getByLabelText('마이크')).toBeTruthy();
    expect(screen.getByRole('button', { name: '장치 새로고침' })).toBeTruthy();

    expect(screen.getByRole('button', { name: '진단 보기' })).toBeTruthy();
    expect(screen.queryByText('Runtime 재연결')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '진단 보기' }));

    expect(screen.getByRole('button', { name: 'Runtime 재연결' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Softphone 등록' })).toBeTruthy();
  });

  it('changes agent status from the compact header selector', () => {
    render(<SoftphoneShell {...baseProps} />);

    fireEvent.change(screen.getByLabelText('상담원 상태'), {
      target: { value: 'BREAK' },
    });

    expect(baseProps.onChangeAgentStatus).toHaveBeenCalledWith('BREAK');
  });

  it('opens call history with filters and an operational empty state', () => {
    render(<SoftphoneShell {...baseProps} />);

    fireEvent.click(screen.getByRole('button', { name: '통화내역' }));

    expect(screen.getByText('통화 내역')).toBeTruthy();
    expect(screen.getByLabelText('조회시작일')).toBeTruthy();
    expect(screen.getByLabelText('상담그룹')).toBeTruthy();
    expect(screen.getByText('표시할 통화이력이 없습니다.')).toBeTruthy();
    expect(screen.getByText('상태')).toBeTruthy();
    expect(screen.getByText('녹취')).toBeTruthy();
  });

  it('opens outbound dialing with caller-id and branch controls', () => {
    render(<SoftphoneShell {...baseProps} />);

    fireEvent.click(screen.getByRole('button', { name: '발신' }));

    expect(screen.getByText('CID 발신')).toBeTruthy();
    expect(screen.getByLabelText('수신전화번호')).toBeTruthy();
    expect(screen.getByLabelText('발신전화번호')).toBeTruthy();
    expect(screen.getByLabelText('지사명')).toBeTruthy();
    expect(screen.getByRole('button', { name: '전화 걸기' })).toBeTruthy();
  });

  it('shows legacy settings tabs while keeping audio controls behind settings', () => {
    render(<SoftphoneShell {...baseProps} />);

    fireEvent.click(screen.getByRole('button', { name: '설정' }));

    expect(screen.getByText('환경설정')).toBeTruthy();
    expect(screen.getByRole('button', { name: '통화' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '벨소리' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '일반' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '간편 호 전환' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '음성/코덱' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '녹취분석' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '음성/코덱' }));

    expect(screen.getByText('오디오 입/출력')).toBeTruthy();
    expect(screen.getByLabelText('마이크')).toBeTruthy();
    expect(screen.getByRole('button', { name: '장치 새로고침' })).toBeTruthy();
  });
});
