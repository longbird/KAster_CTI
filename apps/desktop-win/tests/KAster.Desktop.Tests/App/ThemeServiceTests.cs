using System.Windows;
using KAster.Desktop.App.Services;
using Xunit;

namespace KAster.Desktop.Tests.App;

/// <summary>
/// 사전 갈아 끼우기. 실제 파일을 읽는 부분은 WPF <c>Application</c> 이 있어야 하므로 밖에서 받고,
/// 여기서는 <b>어느 자리를 어떻게 바꾸는지</b>만 본다.
///
/// 자리를 잘못 잡으면 색 대신 글꼴·여백 사전을 날린다. 그러면 예외도 로그도 없이 화면이 무너진다.
/// </summary>
public class ThemeServiceTests
{
    private const string Colour = "BrushBackground";

    private static ResourceDictionary Palette(ThemePalette palette) => new()
    {
        [Colour] = palette.ToString(),
    };

    private static ResourceDictionary AppLike() => new()
    {
        MergedDictionaries =
        {
            Palette(ThemePalette.Light),
            new ResourceDictionary { ["FontUi"] = "Segoe UI", ["RadiusPanel"] = 8 },
        },
    };

    private static ThemeService Build(ResourceDictionary resources, bool windowsUsesLight = true)
        => new(resources, Palette, () => windowsUsesLight);

    [Fact]
    public void Applying_dark_puts_the_dark_palette_in_front()
    {
        var resources = AppLike();

        Build(resources).Apply(AppTheme.Dark);

        Assert.Equal("Dark", resources.MergedDictionaries[0][Colour]);
    }

    /// <summary>글꼴·크기·여백은 테마와 무관하다. 색 사전을 갈아 끼우다 같이 날리면 안 된다.</summary>
    [Fact]
    public void Swapping_the_palette_keeps_the_other_tokens()
    {
        var resources = AppLike();

        Build(resources).Apply(AppTheme.Dark);

        Assert.Equal(2, resources.MergedDictionaries.Count);
        Assert.Equal("Segoe UI", resources.MergedDictionaries[1]["FontUi"]);
    }

    [Fact]
    public void Going_back_to_light_restores_the_light_colours()
    {
        var resources = AppLike();
        var theme = Build(resources);

        theme.Apply(AppTheme.Dark);
        theme.Apply(AppTheme.Light);

        Assert.Equal(ThemePalette.Light, theme.Current);
        Assert.Equal("Light", resources.MergedDictionaries[0][Colour]);
    }

    /// <summary>바뀌지 않았으면 알리지 않는다. 트레이가 그림을 괜히 다시 그린다.</summary>
    [Fact]
    public void Applying_the_same_theme_again_says_nothing()
    {
        var resources = AppLike();
        var theme = Build(resources);
        theme.Apply(AppTheme.Dark);

        var told = 0;
        theme.Changed += (_, _) => told++;
        theme.Apply(AppTheme.Dark);

        Assert.Equal(0, told);
    }

    [Fact]
    public void Following_the_system_uses_what_windows_says()
    {
        var resources = AppLike();

        Build(resources, windowsUsesLight: false).Apply(AppTheme.System);

        Assert.Equal("Dark", resources.MergedDictionaries[0][Colour]);
    }
}
