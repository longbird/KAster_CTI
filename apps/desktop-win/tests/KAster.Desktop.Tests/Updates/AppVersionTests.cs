using KAster.Desktop.Core.Updates;

namespace KAster.Desktop.Tests.Updates;

public class AppVersionTests
{
    [Theory]
    [InlineData("1.4.0", "1.3.9")]
    [InlineData("1.10.0", "1.4.0")]
    [InlineData("2.0.0", "1.99.99")]
    [InlineData("1.4.1", "1.4.0")]
    public void A_higher_version_wins(string higher, string lower)
    {
        Assert.True(AppVersion.IsNewer(higher, lower));
        Assert.False(AppVersion.IsNewer(lower, higher));
    }

    /// <summary>글자 비교로 하면 1.10.0 이 1.4.0 보다 <b>낮다</b>고 나온다. 자릿수로 비교해야 한다.</summary>
    [Fact]
    public void Ten_is_above_four_not_below_it()
    {
        Assert.Equal(1, AppVersion.Compare("1.10.0", "1.4.0"));
    }

    [Theory]
    [InlineData("1.4", "1.4.0")]
    [InlineData("1.4.0.0", "1.4.0")]
    [InlineData("1.4.0", "1.4.0")]
    public void Missing_places_count_as_zero(string left, string right)
    {
        Assert.Equal(0, AppVersion.Compare(left, right));
    }

    /// <summary>
    /// 우리 버전을 못 읽었는데 "새 버전이 있다" 고 말하면, 상담원은 있지도 않은 업데이트를
    /// 매번 확인하게 된다. 읽을 수 없으면 <b>비교하지 않는다</b>.
    /// </summary>
    [Theory]
    [InlineData(null, "1.4.0")]
    [InlineData("", "1.4.0")]
    [InlineData("   ", "1.4.0")]
    [InlineData("개발중", "1.4.0")]
    [InlineData("1.4.0", null)]
    [InlineData("1.4.0", "")]
    public void An_unreadable_version_is_never_newer(string? left, string? right)
    {
        Assert.Equal(0, AppVersion.Compare(left, right));
        Assert.False(AppVersion.IsNewer(left, right));
        Assert.False(AppVersion.IsNewer(right, left));
    }

    /// <summary>배포 꼬리표는 자릿수가 아니다. 앞의 숫자만 읽는다.</summary>
    [Fact]
    public void A_release_suffix_does_not_change_the_number()
    {
        Assert.Equal(0, AppVersion.Compare("1.4.0-beta.2", "1.4.0"));
    }
}
