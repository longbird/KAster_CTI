using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using System.Windows;
using System.Windows.Interop;

namespace KAster.Desktop.App.Services;

/// <summary>
/// 전역 핫키. 창이 뒤에 있어도 받기·끊기가 먹어야 한다 — 상담원은 상담 내용을 다른 프로그램에
/// 적으면서 전화를 받는다.
///
/// <b>판정은 하지 않는다.</b> 무엇을 등록할지는 <see cref="HotkeyPlan"/> 이 정하고, 여기서는
/// 그것을 윈도우에 넘기고 <b>거부당한 것을 돌려주는</b> 일만 한다. 조용히 삼키면 상담원은
/// 안 먹는 핫키를 계속 누른다.
/// </summary>
[SupportedOSPlatform("windows")]
public sealed class GlobalHotkeyService : IDisposable
{
    private const int WmHotkey = 0x0312;

    private readonly IntPtr _handle;
    private readonly HwndSource? _source;
    private readonly Dictionary<int, HotkeyAction> _registered = new();

    private int _nextId = 1;

    public GlobalHotkeyService(Window window)
    {
        _handle = new WindowInteropHelper(window).Handle;
        _source = HwndSource.FromHwnd(_handle);
        if (_source is not null) _source.AddHook(OnWindowMessage);
    }

    /// <summary>핫키가 눌렸다. 무엇을 할지는 조립 지점이 정한다.</summary>
    public event EventHandler<HotkeyAction>? Pressed;

    /// <summary>
    /// 계획을 그대로 등록한다. 앞서 등록한 것은 먼저 내린다 — 설정을 바꿔 다시 부를 때
    /// 옛 조합이 남아 있으면 새 조합과 겹쳐 어느 쪽이 먹는지 알 수 없다.
    /// </summary>
    /// <returns>상담원에게 말해야 하는 실패. 비어 있으면 전부 등록됐다.</returns>
    public IReadOnlyList<string> Apply(IReadOnlyList<HotkeyAssignment> plan)
    {
        Clear();

        var failures = new List<string>();

        foreach (var assignment in plan)
        {
            // 상담원이 비워 둔 것은 실패가 아니다. 읽을 수 없는 것만 계획이 이유를 붙여 온다.
            if (assignment.Binding is null)
            {
                if (assignment.Error is not null) failures.Add(assignment.Error);
                continue;
            }

            var id = _nextId++;
            if (RegisterHotKey(_handle, id, (uint)assignment.Binding.Modifiers, assignment.Binding.VirtualKey))
            {
                _registered[id] = assignment.Action;
            }
            else
            {
                failures.Add(HotkeyNotice.Refused(assignment));
            }
        }

        return failures;
    }

    /// <summary>등록한 것을 전부 내린다. 로그아웃하면 누를 통화가 없다.</summary>
    public void Clear()
    {
        foreach (var id in _registered.Keys) UnregisterHotKey(_handle, id);
        _registered.Clear();
    }

    private IntPtr OnWindowMessage(IntPtr hwnd, int message, IntPtr wParam, IntPtr lParam, ref bool handled)
    {
        if (message != WmHotkey || !_registered.TryGetValue(wParam.ToInt32(), out var action)) return IntPtr.Zero;

        handled = true;
        Pressed?.Invoke(this, action);
        return IntPtr.Zero;
    }

    public void Dispose()
    {
        Clear();
        _source?.RemoveHook(OnWindowMessage);
    }

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool RegisterHotKey(IntPtr hwnd, int id, uint modifiers, uint virtualKey);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool UnregisterHotKey(IntPtr hwnd, int id);
}
