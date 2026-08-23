using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Text.Json;
using KAster.Desktop.App.Services;
using KAster.Desktop.Core.Protocol;
using Xunit;

/// <summary>
/// 웹앱이 이 PC 를 직접 두드린다 (<c>apps/web/src/utils/desktopBridge.ts</c>).
/// 응답 형태와 헤더가 그 파일이 기대하는 것과 글자까지 맞아야 한다 — 하나라도 어긋나면
/// 웹 화면에 "설치하고 실행해 주세요" 가 뜬다. 앱이 켜져 있는데도.
/// </summary>
public class DesktopBridgeServerTests : IDisposable
{
    private readonly HandoffStatusBoard _board = new();
    private readonly DesktopBridgeServer _server;
    private readonly HttpClient _client;

    public DesktopBridgeServerTests()
    {
        // 고정 포트(48125)를 쓰면 실제로 켜 둔 앱과 부딪힌다.
        _server = new DesktopBridgeServer(_board, port: FreePort());
        _server.Start();
        _client = new HttpClient { BaseAddress = new Uri($"http://127.0.0.1:{_server.Port}/") };
    }

    public void Dispose()
    {
        _client.Dispose();
        _server.Dispose();
    }

    private static int FreePort()
    {
        var probe = new TcpListener(IPAddress.Loopback, 0);
        probe.Start();
        var port = ((IPEndPoint)probe.LocalEndpoint).Port;
        probe.Stop();
        return port;
    }

    private async Task<JsonElement> GetJsonAsync(string path)
    {
        var response = await _client.GetAsync(path);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
    }

    [Fact]
    public async Task Health_says_ok()
    {
        var body = await GetJsonAsync("health");

        // 웹앱은 이 한 글자만 본다: payload.status === 'ok'
        Assert.Equal("ok", body.GetProperty("status").GetString());
    }

    /// <summary>
    /// 다른 출처(웹앱)에서 부르는 요청이다. 이 헤더가 없으면 브라우저가 응답을 못 읽고
    /// fetch 가 실패로 떨어진다 — 서버는 200 을 줬는데도 웹은 "앱이 없다" 로 읽는다.
    /// </summary>
    [Fact]
    public async Task Health_allows_the_browser_to_read_it()
    {
        var response = await _client.GetAsync("health");

        Assert.True(response.Headers.Contains("Access-Control-Allow-Origin"));
    }

    /// <summary>크롬은 공개 페이지가 사설망을 부를 때 먼저 물어본다. 여기서 막히면 본 요청이 안 나간다.</summary>
    [Fact]
    public async Task A_preflight_is_answered()
    {
        var response = await _client.SendAsync(new HttpRequestMessage(HttpMethod.Options, "health"));

        Assert.True(response.IsSuccessStatusCode);
        Assert.True(response.Headers.Contains("Access-Control-Allow-Origin"));
        Assert.True(response.Headers.Contains("Access-Control-Allow-Private-Network"));
    }

    [Fact]
    public async Task An_untracked_token_is_unknown()
    {
        var body = await GetJsonAsync("handoff-status?handoffToken=none");

        Assert.Equal("unknown", body.GetProperty("state").GetString());
    }

    [Fact]
    public async Task A_tracked_token_reports_its_state()
    {
        _board.Mark("t1", HandoffStatus.Connected);

        var body = await GetJsonAsync("handoff-status?handoffToken=t1");

        Assert.Equal("connected", body.GetProperty("state").GetString());
    }

    [Fact]
    public async Task A_failure_carries_the_reason_to_the_web_screen()
    {
        _board.Mark("t2", HandoffStatus.Failed("통화 중이라 자리를 넘기지 않았습니다"));

        var body = await GetJsonAsync("handoff-status?handoffToken=t2");

        Assert.Equal("failed", body.GetProperty("state").GetString());
        Assert.Equal("통화 중이라 자리를 넘기지 않았습니다", body.GetProperty("reason").GetString());
    }

    /// <summary>
    /// 웹앱이 쓰지 않는 길은 열지 않는다. 로컬 포트는 이 PC 의 브라우저가 여는 아무 웹페이지나
    /// 두드릴 수 있다. Electron 판의 <c>/diagnostics</c> 는 내부 상태를 그대로 내주므로 안 옮겼다.
    /// </summary>
    [Fact]
    public async Task Nothing_else_is_served()
    {
        foreach (var path in new[] { "diagnostics", "", "status", "handoff" })
        {
            var response = await _client.GetAsync(path);
            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        }
    }

    /// <summary>읽기만 여는 자리다. 쓰기 메서드로는 아무것도 안 한다.</summary>
    [Fact]
    public async Task Only_reads_are_served()
    {
        var response = await _client.PostAsync("health", new StringContent(""));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    /// <summary>포트를 이미 누가 잡고 있어도(Electron 판 동시 실행) 앱이 죽으면 안 된다.</summary>
    [Fact]
    public void A_taken_port_does_not_throw()
    {
        using var second = new DesktopBridgeServer(_board, port: _server.Port);

        second.Start();

        Assert.False(second.IsRunning);
    }
}
