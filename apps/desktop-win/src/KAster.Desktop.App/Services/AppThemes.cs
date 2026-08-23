using Microsoft.Win32;

namespace KAster.Desktop.App.Services;

/// <summary>상담원이 고르는 값.</summary>
public enum AppTheme
{
    /// <summary>윈도우가 쓰는 것을 따라간다.</summary>
    System,
    Light,
    Dark,
}

/// <summary>실제로 얹을 색 사전. <see cref="AppTheme.System"/> 이 여기까지 내려오면 안 된다.</summary>
public enum ThemePalette
{
    Light,
    Dark,
}

/// <summary>
/// 어떤 색 사전을 얹을지 정한다. <b>순수 판정이다</b> — 사전 교체는 창이 한다.
/// </summary>
public static class AppThemes
{
    private const string PersonalizeKey =
        @"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize";

    public static ThemePalette Resolve(AppTheme chosen, bool windowsUsesLight) => chosen switch
    {
        AppTheme.Light => ThemePalette.Light,
        AppTheme.Dark => ThemePalette.Dark,
        _ => windowsUsesLight ? ThemePalette.Light : ThemePalette.Dark,
    };

    /// <summary>
    /// 윈도우가 앱에 밝은 테마를 쓰는가. 못 읽으면 밝은 쪽으로 본다 —
    /// 윈도우 기본값이 밝은 테마이고, 잘못 짚었을 때 눈이 덜 놀란다.
    /// </summary>
    public static bool WindowsUsesLight()
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(PersonalizeKey);
            return key?.GetValue("AppsUseLightTheme") is not int value || value != 0;
        }
        catch (Exception)
        {
            return true;
        }
    }

    /// <summary>
    /// 사전 위치. <see cref="System.Windows.Application.LoadComponent(System.Uri)"/> 에 넘길 상대 경로다.
    ///
    /// <c>new ResourceDictionary { Source = 이 값 }</c> 으로 쓰면 안 된다 — WPF 가 그것을 웹 주소로
    /// 읽으려다 실패하고 사전이 비어 온다. 화면은 색을 DynamicResource 로 물고 있으므로
    /// <b>예외도 로그도 없이 창이 검게 뜬다.</b>
    ///
    /// 두 파일은 키가 정확히 같아야 한다.
    /// </summary>
    public static string SourceOf(ThemePalette palette) => palette == ThemePalette.Dark
        ? "Themes/Palette.Dark.xaml"
        : "Themes/Palette.Light.xaml";
}
