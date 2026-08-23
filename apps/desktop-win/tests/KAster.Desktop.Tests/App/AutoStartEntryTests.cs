using KAster.Desktop.App.Services;
using Xunit;

namespace KAster.Desktop.Tests.App;

/// <summary>
/// 윈도우 로그인 항목에 적을 값. 레지스트리를 건드리는 부분과 <b>무엇을 적을지</b>를 갈라
/// 두어야 테스트가 상담원 PC 의 시작 프로그램을 고치지 않는다.
/// </summary>
public class AutoStartEntryTests
{
    [Fact]
    public void The_path_is_quoted_so_spaces_do_not_split_it()
    {
        // "C:\Program Files\..." 처럼 공백이 든 경로가 기본이다. 안 감싸면 윈도우가 잘라 읽는다.
        Assert.Equal(
            @"""C:\Program Files\KAster\KAster.Desktop.App.exe""",
            AutoStartEntry.CommandFor(@"C:\Program Files\KAster\KAster.Desktop.App.exe"));
    }

    /// <summary>
    /// 한 PC 에 상담원을 둘 이상 띄울 때 자리를 나누는 값이다. 이것을 안 넘기면
    /// 자동 시작으로 뜬 앱이 기본 자리로 붙어 남의 토큰을 쓴다.
    /// </summary>
    [Fact]
    public void A_profile_is_carried_into_the_entry()
    {
        Assert.Equal(
            @"""C:pp.exe"" --profile ""agent1002""",
            AutoStartEntry.CommandFor(@"C:pp.exe", "agent1002"));
    }

    [Fact]
    public void A_blank_profile_is_left_out()
    {
        Assert.Equal(@"""C:pp.exe""", AutoStartEntry.CommandFor(@"C:pp.exe", "   "));
    }

    /// <summary>프로필 이름은 사람이 적는 값이다. 따옴표가 섞이면 명령이 갈라진다.</summary>
    [Fact]
    public void A_profile_with_a_quote_is_refused()
    {
        Assert.Equal(@"""C:pp.exe""", AutoStartEntry.CommandFor(@"C:pp.exe", @"a""b"));
    }

    /// <summary>자리마다 다른 이름으로 등록해야 한 PC 의 두 앱이 서로를 지우지 않는다.</summary>
    [Fact]
    public void Each_profile_gets_its_own_entry_name()
    {
        Assert.NotEqual(AutoStartEntry.NameFor(null), AutoStartEntry.NameFor("agent1002"));
        Assert.Equal(AutoStartEntry.NameFor(null), AutoStartEntry.NameFor("  "));
    }
}
