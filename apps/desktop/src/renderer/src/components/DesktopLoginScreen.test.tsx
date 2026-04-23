// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesktopLoginScreen } from './DesktopLoginScreen';

afterEach(() => {
  cleanup();
});

describe('DesktopLoginScreen', () => {
  it('submits login credentials', () => {
    const onSubmit = vi.fn();

    render(
      <DesktopLoginScreen
        busy={false}
        serverUrl=""
        serverUrlRequired
        onSubmit={onSubmit}
        onTogglePairing={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('서버 URL'), {
      target: { value: 'https://cti-center-a.example.com' },
    });
    fireEvent.change(screen.getByLabelText('로그인 ID'), {
      target: { value: 'agent1001' },
    });
    fireEvent.change(screen.getByLabelText('내선'), {
      target: { value: '1001' },
    });
    fireEvent.change(screen.getByLabelText('비밀번호'), {
      target: { value: 'Password123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: '로그인' }));

    expect(onSubmit).toHaveBeenCalledWith({
      serverUrl: 'https://cti-center-a.example.com',
      loginId: 'agent1001',
      extension: '1001',
      password: 'Password123!',
    });
  });

  it('shows serverUrl when config is missing', () => {
    render(
      <DesktopLoginScreen
        busy={false}
        serverUrl=""
        serverUrlRequired
        onSubmit={vi.fn()}
        onTogglePairing={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('서버 URL')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '고급 옵션' })).toBeNull();
  });

  it('hides serverUrl behind advanced options when config exists', () => {
    render(
      <DesktopLoginScreen
        busy={false}
        serverUrl="https://cti-center-a.example.com"
        serverUrlRequired={false}
        onSubmit={vi.fn()}
        onTogglePairing={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText('서버 URL')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '고급 옵션' }));

    expect(screen.getByLabelText('서버 URL')).toBeTruthy();
    expect(screen.getByDisplayValue('https://cti-center-a.example.com')).toBeTruthy();
  });
});
