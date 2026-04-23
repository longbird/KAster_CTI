import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  createDesktopHandoff: vi.fn(),
  logout: vi.fn(),
  ensureDesktopAgentReady: vi.fn(),
  buildDesktopConnectUrl: vi.fn(),
  launchDesktopProtocol: vi.fn(),
  waitForDesktopHandoff: vi.fn(),
  deriveCenterServerUrl: vi.fn(),
}));

vi.mock('../api', () => ({
  login: mocks.login,
  createDesktopHandoff: mocks.createDesktopHandoff,
  logout: mocks.logout,
}));

vi.mock('../config', () => ({
  API_BASE_URL: 'http://center.example.com/api/v1',
}));

vi.mock('../utils/desktopBridge', () => ({
  ensureDesktopAgentReady: mocks.ensureDesktopAgentReady,
  buildDesktopConnectUrl: mocks.buildDesktopConnectUrl,
  launchDesktopProtocol: mocks.launchDesktopProtocol,
  waitForDesktopHandoff: mocks.waitForDesktopHandoff,
  deriveCenterServerUrl: mocks.deriveCenterServerUrl,
}));

import { LoginPage } from './LoginPage';

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureDesktopAgentReady.mockResolvedValue({ ready: true });
    mocks.deriveCenterServerUrl.mockReturnValue('http://center.example.com');
    mocks.createDesktopHandoff.mockResolvedValue({
      handoffToken: 'desktop-handoff-1',
      expiresIn: 60,
    });
    mocks.buildDesktopConnectUrl.mockReturnValue('kaster-agent://connect?...');
    mocks.waitForDesktopHandoff.mockResolvedValue({ connected: true });
    mocks.login.mockResolvedValue(undefined);
    mocks.logout.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
  });

  async function submitLogin() {
    fireEvent.change(screen.getByLabelText('로그인 ID'), {
      target: { value: 'agent1001' },
    });
    fireEvent.change(screen.getByLabelText('내선 번호'), {
      target: { value: '1001' },
    });
    fireEvent.change(screen.getByLabelText('비밀번호'), {
      target: { value: 'Password123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: '로그인' }));
  }

  it('softphone login waits for desktop handoff completion', async () => {
    render(<LoginPage />);

    await submitLogin();

    await waitFor(() => {
      expect(mocks.ensureDesktopAgentReady).toHaveBeenCalledOnce();
      expect(mocks.login).toHaveBeenCalledWith({
        loginId: 'agent1001',
        password: 'Password123!',
        extension: '1001',
        telephonyMode: 'softphone',
      });
      expect(mocks.createDesktopHandoff).toHaveBeenCalledOnce();
      expect(mocks.buildDesktopConnectUrl).toHaveBeenCalledWith({
        serverUrl: 'http://center.example.com',
        handoffToken: 'desktop-handoff-1',
        channel: 'stable',
      });
      expect(mocks.launchDesktopProtocol).toHaveBeenCalledWith('kaster-agent://connect?...');
      expect(mocks.waitForDesktopHandoff).toHaveBeenCalledWith('desktop-handoff-1');
    });
  });

  it('deskphone login bypasses desktop gate', async () => {
    render(<LoginPage />);

    fireEvent.click(screen.getByRole('radio', { name: 'SIP Phone 사용' }));
    await submitLogin();

    await waitFor(() => {
      expect(mocks.login).toHaveBeenCalledWith({
        loginId: 'agent1001',
        password: 'Password123!',
        extension: '1001',
        telephonyMode: 'deskphone',
      });
    });
    expect(mocks.ensureDesktopAgentReady).not.toHaveBeenCalled();
    expect(mocks.createDesktopHandoff).not.toHaveBeenCalled();
    expect(mocks.waitForDesktopHandoff).not.toHaveBeenCalled();
  });

  it('softphone handoff failure rolls back web login and shows an error', async () => {
    mocks.waitForDesktopHandoff.mockResolvedValue({
      connected: false,
      message: '데스크톱 연결에 실패했습니다.',
    });

    render(<LoginPage />);
    await submitLogin();

    await waitFor(() => {
      expect(mocks.logout).toHaveBeenCalledOnce();
      expect(screen.getByText('데스크톱 연결에 실패했습니다.')).toBeInTheDocument();
    });
  });
});
