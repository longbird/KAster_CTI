using KAster.Desktop.App.Services;

namespace KAster.Desktop.Tests.App;

/// <summary>
/// <c>kastercti://</c> 를 누르면 윈도우는 <b>앱을 한 벌 더 띄운다</b>. 그대로 두면 같은 내선으로
/// 소프트폰이 둘 등록되고, PBX 는 어느 쪽에 전화를 넘길지 알 수 없게 된다.
/// 그래서 두 번째 인스턴스는 주소만 넘기고 스스로 끝나야 한다.
/// </summary>
public class SingleInstanceTests
{
    /// <summary>
    /// 한 PC 에 상담원이 둘 앉는 자리가 있다 (<see cref="AppPaths.ProfileVariable"/>).
    /// 이름을 프로필로 가르지 않으면 두 번째 상담원의 앱이 첫 상담원의 앱에게 주소를 넘기고 꺼진다.
    /// </summary>
    [Fact]
    public void Each_profile_gets_its_own_name()
    {
        Assert.NotEqual(SingleInstanceNames.PipeFor(null), SingleInstanceNames.PipeFor("seat-b"));
        Assert.NotEqual(SingleInstanceNames.MutexFor(null), SingleInstanceNames.MutexFor("seat-b"));
        Assert.NotEqual(SingleInstanceNames.PipeFor("seat-a"), SingleInstanceNames.PipeFor("seat-b"));
    }

    [Fact]
    public void The_same_profile_always_gets_the_same_name()
    {
        Assert.Equal(SingleInstanceNames.PipeFor("seat-b"), SingleInstanceNames.PipeFor(" seat-b "));
        Assert.Equal(SingleInstanceNames.PipeFor(null), SingleInstanceNames.PipeFor("   "));
    }

    /// <summary>
    /// 프로필 이름은 사람이 명령줄에 적는 값이다. 파이프 이름에 못 쓰는 글자가 섞이면
    /// 파이프가 안 열리고, 그러면 인스턴스가 조용히 둘이 된다.
    /// </summary>
    [Theory]
    [InlineData("seat b")]
    [InlineData("seat/b")]
    [InlineData("seat\\b")]
    [InlineData("자리-2")]
    public void A_name_that_a_pipe_cannot_carry_is_made_safe(string profile)
    {
        var pipe = SingleInstanceNames.PipeFor(profile);

        Assert.DoesNotContain('\\', pipe);
        Assert.DoesNotContain(' ', pipe);
        Assert.All(pipe, c => Assert.True(char.IsAsciiLetterOrDigit(c) || c is '-' or '_' or '.'));
    }

    [Fact]
    public void The_launch_argument_that_is_a_protocol_request_is_picked_out()
    {
        Assert.Equal(
            "kastercti://connect?handoffToken=abc",
            ProtocolArguments.UrlFrom(new[] { "--squirrel-noop", "kastercti://connect?handoffToken=abc" }));
    }

    [Fact]
    public void A_launch_with_nothing_to_act_on_returns_nothing()
    {
        Assert.Null(ProtocolArguments.UrlFrom(Array.Empty<string>()));
        Assert.Null(ProtocolArguments.UrlFrom(new[] { "--debug", "C:\\some\\file.txt" }));
        Assert.Null(ProtocolArguments.UrlFrom(new[] { "http://pbx.local/connect" }));
    }
}
