using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using System.Windows;
using System.Windows.Interop;

namespace KAster.Desktop.App.Services;

/// <summary>
/// 창을 눈에 걸리게 하되 <b>초점은 뺏지 않는다</b>. 작업 표시줄 단추가 깜빡일 뿐이라,
/// 상담원이 다른 프로그램에 글을 쓰고 있어도 키 입력이 그쪽으로 계속 간다.
///
/// 창을 앞으로 끌어오는 <c>SetForegroundWindow</c> 는 쓰지 않는다 — 알림은 알리는 것이지
/// 뺏는 것이 아니다.
/// </summary>
[SupportedOSPlatform("windows")]
public static class WindowAttention
{
    private const uint FlashTray = 0x00000002;
    private const uint FlashTimerUntilForeground = 0x0000000C;

    /// <summary>깜빡일 횟수. 무한히 깜빡이게 두면 상담원이 창을 볼 때까지 화면 구석이 계속 움직인다.</summary>
    private const uint FlashCount = 6;

    public static void Flash(Window window)
    {
        var handle = new WindowInteropHelper(window).Handle;
        if (handle == IntPtr.Zero) return;

        var info = new FLASHWINFO
        {
            cbSize = (uint)Marshal.SizeOf<FLASHWINFO>(),
            hwnd = handle,
            dwFlags = FlashTray | FlashTimerUntilForeground,
            uCount = FlashCount,
            dwTimeout = 0,
        };

        FlashWindowEx(ref info);
    }

    /// <summary>상담원이 스스로 부른 경로에서만 쓴다. 최소화돼 있으면 되돌리고 앞으로 가져온다.</summary>
    public static void Restore(Window window)
    {
        if (window.WindowState == WindowState.Minimized) window.WindowState = WindowState.Normal;

        window.Show();
        window.Activate();
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct FLASHWINFO
    {
        public uint cbSize;
        public IntPtr hwnd;
        public uint dwFlags;
        public uint uCount;
        public uint dwTimeout;
    }

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool FlashWindowEx(ref FLASHWINFO info);
}
