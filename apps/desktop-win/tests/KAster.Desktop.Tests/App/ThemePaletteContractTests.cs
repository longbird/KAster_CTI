using System.IO;
using System.Text.RegularExpressions;
using Xunit;

namespace KAster.Desktop.Tests.App;

/// <summary>
/// 두 색 사전은 <b>키가 정확히 같아야 한다.</b> 한쪽에만 있는 키는 다른 테마에서 찾지 못하고,
/// WPF 는 그 자리를 조용히 비워 검은 사각형으로 남긴다. 예외도 로그도 없다.
///
/// 화면에서 색을 <c>StaticResource</c> 로 물면 시작할 때의 테마에 굳는다 — 설정에서 테마를
/// 바꿔도 그 자리만 옛 색으로 남는다. 그것도 여기서 막는다.
/// </summary>
public class ThemePaletteContractTests
{
    private static string AppDirectory()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            var candidate = Path.Combine(dir.FullName, "src", "KAster.Desktop.App");
            if (Directory.Exists(candidate)) return candidate;
            dir = dir.Parent;
        }

        throw new DirectoryNotFoundException("KAster.Desktop.App 을 찾지 못했다");
    }

    private static HashSet<string> KeysOf(string fileName)
    {
        var text = File.ReadAllText(Path.Combine(AppDirectory(), "Themes", fileName));
        return Regex.Matches(text, "<SolidColorBrush x:Key=\"([A-Za-z]+)\"")
            .Select(m => m.Groups[1].Value)
            .ToHashSet(StringComparer.Ordinal);
    }

    [Fact]
    public void Both_palettes_define_exactly_the_same_keys()
    {
        var light = KeysOf("Palette.Light.xaml");
        var dark = KeysOf("Palette.Dark.xaml");

        Assert.NotEmpty(light);
        Assert.Equal(light.OrderBy(k => k, StringComparer.Ordinal), dark.OrderBy(k => k, StringComparer.Ordinal));
    }

    /// <summary>색은 테마마다 달라야 한다. 같은 값이면 한쪽을 고치다 만 것이다.</summary>
    [Fact]
    public void The_two_palettes_actually_differ()
    {
        string ColorsOf(string file) =>
            File.ReadAllText(Path.Combine(AppDirectory(), "Themes", file));

        Assert.NotEqual(ColorsOf("Palette.Light.xaml"), ColorsOf("Palette.Dark.xaml"));
    }

    /// <summary>색 정의는 팔레트에만 둔다. Tokens 에 남으면 테마를 바꿔도 그 색은 안 바뀐다.</summary>
    [Fact]
    public void Tokens_holds_no_colours()
    {
        var tokens = File.ReadAllText(Path.Combine(AppDirectory(), "Themes", "Tokens.xaml"));

        Assert.DoesNotContain("<SolidColorBrush", tokens, StringComparison.Ordinal);
    }

    [Fact]
    public void No_screen_freezes_a_colour_with_StaticResource()
    {
        var offenders = Directory
            .EnumerateFiles(AppDirectory(), "*.xaml", SearchOption.AllDirectories)
            .Where(path => !path.Contains($"{Path.DirectorySeparatorChar}obj{Path.DirectorySeparatorChar}", StringComparison.Ordinal))
            .Where(path => !path.Contains($"{Path.DirectorySeparatorChar}bin{Path.DirectorySeparatorChar}", StringComparison.Ordinal))
            .Where(path => File.ReadAllText(path).Contains("StaticResource Brush", StringComparison.Ordinal))
            .Select(Path.GetFileName)
            .ToList();

        Assert.Empty(offenders);
    }
}
