using System.Net;
using System.Net.Http.Headers;
using KAster.Desktop.Core.Server;
using KAster.Desktop.Core.Storage;
using Xunit;

namespace KAster.Desktop.Tests.Server;

/// <summary>디스크를 건드리지 않는 토큰 보관소.</summary>
internal sealed class FakeTokenStore : ITokenStore
{
    private TokenPair? _pair;

    public FakeTokenStore(TokenPair? initial) => _pair = initial;

    public TokenPair? Load()
    {
        lock (this) return _pair;
    }

    public void Save(TokenPair pair)
    {
        lock (this) _pair = pair;
    }

    public void Clear()
    {
        lock (this) _pair = null;
    }
}

public class TokenRefreshHandlerTests
{
    private static string? BearerOf(HttpRequestMessage request) => request.Headers.Authorization?.Parameter;

    private static HttpClient Build(
        StubHttpHandler stub,
        ITokenStore store,
        Func<string, CancellationToken, Task<TokenPair?>> refresh,
        out TokenRefreshHandler handler)
    {
        handler = new TokenRefreshHandler(store, refresh) { InnerHandler = stub };
        return new HttpClient(handler) { BaseAddress = new Uri("http://server/api/v1/") };
    }

    [Fact]
    public async Task Attaches_the_access_token_as_a_bearer_header()
    {
        var stub = new StubHttpHandler().RespondWith(_ => StubHttpHandler.Json(HttpStatusCode.OK, "{}"));
        var http = Build(stub, new FakeTokenStore(new TokenPair("at", "rt")),
            (_, _) => Task.FromResult<TokenPair?>(null), out _);

        await http.GetAsync("calls/active");

        Assert.Equal("at", BearerOf(stub.Requests[0]));
    }

    [Fact]
    public async Task Retries_the_original_request_once_after_refreshing_on_401()
    {
        var stub = new StubHttpHandler().RespondWith(request =>
            BearerOf(request) == "at2"
                ? StubHttpHandler.Json(HttpStatusCode.OK, """{"success":true,"data":{},"error":null}""")
                : StubHttpHandler.Json(HttpStatusCode.Unauthorized, "{}"));
        var store = new FakeTokenStore(new TokenPair("at", "rt"));
        var refreshCalls = 0;
        var http = Build(stub, store, (_, _) =>
        {
            Interlocked.Increment(ref refreshCalls);
            return Task.FromResult<TokenPair?>(new TokenPair("at2", "rt2"));
        }, out _);

        var response = await http.PostAsync("calls/c-1/hangup", new StringContent("{}"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(1, refreshCalls);
        Assert.Equal(2, stub.Requests.Count);
        Assert.Equal("at2", store.Load()!.AccessToken);
    }

    [Fact]
    public async Task Resends_the_original_body_on_the_retry()
    {
        var stub = new StubHttpHandler().RespondWith(request =>
            BearerOf(request) == "at2"
                ? StubHttpHandler.Json(HttpStatusCode.OK, "{}")
                : StubHttpHandler.Json(HttpStatusCode.Unauthorized, "{}"));
        var http = Build(stub, new FakeTokenStore(new TokenPair("at", "rt")),
            (_, _) => Task.FromResult<TokenPair?>(new TokenPair("at2", "rt2")), out _);

        await http.PostAsync("calls/originate",
            new StringContent("""{"phoneNumber":"01011112222"}""", System.Text.Encoding.UTF8, "application/json"));

        Assert.Contains("01011112222", stub.Bodies[1]);
    }

    [Fact]
    public async Task Gives_up_and_signals_logout_when_the_refresh_also_fails()
    {
        var stub = new StubHttpHandler().RespondWith(_ => StubHttpHandler.Json(HttpStatusCode.Unauthorized, "{}"));
        var store = new FakeTokenStore(new TokenPair("at", "rt"));
        var http = Build(stub, store, (_, _) => Task.FromResult<TokenPair?>(null), out var handler);
        var signedOut = 0;
        handler.SignedOut += (_, _) => Interlocked.Increment(ref signedOut);

        var response = await http.GetAsync("calls/active");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(1, signedOut);
        Assert.Null(store.Load());
        Assert.Single(stub.Requests);
    }

    [Fact]
    public async Task Refreshes_only_once_even_when_several_calls_race()
    {
        var stub = new StubHttpHandler().RespondWith(request =>
            BearerOf(request) == "at2"
                ? StubHttpHandler.Json(HttpStatusCode.OK, "{}")
                : StubHttpHandler.Json(HttpStatusCode.Unauthorized, "{}"));
        var store = new FakeTokenStore(new TokenPair("at", "rt"));
        var refreshCalls = 0;
        var http = Build(stub, store, async (_, _) =>
        {
            Interlocked.Increment(ref refreshCalls);
            await Task.Delay(30);
            return new TokenPair("at2", "rt2");
        }, out _);

        var responses = await Task.WhenAll(
            http.GetAsync("calls/active"),
            http.GetAsync("agents/a-1"),
            http.GetAsync("queues/summary"));

        Assert.All(responses, r => Assert.Equal(HttpStatusCode.OK, r.StatusCode));
        Assert.Equal(1, refreshCalls);
    }
}
