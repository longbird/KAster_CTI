// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { RingingAutoTimer } from './RingingAutoTimer';

describe('RingingAutoTimer', () => {
  it('does not render when inactive', () => {
    const { container } = render(
      <RingingAutoTimer active={false} totalSeconds={5} action="auto-answer" onTrigger={() => undefined} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('does not render when totalSeconds is 0', () => {
    const { container } = render(
      <RingingAutoTimer active={true} totalSeconds={0} action="auto-answer" onTrigger={() => undefined} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('triggers callback once when timer expires', () => {
    vi.useFakeTimers();
    try {
      const onTrigger = vi.fn();
      render(
        <RingingAutoTimer active={true} totalSeconds={1} action="auto-answer" onTrigger={onTrigger} />,
      );
      expect(screen.getByText('자동 응답')).toBeTruthy();

      act(() => {
        vi.advanceTimersByTime(1100);
      });

      expect(onTrigger).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('renders auto-reject label when action is auto-reject', () => {
    render(
      <RingingAutoTimer active={true} totalSeconds={3} action="auto-reject" onTrigger={() => undefined} />,
    );
    expect(screen.getByText('자동 거절')).toBeTruthy();
  });
});
