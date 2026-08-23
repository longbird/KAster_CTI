using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using System.Windows;
using System.Windows.Media;
using Drawing = System.Drawing;

namespace KAster.Desktop.App.Services;

/// <summary>
/// 트레이 아이콘 그림. 상태마다 색만 다른 원 하나다 — 16px 안에서 알아볼 수 있는 것은 색뿐이고,
/// 무엇이 문제인지는 툴팁이 말한다.
///
/// 색은 <c>Tokens.xaml</c> 에서 온다. 여기에 색상 리터럴을 적으면 테마를 고쳐도 트레이만 옛 색으로 남는다.
/// </summary>
[SupportedOSPlatform("windows")]
public sealed class TrayIconArt : IDisposable
{
    /// <summary>토큰을 못 찾았을 때 쓸 색. 아이콘이 아예 안 보이는 것보다 낫다.</summary>
    private static readonly Drawing.Color Fallback = Drawing.Color.Gray;

    private readonly Func<string, Color?> _themeColor;
    /// <summary>상태와 깜빡임 프레임의 짝마다 하나. 매 틱 새로 그리면 GDI 핸들이 계속 늘어난다.</summary>
    private readonly Dictionary<(TrayStatus Status, bool Attention), Drawing.Icon> _cache = new();

    /// <param name="themeColor">
    /// 토큰 이름으로 색을 찾는다. 앱 리소스를 직접 읽지 않고 넘겨받는 이유는, 이 클래스가
    /// WPF 애플리케이션 없이도 서 있을 수 있어야 하기 때문이다.
    /// </param>
    public TrayIconArt(Func<string, Color?>? themeColor = null)
        => _themeColor = themeColor ?? FromApplicationResources;

    public Drawing.Icon For(TrayStatus status, bool attention = false)
    {
        var key = (status, attention);
        if (_cache.TryGetValue(key, out var cached)) return cached;

        var icon = Draw(Resolve(TrayPresentation.BrushKeyFor(status, attention)));
        _cache[key] = icon;
        return icon;
    }

    private Drawing.Color Resolve(string token)
    {
        var color = _themeColor(token);
        return color is null
            ? Fallback
            : Drawing.Color.FromArgb(color.Value.A, color.Value.R, color.Value.G, color.Value.B);
    }

    private static Color? FromApplicationResources(string token)
        => Application.Current?.TryFindResource(token) is SolidColorBrush brush ? brush.Color : null;

    /// <summary>
    /// 32px 로 그려서 윈도우가 줄이게 둔다. 16px 로 직접 그리면 고해상도 화면에서 뭉개진다.
    /// </summary>
    private static Drawing.Icon Draw(Drawing.Color fill)
    {
        using var bitmap = new Drawing.Bitmap(32, 32);
        using (var canvas = Drawing.Graphics.FromImage(bitmap))
        using (var brush = new Drawing.SolidBrush(fill))
        {
            canvas.SmoothingMode = Drawing.Drawing2D.SmoothingMode.AntiAlias;
            canvas.FillEllipse(brush, 2, 2, 28, 28);
        }

        // GetHicon 이 준 핸들은 Icon 이 소유하지 않는다. 복제해 두고 원본은 바로 돌려준다 —
        // 안 그러면 아이콘을 만들 때마다 GDI 핸들이 하나씩 샌다.
        var handle = bitmap.GetHicon();
        try
        {
            using var borrowed = Drawing.Icon.FromHandle(handle);
            return (Drawing.Icon)borrowed.Clone();
        }
        finally
        {
            DestroyIcon(handle);
        }
    }

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool DestroyIcon(IntPtr handle);

    /// <summary>
    /// 그려 둔 아이콘을 버린다. 테마가 바뀌면 색 토큰이 달라지므로 캐시가 옛 색을 들고 있다 —
    /// 안 버리면 화면만 밝아지고 트레이만 어두운 색으로 남는다.
    /// </summary>
    public void Invalidate()
    {
        foreach (var icon in _cache.Values) icon.Dispose();
        _cache.Clear();
    }

    public void Dispose() => Invalidate();
}
