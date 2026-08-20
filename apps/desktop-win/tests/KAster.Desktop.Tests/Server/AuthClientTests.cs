using System.Net;
using KAster.Desktop.Core.Server;
using Xunit;

namespace KAster.Desktop.Tests.Server;

public class AuthClientTests
{
    private const string LoginJson = """
    {"success":true,"data":{"accessToken":"at","refreshToken":"rt","tokenType":"Bearer","expiresIn":900,
    "agent":{"agentId":"a-1","agentName":"김상담","extension":"1001","role":"agent"},
    "softphoneConfig":{"enabled":true,"sipUri":"sip:1001@pbx.local","wsServer":null,"sipServer":"pbx.local:48950",
    "transport":"udp","authorizationUsername":"1001","authorizationPassword":"s3cret","displayName":"김상담"}},
    "error":null}
    """;

    private static AuthClient Build(StubHttpHandler stub) =>
        new(new HttpClient(stub) { BaseAddress = new Uri("http://server/api/v1/") });

    [Fact]
    public async Task Login_asks_for_a_desktop_session_so_the_sip_password_comes_back()
    {
        var stub = new StubHttpHandler().Enqueue(HttpStatusCode.OK, LoginJson);
        var client = Build(stub);

        var result = await client.LoginAsync("agent1001", "Password123!", "1001", CancellationToken.None);

        var body = stub.Bodies[0]!;
        Assert.Contains("\"clientType\":\"desktop\"", body);
        Assert.Equal("auth/login", stub.Requests[0].RequestUri!.AbsolutePath.TrimStart('/')["api/v1/".Length..]);
        Assert.Equal("s3cret", result.Session.SoftphoneConfig!.AuthorizationPassword);
        Assert.Equal("pbx.local:48950", result.Session.SoftphoneConfig.SipServer);
        Assert.Equal("udp", result.Session.SoftphoneConfig.Transport);
        Assert.Equal("at", result.Tokens.AccessToken);
        Assert.Equal("rt", result.Tokens.RefreshToken);
        Assert.Equal("a-1", result.Session.Agent.AgentId);
    }

    [Fact]
    public async Task Login_throws_with_the_server_message_when_the_envelope_says_it_failed()
    {
        var stub = new StubHttpHandler().Enqueue(
            HttpStatusCode.Unauthorized,
            """{"success":false,"data":null,"error":{"code":"UNAUTHORIZED","message":"Invalid credentials"}}""");
        var client = Build(stub);

        var ex = await Assert.ThrowsAsync<CtiServerException>(
            () => client.LoginAsync("agent1001", "wrong", "1001", CancellationToken.None));

        Assert.Contains("Invalid credentials", ex.Message);
    }

    [Fact]
    public async Task Refresh_returns_the_rotated_pair()
    {
        var stub = new StubHttpHandler().Enqueue(HttpStatusCode.OK, """
        {"success":true,"data":{"accessToken":"at2","refreshToken":"rt2","tokenType":"Bearer","expiresIn":900,
        "agent":{"agentId":"a-1","agentName":"김상담","extension":"1001","role":"agent"},
        "softphoneConfig":null},"error":null}
        """);
        var client = Build(stub);

        var result = await client.RefreshAsync("rt", CancellationToken.None);

        Assert.Equal("at2", result.Tokens.AccessToken);
        Assert.Equal("rt2", result.Tokens.RefreshToken);
    }

    [Fact]
    public async Task Get_session_reads_the_agent_and_the_softphone_config()
    {
        var stub = new StubHttpHandler().Enqueue(HttpStatusCode.OK, """
        {"success":true,"data":{"agent":{"agentId":"a-1","agentName":"김상담","extension":"1001","role":"agent"},
        "softphoneConfig":{"enabled":true,"sipUri":"sip:1001@pbx.local","sipServer":"pbx.local:48950",
        "transport":"udp","authorizationUsername":"1001","displayName":"김상담"}},"error":null}
        """);
        var client = Build(stub);

        var session = await client.GetSessionAsync(CancellationToken.None);

        Assert.Equal("1001", session.Agent.Extension);
        Assert.True(session.SoftphoneConfig!.Enabled);
    }

    [Fact]
    public async Task A_missing_transport_field_defaults_to_udp()
    {
        var stub = new StubHttpHandler().Enqueue(HttpStatusCode.OK, """
        {"success":true,"data":{"agent":{"agentId":"a-1","agentName":"김상담","extension":"1001","role":"agent"},
        "softphoneConfig":{"enabled":true,"sipUri":"sip:1001@pbx.local","sipServer":"pbx.local:48950",
        "authorizationUsername":"1001","displayName":"김상담"}},"error":null}
        """);
        var client = Build(stub);

        var session = await client.GetSessionAsync(CancellationToken.None);

        Assert.Equal("udp", session.SoftphoneConfig!.Transport);
    }
}
