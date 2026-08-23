using System.Windows;

namespace KAster.Desktop.App.Services;

/// <summary>
/// 색 사전을 갈아 끼운다.
///
/// <para>
/// 앱 리소스의 <b>맨 앞 사전</b>이 색이고(App.xaml), 그 자리를 통째로 바꾼다. 화면들은 색을
/// <c>DynamicResource</c> 로 물고 있어 다시 그리지 않아도 따라온다 — 그래서 통화 중에 테마를
/// 바꿔도 화면이 끊기지 않는다.
/// </para>
/// </summary>
public sealed class ThemeService
{
    /// <summary>App.xaml 이 정한 자리. 여기가 어긋나면 엉뚱한 사전을 갈아 끼운다.</summary>
    private const int PaletteSlot = 0;

    private readonly ResourceDictionary _resources;
    private readonly Func<ThemePalette, ResourceDictionary> _load;
    private readonly Func<bool> _windowsUsesLight;

    /// <param name="load">
    /// 사전을 읽어 온다. 기본은 WPF 의 <see cref="Application.LoadComponent(Uri)"/> 다 —
    /// <c>new ResourceDictionary { Source = ... }</c> 로 상대 경로를 주면 WPF 가 그것을 웹 주소로
    /// 읽으려다 실패하고, 사전이 비어 온다. 그러면 화면은 색을 못 찾아 <b>예외도 로그도 없이
    /// 검게 뜬다.</b>
    ///
    /// 이걸 밖에서 받는 이유는 <see cref="Application"/> 없이 서는 테스트 때문이다.
    /// </param>
    public ThemeService(
        ResourceDictionary resources,
        Func<ThemePalette, ResourceDictionary>? load = null,
        Func<bool>? windowsUsesLight = null)
    {
        _resources = resources;
        _load = load ?? LoadFromApplication;
        _windowsUsesLight = windowsUsesLight ?? AppThemes.WindowsUsesLight;
    }

    /// <summary>지금 얹혀 있는 것. 트레이처럼 색을 캐시해 둔 곳이 다시 그릴지 가리는 데 쓴다.</summary>
    public ThemePalette Current { get; private set; } = ThemePalette.Light;

    /// <summary>테마가 실제로 바뀌었다. 같은 것을 다시 얹었을 때는 오지 않는다.</summary>
    public event EventHandler<ThemePalette>? Changed;

    public void Apply(AppTheme chosen)
    {
        var palette = AppThemes.Resolve(chosen, _windowsUsesLight());
        var seated = _resources.MergedDictionaries.Count > PaletteSlot;
        if (palette == Current && seated) return;

        var next = _load(palette);

        if (seated) _resources.MergedDictionaries[PaletteSlot] = next;
        else _resources.MergedDictionaries.Insert(PaletteSlot, next);

        Current = palette;
        Changed?.Invoke(this, palette);
    }

    private static ResourceDictionary LoadFromApplication(ThemePalette palette)
        => (ResourceDictionary)Application.LoadComponent(
            new Uri(AppThemes.SourceOf(palette), UriKind.Relative));
}
