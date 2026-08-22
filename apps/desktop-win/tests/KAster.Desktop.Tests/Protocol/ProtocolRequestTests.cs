using KAster.Desktop.Core.Protocol;

namespace KAster.Desktop.Tests.Protocol;

/// <summary>
/// 이 주소는 <b>외부 입력</b>이다. 브라우저 주소창에 아무나 칠 수 있고, 악성 웹페이지가
/// 링크로 걸 수도 있다. 파싱은 통과시킬 것을 정하는 방식이어야 한다.
/// </summary>
public class ProtocolRequestTests
{
    private const string Token = "3f2a9c1b4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f70";

    private static ProtocolRequest Parsed(string raw)
    {
        Assert.True(ProtocolRequest.TryParse(raw, out var request, out var error), error);
        return request!;
    }

    private static string Rejected(string? raw)
    {
        Assert.False(ProtocolRequest.TryParse(raw, out var request, out var error));
        Assert.Null(request);
        Assert.False(string.IsNullOrEmpty(error));
        return error!;
    }

    /// <summary>
    /// 두 스킴을 모두 받는다. 설계 문서는 <c>kastercti://</c> 라고 적고 있는데,
    /// <b>지금 웹앱이 실제로 내보내는 것은 <c>kaster-agent://</c></b>
    /// (<c>apps/web/src/utils/desktopBridge.ts</c>). 한쪽만 받으면 웹에서 넘긴 세션이
    /// 이 클라이언트에 영영 도착하지 않는다.
    /// </summary>
    [Theory]
    [InlineData("kastercti")]
    [InlineData("kaster-agent")]
    [InlineData("KASTERCTI")]
    public void Both_schemes_in_use_are_accepted(string scheme)
    {
        var request = Parsed($"{scheme}://connect?serverUrl=http://pbx.local:3000&handoffToken={Token}");

        Assert.Equal(Token, request.HandoffToken);
        Assert.Equal("http://pbx.local:3000", request.ServerUrl);
    }

    [Fact]
    public void The_channel_comes_through_when_it_is_given()
    {
        Assert.Equal(
            "beta",
            Parsed($"kastercti://connect?serverUrl=http://pbx.local:3000&handoffToken={Token}&channel=beta").Channel);
    }

    [Fact]
    public void No_channel_is_not_an_error()
    {
        Assert.Null(Parsed($"kastercti://connect?serverUrl=http://pbx.local:3000&handoffToken={Token}").Channel);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("not a url at all")]
    [InlineData("http://pbx.local/connect?handoffToken=abc")]
    [InlineData("file:///C:/windows/system32/calc.exe")]
    [InlineData("javascript:alert(1)")]
    public void Anything_that_is_not_our_scheme_is_refused(string? raw)
    {
        Rejected(raw);
    }

    /// <summary>모르는 길로 온 요청은 처리하지 않는다. 받아 줄 것만 받는다.</summary>
    [Theory]
    [InlineData("kastercti://disconnect?handoffToken=abc")]
    [InlineData("kastercti://")]
    public void An_unknown_route_is_refused(string raw)
    {
        Rejected(raw);
    }

    [Theory]
    [InlineData("kastercti://connect?serverUrl=http://pbx.local:3000")]
    [InlineData("kastercti://connect?serverUrl=http://pbx.local:3000&handoffToken=")]
    [InlineData("kastercti://connect?serverUrl=http://pbx.local:3000&handoffToken=%20%20")]
    public void A_request_without_a_token_is_refused(string raw)
    {
        Rejected(raw);
    }

    /// <summary>
    /// 토큰은 서버가 만든 16진수 48자다. 그 모양이 아닌 것을 그대로 서버에 보내면
    /// 우리가 남의 입력을 전달하는 통로가 된다.
    /// </summary>
    [Theory]
    [InlineData("kastercti://connect?handoffToken=abc%20def")]
    [InlineData("kastercti://connect?handoffToken=%3Cscript%3E")]
    [InlineData("kastercti://connect?handoffToken=..%2F..%2Fetc%2Fpasswd")]
    public void A_token_that_is_not_shaped_like_a_token_is_refused(string raw)
    {
        Rejected(raw);
    }

