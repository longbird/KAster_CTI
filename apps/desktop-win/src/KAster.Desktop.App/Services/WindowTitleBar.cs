using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using System.Windows;
using System.Windows.Interop;

namespace KAster.Desktop.App.Services;

/// <summary>
/// 창 제목 표시줄을 어둡게 만든다.
///
/// <para>
/// 어두운 화면 위에 흰 제목 표시줄이 남으면 그 줄만 눈에 박힌다. 표시줄을 직접 그리는 방법도
/// 있지만(<c>WindowChrome</c>) 그러면 최소화·최대화·닫기와 스냅 배치, 고대비 모드, 시스템 메뉴를
/// 전부 우리가 다시 만들어야 한다. 윈도우에게 <b>"이 창은 어두운 창"</b> 이라고 알려 주면
/// 그 모든 것을 그대로 둔 채 표시줄만 어두워진다.
/// </para>
///
/// <para>
/// 윈도우 10 1809 에서는 이 속성 번호가 19 였고 1903 부터 20 이다. 둘 다 시도한다 —
/// 안 되는 쪽은 그냥 실패를 돌려줄 뿐이라 해가 없다.
/// </para>
/// </summary>
[SupportedOSPlatform("windows")]
public static class WindowTitleBar
{
    private const int UseImmersiveDarkMode = 20;
    private const int UseImmersiveDarkModeBefore1903 = 19;

    /// <summary>
    /// 제목 표시줄 색을 테마에 맞춘다. 창 핸들이 아직 없으면 <b>생길 때 다시 부른다</b> —
    /// 여기서 그냥 돌아가면 로그인 화면이 뜰 때까지 표시줄만 하얗게 남는다.
    /// </summary>
    public static void Follow(Window window, ThemePalette palette)
    {
        var helper = new WindowInteropHelper(window);
        if (helper.Handle == IntPtr.Zero)
        {
            window.SourceInitialized += OnceReady;
            return;
        }

        Apply(helper.Handle, palette == ThemePalette.Dark);

        void OnceReady(object? sender, EventArgs e)
        {
            window.SourceInitialized -= OnceReady;
            Follow(window, palette);
        }
    }

    private static void Apply(IntPtr handle, bool dark)
    {
        var value = dark ? 1 : 0;

        if (DwmSetWindowAttribute(handle, UseImmersiveDarkMode, ref value, sizeof(int)) != 0)
        {
            DwmSetWindowAttribute(handle, UseImmersiveDarkModeBefore1903, ref value, sizeof(int));
        }

        // 이미 떠 있는 창은 알려 준 것만으로 다시 그리지 않는다. 테두리를 새로 잡게 해서
        // 그 자리에서 바뀌게 한다 — 안 하면 껐다 켜야 색이 바뀐다.
        SetWindowPos(handle, IntPtr.Zero, 0, 0, 0, 0, SwpNoMove | SwpNoSize | SwpNoZOrder | SwpFrameChanged);
    }

    private const uint SwpNoSize = 0x0001;
    private const uint SwpNoMove = 0x0002;
    private const uint SwpNoZOrder = 0x0004;
    private const uint SwpFrameChanged = 0x0020;

    [DllImport("dwmapi.dll")]
    private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetWindowPos(
        IntPtr hwnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
}
