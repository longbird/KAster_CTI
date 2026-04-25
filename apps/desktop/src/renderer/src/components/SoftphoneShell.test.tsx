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
  it('shows a compact agent console without technical diagnostics on the main screen', () => {
    render(<SoftphoneShell {...baseProps} />);

    expect(screen.getByText('김민수 (1001)')).toBeTruthy();
    expect(screen.getByText('진행 중인 통화 없음')).toBeTruthy();
    expect(screen.getByRole('button', { name: '설정' })).toBeTruthy();
    expect(screen.getByLabelText('상담원 상태')).toBeTruthy();
    expect(screen.getByLabelText('상담원 상태').querySelectorAll('option')).toHaveLength(6);

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
});