    [Fact]
    public void An_absurdly_long_token_is_refused()
    {
        Rejected("kastercti://connect?handoffToken=" + new string('a', 4096));
    }

    /// <summary>서버 주소가 http/https 가 아니면 우리가 붙을 곳이 아니다.</summary>
    [Theory]
    [InlineData("file://C:/x")]
    [InlineData("ftp://pbx.local")]
    [InlineData("어디로")]
    public void A_server_address_we_cannot_use_is_refused(string serverUrl)
    {
        Rejected($"kastercti://connect?serverUrl={Uri.EscapeDataString(serverUrl)}&handoffToken={Token}");
    }

    /// <summary>주소를 안 실어 보내도 된다. 어차피 이 PC 에 설정된 서버로만 간다.</summary>
    [Fact]
    public void A_request_without_a_server_address_is_still_readable()
    {
        Assert.Null(Parsed($"kastercti://connect?handoffToken={Token}").ServerUrl);
    }

    /// <summary>
    /// <b>여기가 이 파일에서 가장 중요한 검사다.</b> 주소를 페이로드에서 그대로 믿으면,
    /// 악성 페이지가 자기 서버를 적어 보내 우리 앱이 그쪽에 핸드오프 토큰을 넘기고,
    /// 그쪽이 준 SIP 설정으로 전화기를 등록하게 된다. 그 순간부터 모든 통화가 남의 센터를 지난다.
    /// </summary>
    [Theory]
    [InlineData("http://pbx.local:3000", "http://pbx.local:3000/api/v1/", true)]
    [InlineData("http://pbx.local:3000/", "http://pbx.local:3000/api/v1/", true)]
    [InlineData("http://PBX.LOCAL:3000", "http://pbx.local:3000/api/v1/", true)]
    [InlineData("http://evil.example.com", "http://pbx.local:3000/api/v1/", false)]
    [InlineData("http://pbx.local:9999", "http://pbx.local:3000/api/v1/", false)]
    [InlineData("https://pbx.local:3000", "http://pbx.local:3000/api/v1/", false)]
    public void A_payload_may_only_name_the_server_this_pc_is_set_to(
        string named,
        string configured,
        bool same)
    {
        var request = Parsed($"kastercti://connect?serverUrl={Uri.EscapeDataString(named)}&handoffToken={Token}");

        Assert.Equal(same, request.TargetsSameServer(new Uri(configured)));
    }

    /// <summary>주소를 안 적어 보냈으면 이 PC 의 서버를 쓰겠다는 뜻이다.</summary>
    [Fact]
    public void A_payload_with_no_server_named_matches_whatever_this_pc_is_set_to()
    {
        Assert.True(Parsed($"kastercti://connect?handoffToken={Token}")
            .TargetsSameServer(new Uri("http://pbx.local:3000/api/v1/")));
    }

    /// <summary>
    /// 거절 사유는 진단 로그로 나간다. <b>거기에 토큰을 실으면 안 된다</b> —
    /// 로그 파일은 상담원이 문제를 알릴 때 통째로 보내는 파일이고,
    /// 핸드오프 토큰은 그것 하나로 그 계정에 로그인되는 값이다.
    /// </summary>
    [Theory]
    [InlineData("kastercti://connect?handoffToken=abc%20def")]
    [InlineData("kastercti://connect?handoffToken=" + "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")]
    [InlineData("kastercti://disconnect?handoffToken=abcdef0123456789")]
    public void A_refusal_never_repeats_the_token_back_into_the_log(string raw)
    {
        ProtocolRequest.TryParse(raw, out _, out var error);

        if (error is null) return;

        Assert.DoesNotContain("abc def", error);
        Assert.DoesNotContain("aaaaaaaa", error);
        Assert.DoesNotContain("abcdef0123456789", error);
    }
}
