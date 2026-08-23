using KAster.Desktop.App.Services;
using Xunit;

namespace KAster.Desktop.Tests.App;

/// <summary>
/// 어떤 색 사전을 얹을지. <b>순수 판정이다</b> — 실제 사전 교체는 창이 한다.
///
/// 기본은 "시스템 따름" 이다. 현장에 어두운 상담실과 밝은 사무실이 섞여 있고,
/// 어느 한쪽을 기본으로 못박으면 나머지 절반이 매번 설정을 고쳐야 한다.
/// </summary>
public class AppThemeTests
{
    [Fact]
    public void The_default_follows_windows()
    {
        Assert.Equal(AppTheme.System, new GeneralPreferences().Theme);
    }

    [Fact]
    public void Following_the_system_picks_what_windows_uses()
    {
        Assert.Equal(ThemePalette.Dark, AppThemes.Resolve(AppTheme.System, windowsUsesLight: false));
        Assert.Equal(ThemePalette.Light, AppThemes.Resolve(AppTheme.System, windowsUsesLight: true));
    }

    /// <summary>골라 둔 것은 윈도우가 무엇이든 그대로 간다.</summary>
    [Fact]
    public void A_chosen_theme_ignores_windows()
    {
        Assert.Equal(ThemePalette.Dark, AppThemes.Resolve(AppTheme.Dark, windowsUsesLight: true));
        Assert.Equal(ThemePalette.Light, AppThemes.Resolve(AppTheme.Light, windowsUsesLight: false));
    }

    /// <summary>파일을 손으로 고쳐 모르는 값이 들어와도 화면이 검은 사각형이 되면 안 된다.</summary>
    [Fact]
    public void An_unknown_setting_falls_back_to_following_the_system()
    {
        Assert.Equal(AppTheme.System, new GeneralPreferences { Theme = (AppTheme)99 }.Sane().Theme);
    }

    [Fact]
    public void Each_palette_knows_its_dictionary()
    {
        Assert.EndsWith("Palette.Light.xaml", AppThemes.SourceOf(ThemePalette.Light), StringComparison.Ordinal);
        Assert.EndsWith("Palette.Dark.xaml", AppThemes.SourceOf(ThemePalette.Dark), StringComparison.Ordinal);
    }
}
