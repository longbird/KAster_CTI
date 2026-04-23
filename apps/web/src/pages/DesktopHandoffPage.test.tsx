import { cleanup, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  exchangeWebHandoff: vi.fn(),
}));

vi.mock('../api', () => ({
  exchangeWebHandoff: mocks.exchangeWebHandoff,
}));

import { DesktopHandoffPage } from './DesktopHandoffPage';

describe('DesktopHandoffPage', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn> | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    window.history.pushState({}, '', '/desktop-handoff?token=web-token');
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation((...args) => {
      const [firstArg] = args;
      if (typeof firstArg === 'string' && firstArg.includes('Not implemented: navigation')) {
        return;
      }
    });
  });

  afterEach(() => {
    consoleErrorSpy?.mockRestore();
    consoleErrorSpy = null;
    cleanup();
  });

  it('exchanges the handoff token once even under StrictMode', async () => {
    mocks.exchangeWebHandoff.mockResolvedValue(undefined);

    render(
      <React.StrictMode>
        <DesktopHandoffPage />
      </React.StrictMode>,
    );

    await waitFor(() => {
      expect(mocks.exchangeWebHandoff).toHaveBeenCalledTimes(1);
      expect(mocks.exchangeWebHandoff).toHaveBeenCalledWith('web-token');
    });
  });

  it('shows an error when the token is missing', async () => {
    window.history.pushState({}, '', '/desktop-handoff');

    render(<DesktopHandoffPage />);

    await waitFor(() => {
      expect(screen.getByText('desktop handoff token 이 없습니다.')).toBeInTheDocument();
      expect(mocks.exchangeWebHandoff).not.toHaveBeenCalled();
    });
  });
});
