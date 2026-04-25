// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UpdateBanner } from './UpdateBanner';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('UpdateBanner', () => {
  it('lets the agent hide the update notification', () => {
    const onDismiss = vi.fn();

    render(
      <UpdateBanner
        message="새 버전이 준비되어 있습니다."
        canApply
        statusText="지금 적용 가능"
        busy={false}
        readyFileName={null}
        onPrepare={vi.fn()}
        onApply={vi.fn()}
        onDismiss={onDismiss}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '업데이트 알림 숨기기' }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
