using System.Net;
using KAster.Desktop.Core.Server;

namespace KAster.Desktop.Tests.Server;

/// <summary>
/// 웹에서 넘어온 1회용 토큰을 이 앱의 세션으로 바꾼다.
/// 교환 응답에는 SIP 설정이 없어서, 데스크톱 세션을 한 번 더 물어봐야 전화기를 띄울 수 있다.
/// </summary>
public class HandoffExchangeTests
{
    private static AuthClient Build(StubHttpHandler stub) =>
        new(new HttpClient(stub) { BaseAddress = new Uri("http://server/api/v1/") });

    private const string ExchangeJson = """
    {"success":true,"data":{"accessToken":"at","refreshToken":"rt","tokenType":"Bearer","expiresIn":900,
    "agent":{"agentId":"a-1","agentName":"김상담","extension":"1001","role":"agent"}},"error":null}
    """;

    [Fact]
    public async Task The_one_time_token_comes_back_as_a_session()
    {
        var stub = new StubHttpHandler().Enqueue(HttpStatusCode.OK, ExchangeJson);

        var result = await Build(stub).ExchangeHandoffAsync("h-1", CancellationToken.None);

        Assert.Equal("/api/v1/auth/handoff/exchange", stub.Requests[0].RequestUri!.AbsolutePath);
        Assert.Contains("h-1", stub.Bodies[0]);
        Assert.Equal("at", result.Tokens.AccessToken);
        Assert.Equal("rt", result.Tokens.RefreshToken);
        Assert.Equal("1001", result.Agent.Extension);
    }

    /// <summary>
    /// 없는 토큰 · 만료된 토큰 · 이미 쓴 토큰 · 비활성 계정이 서버에서 모두 같은 401 이다.
    /// 우리도 그것을 가르지 않는다 — 가를 근거가 없다.
    /// </summary>
    [Fact]
    public async Task A_token_that_is_gone_expired_or_already_used_fails_the_same_way()
    {
        var stub = new StubHttpHandler().Enqueue(
            HttpStatusCode.Unauthorized,
            """{"success":false,"data":null,"error":{"code":"UNAUTHORIZED","message":"Invalid or expired handoff token"}}""");

        await Assert.ThrowsAsync<CtiServerException>(
            () => Build(stub).ExchangeHandoffAsync("h-1", CancellationToken.None));
    }

    /// <summary>
    /// 교환으로 받은 토큰은 아직 어느 클라이언트에도 실려 있지 않다.
    /// 데스크톱 세션 조회에 그 토큰을 <b>직접</b> 얹지 않으면 401 이 난다.
    /// </summary>
    [Fact]
    public async Task The_desktop_session_is_asked_for_with_the_freshly_exchanged_token()
    {
        var stub = new StubHttpHandler().Enqueue(HttpStatusCode.OK, """
        {"success":true,"data":{"agent":{"agentId":"a-1","agentName":"김상담","extension":"1001","role":"agent"},
        "softphoneConfig":{"enabled":true,"sipUri":"sip:1001@pbx.local","sipServer":"pbx.local:48950",
        "transport":"udp","authorizationUsername":"1001","authorizationPassword":"s3cret","displayName":"김상담"}},
        "error":null}
        """);

        var session = await Build(stub).GetDesktopSessionAsync("at", CancellationToken.None);

        Assert.Equal("/api/v1/auth/desktop/session", stub.Requests[0].RequestUri!.AbsolutePath);
        Assert.Equal("Bearer at", stub.Requests[0].Headers.Authorization?.ToString());
        Assert.Equal("s3cret", session.SoftphoneConfig!.AuthorizationPassword);
    }
}
