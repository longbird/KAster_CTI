import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AttentionService } from './attention-service';

describe('AttentionService', () => {
  let windowMock: {
    isMinimized: ReturnType<typeof vi.fn>;
    restore: ReturnType<typeof vi.fn>;
    show: ReturnType<typeof vi.fn>;
    focus: ReturnType<typeof vi.fn>;
  };
  let notificationShow: ReturnType<typeof vi.fn>;
  let notificationOn: ReturnType<typeof vi.fn>;
  let NotificationCtor: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    windowMock = {
      isMinimized: vi.fn(() => false),
      restore: vi.fn(),
      show: vi.fn(),
      focus: vi.fn(),
    };
    notificationShow = vi.fn();
    notificationOn = vi.fn();
    NotificationCtor = vi.fn().mockImplementation(() => ({
      show: notificationShow,
      on: notificationOn,
    }));
  });

  it('notifyIncomingCall 은 OS notification 을 띄우고 클릭 시 창 포커스를 연결한다', () => {
    const service = new AttentionService({
      getWindow: () => windowMock,
      NotificationCtor,
    });

    service.notifyIncomingCall({
      title: '착신 전화',
      body: '고객A / sip:customer-a@pbx.example.com',
    });

    expect(NotificationCtor).toHaveBeenCalledWith({
      title: '착신 전화',
      body: '고객A / sip:customer-a@pbx.example.com',
    });
    expect(notificationShow).toHaveBeenCalled();
    expect(notificationOn).toHaveBeenCalledWith('click', expect.any(Function));

    const clickHandler = notificationOn.mock.calls[0]?.[1] as (() => void) | undefined;
    clickHandler?.();

    expect(windowMock.show).toHaveBeenCalled();
    expect(windowMock.focus).toHaveBeenCalled();
  });

  it('focusWindow 는 최소화된 창이면 restore 후 focus 한다', () => {
    windowMock.isMinimized.mockReturnValue(true);
    const service = new AttentionService({
      getWindow: () => windowMock,
      NotificationCtor,
    });

    service.focusWindow();

    expect(windowMock.restore).toHaveBeenCalled();
    expect(windowMock.show).toHaveBeenCalled();
    expect(windowMock.focus).toHaveBeenCalled();
  });
});
