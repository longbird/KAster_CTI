namespace KAster.Desktop.App.Services;

/// <summary>
/// 통화 단계별 창 모양. 값은 기존 Electron 앱(<c>apps/desktop/src/main/index.ts</c>)의 실측값을 그대로 쓴다.
/// </summary>
public enum WindowMode
{
    Idle,
    Ringing,
    Talking,
    Transferring,
    AfterCall,
    Settings,
}

/// <summary>모니터의 작업 영역. 작업 표시줄을 뺀 영역이고 보조 모니터는 원점이 0 이 아니다.</summary>
public sealed record WorkArea(double Left, double Top, double Width, double Height);

public sealed record WindowPosition(double Left, double Top);

public sealed record WindowShape(
    double Width,
    double Height,
    double MinWidth,
    double MinHeight,
    double Left,
    double Top);

/// <summary>
/// 창 크기와 위치를 계산한다. 순수 함수라 WPF 없이 테스트한다 — 실제 창에 값을 넣는 일은
/// <see cref="WindowModeService"/> 가 한다.
/// </summary>
public static class WindowBounds
{
    private sealed record Size(double Width, double Height, double MinWidth, double MinHeight);

    private static readonly Dictionary<WindowMode, Size> Sizes = new()
    {
        [WindowMode.Idle] = new Size(440, 560, 420, 520),
        [WindowMode.Ringing] = new Size(440, 420, 400, 380),
        [WindowMode.Talking] = new Size(460, 620, 420, 540),
        [WindowMode.Transferring] = new Size(500, 640, 440, 560),
        [WindowMode.AfterCall] = new Size(460, 520, 420, 460),
        [WindowMode.Settings] = new Size(560, 720, 500, 640),
    };

    public static WindowShape For(WindowMode mode, WorkArea screen, WindowPosition? saved)
    {
        // 모르는 모드가 들어와도 창이 사라지면 안 된다. 대기 모양으로 떨어뜨린다.
        var size = Sizes.TryGetValue(mode, out var found) ? found : Sizes[WindowMode.Idle];

        var (left, top) = saved is null
            ? Centre(screen, size)
            : Clamp(screen, size, saved);

        return new WindowShape(size.Width, size.Height, size.MinWidth, size.MinHeight, left, top);
    }

    private static (double Left, double Top) Centre(WorkArea screen, Size size) => (
        screen.Left + (screen.Width - size.Width) / 2,
        screen.Top + (screen.Height - size.Height) / 2);

    /// <summary>화면 밖으로 나간 창을 작업 영역 안으로 당긴다. 모니터를 뺐을 때 창을 잃어버리지 않게 한다.</summary>
    private static (double Left, double Top) Clamp(WorkArea screen, Size size, WindowPosition saved)
    {
        var maxLeft = screen.Left + screen.Width - size.Width;
        var maxTop = screen.Top + screen.Height - size.Height;

        // 작업 영역이 창보다 작으면 오른쪽 한계가 왼쪽 한계보다 앞선다. 이때는 왼쪽 위에 붙인다.
        var left = maxLeft < screen.Left ? screen.Left : Math.Clamp(saved.Left, screen.Left, maxLeft);
        var top = maxTop < screen.Top ? screen.Top : Math.Clamp(saved.Top, screen.Top, maxTop);

        return (left, top);
    }
}
