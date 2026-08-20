using System.Windows;

namespace KAster.Desktop.App.Services;

/// <summary>
/// 창 모양의 단일 진실원. 뷰모델은 <see cref="Request"/> 로 모드만 요청하고 창 크기를 직접 만지지 않는다.
///
/// 이렇게 나눠 두는 이유는, 통화 단계마다 창이 커지고 작아지는데 그 규칙이 여러 화면에 흩어지면
/// "왜 이 상황에서만 창이 안 줄어드나" 를 추적할 수 없기 때문이다.
/// </summary>
public sealed class WindowModeService
{
    private readonly Window _window;

    public WindowModeService(Window window) => _window = window;

    public WindowMode Current { get; private set; } = WindowMode.Idle;

    public event EventHandler<WindowMode>? ModeChanged;

    public void Request(WindowMode mode)
    {
        if (Current == mode) return;
        Current = mode;

        Apply(mode);
        ModeChanged?.Invoke(this, mode);
    }

    private void Apply(WindowMode mode)
    {
        var screen = CurrentWorkArea();
        var saved = _window.WindowState == WindowState.Normal
            ? new WindowPosition(_window.Left, _window.Top)
            : null;

        var shape = WindowBounds.For(mode, screen, saved);

        _window.MinWidth = shape.MinWidth;
        _window.MinHeight = shape.MinHeight;
        _window.Width = shape.Width;
        _window.Height = shape.Height;
        _window.Left = shape.Left;
        _window.Top = shape.Top;
    }

    private WorkArea CurrentWorkArea()
    {
        var area = SystemParameters.WorkArea;
        return new WorkArea(area.Left, area.Top, area.Width, area.Height);
    }
}
