import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TrayService } from './tray-service';

describe('TrayService', () => {
  let trayOn: ReturnType<typeof vi.fn>;
  let traySetToolTip: ReturnType<typeof vi.fn>;
  let traySetContextMenu: ReturnType<typeof vi.fn>;
  let TrayCtor: ReturnType<typeof vi.fn>;
  let buildFromTemplate: ReturnType<typeof vi.fn>;
  let windowOn: ReturnType<typeof vi.fn>;
  let windowMock: {
    on: ReturnType<typeof vi.fn>;
    hide: ReturnType<typeof vi.fn>;
    show: ReturnType<typeof vi.fn>;
    focus: ReturnType<typeof vi.fn>;
    isVisible: ReturnType<typeof vi.fn>;
    isMinimized: ReturnType<typeof vi.fn>;
    restore: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    trayOn = vi.fn();
    traySetToolTip = vi.fn();
    traySetContextMenu = vi.fn();
    TrayCtor = vi.fn().mockImplementation(() => ({
      on: trayOn,
      setToolTip: traySetToolTip,
      setContextMenu: traySetContextMenu,
    }));
    buildFromTemplate = vi.fn((template) => template);
    windowOn = vi.fn();
    windowMock = {
      on: windowOn,
      hide: vi.fn(),
      show: vi.fn(),
      focus: vi.fn(),
      isVisible: vi.fn(() => true),
      isMinimized: vi.fn(() => false),
      restore: vi.fn(),
    };
  });

  it('attach 는 minimize/close 이벤트에서 창을 숨기고 트레이를 만든다', () => {
    const service = new TrayService({
      TrayCtor,
      buildFromTemplate,
      icon: { stub: true },
      onQuitRequested: vi.fn(),
    });

    service.attach(windowMock);

    expect(TrayCtor).toHaveBeenCalledWith({ stub: true });
    expect(traySetToolTip).toHaveBeenCalledWith('KAster CTI Agent');
    expect(windowOn).toHaveBeenCalledTimes(2);

    const minimizeHandler = windowOn.mock.calls[0]?.[1] as ((event: { preventDefault: () => void }) => void) | undefined;
    const closeHandler = windowOn.mock.calls[1]?.[1] as ((event: { preventDefault: () => void }) => void) | undefined;
    const preventDefault = vi.fn();

    minimizeHandler?.({ preventDefault });
    closeHandler?.({ preventDefault });

    expect(preventDefault).toHaveBeenCalledTimes(2);
    expect(windowMock.hide).toHaveBeenCalledTimes(2);
  });

  it('트레이 클릭은 최소화된 창을 복구하고 포커스를 준다', () => {
    const service = new TrayService({
      TrayCtor,
      buildFromTemplate,
      icon: { stub: true },
      onQuitRequested: vi.fn(),
    });
    windowMock.isMinimized.mockReturnValue(true);

    service.attach(windowMock);

    const clickHandler = trayOn.mock.calls.find((call) => call[0] === 'click')?.[1] as (() => void) | undefined;
    clickHandler?.();

    expect(windowMock.restore).toHaveBeenCalled();
    expect(windowMock.show).toHaveBeenCalled();
    expect(windowMock.focus).toHaveBeenCalled();
  });

  it('컨텍스트 메뉴 종료 액션은 quit 콜백을 호출한다', () => {
    const onQuitRequested = vi.fn();
    const service = new TrayService({
      TrayCtor,
      buildFromTemplate,
      icon: { stub: true },
      onQuitRequested,
    });

    service.attach(windowMock);

    const template = buildFromTemplate.mock.calls[0]?.[0] as Array<{ label: string; click?: () => void }> | undefined;
    template?.find((item) => item.label === '종료')?.click?.();

    expect(onQuitRequested).toHaveBeenCalled();
  });
});
