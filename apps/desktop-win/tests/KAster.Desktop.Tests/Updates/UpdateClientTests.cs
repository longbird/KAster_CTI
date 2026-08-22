using System.Net;
using System.Security.Cryptography;
using System.Text;
using KAster.Desktop.Core.Updates;
using KAster.Desktop.Tests.Server;

namespace KAster.Desktop.Tests.Updates;

public class UpdateClientTests : IDisposable
{
    private static readonly Uri Base = new("http://server:3000/api/v1/");

    private readonly string _folder =
        Path.Combine(Path.GetTempPath(), "kaster-update-tests-" + Guid.NewGuid().ToString("N"));

    public void Dispose()
    {
        if (Directory.Exists(_folder)) Directory.Delete(_folder, recursive: true);
    }

    private static (UpdateClient Client, StubHttpHandler Stub) Build()
    {
        var stub = new StubHttpHandler();
        return (
            new UpdateClient(new HttpClient(stub) { BaseAddress = Base }, () => "access-token", "pc-001"),
            stub);
    }

    private static string BearerOf(HttpRequestMessage request)
        => request.Headers.Authorization?.ToString() ?? string.Empty;

    private static DownloadTicket Ticket(string sha) => new()
    {
        ArtifactId = "agent-win-x64-1.4.0",
        Version = "1.4.0",
        DownloadUrl = "/agent-updates/artifacts/agent-win-x64-1.4.0",
        DownloadToken = "dl-1",
        Sha256 = sha,
    };

    private const string SessionJson =
        """{"success":true,"data":{"updateSessionToken":"sess-1","expiresIn":600},"error":null}""";

    private const string ManifestJson = """
    {"success":true,"data":{
      "centerId":"t-1","channel":"stable","currentVersion":"1.3.0","latestVersion":"1.4.0",
      "mandatory":false,"minimumRequiredVersion":null,
      "serverCompatibility":{"minimumServerVersion":"1.0.0","maximumServerVersion":null},
      "artifacts":[{"artifactId":"agent-win-x64-1.4.0","version":"1.4.0",
        "fileName":"KAsterAgent-1.4.0.exe","size":12,"sha256":"abc"}],
      "notes":"고객 정보 표시 수정"},"error":null}
    """;

    private const string DownloadInitJson = """
    {"success":true,"data":{"artifactId":"agent-win-x64-1.4.0","version":"1.4.0",
      "downloadUrl":"/agent-updates/artifacts/agent-win-x64-1.4.0",
      "downloadToken":"dl-1","expiresIn":120,"sha256":"abc"},"error":null}
    """;

    private static string Sha256Of(string text)
        => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(text))).ToLowerInvariant();

    private static void RespondWithBody(StubHttpHandler stub, string body)
        => stub.RespondWith(_ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new ByteArrayContent(Encoding.UTF8.GetBytes(body)),
        });

    [Fact]
    public async Task The_session_is_asked_for_with_the_login_token()
    {
        var (client, stub) = Build();
        stub.Enqueue(HttpStatusCode.OK, SessionJson);

        var token = await client.StartSessionAsync("1.3.0", CancellationToken.None);

        Assert.Equal("sess-1", token);
        Assert.Equal("/api/v1/agent-updates/session", stub.Requests[0].RequestUri!.AbsolutePath);
        Assert.Equal("Bearer access-token", BearerOf(stub.Requests[0]));
        Assert.Contains("pc-001", stub.Bodies[0]);
        Assert.Contains("1.3.0", stub.Bodies[0]);
    }

    /// <summary>
    /// manifest 는 <b>로그인 토큰이 아니라</b> 업데이트 세션 토큰으로 부른다.
    /// 잘못 보내면 매번 401 이 나고, 그것은 화면에서 "업데이트가 없다" 와 구분되지 않는다.
    /// </summary>
    [Fact]
    public async Task The_manifest_is_asked_for_with_the_update_session_token()
    {
        var (client, stub) = Build();
        stub.Enqueue(HttpStatusCode.OK, ManifestJson);

        var manifest = await client.GetManifestAsync("sess-1", "1.3.0", "stable", CancellationToken.None);

        Assert.Equal("Bearer sess-1", BearerOf(stub.Requests[0]));
        Assert.Contains("currentVersion=1.3.0", stub.Requests[0].RequestUri!.Query);
        Assert.Contains("channel=stable", stub.Requests[0].RequestUri!.Query);
        Assert.Equal("1.4.0", manifest!.LatestVersion);
        Assert.Single(manifest.Artifacts);
        Assert.Equal("abc", manifest.Artifacts[0].Sha256);
    }

    /// <summary>
    /// 승인된 릴리스가 없으면 서버는 404 가 아니라 <c>data: null</c> 을 준다.
    /// 그것을 오류로 다루면 아직 릴리스를 안 올린 현장에서 확인할 때마다 오류가 뜬다.
    /// </summary>
    [Fact]
    public async Task No_approved_release_reads_as_nothing_rather_than_an_error()
    {
        var (client, stub) = Build();
        stub.Enqueue(HttpStatusCode.OK, """{"success":true,"data":null,"error":null}""");

        Assert.Null(await client.GetManifestAsync("sess-1", "1.3.0", "stable", CancellationToken.None));
    }

    /// <summary>만료된 세션 토큰은 401 로 돌아온다. 그것은 "없다" 가 아니라 실패다.</summary>
    [Fact]
    public async Task An_expired_session_token_is_a_failure_not_an_empty_answer()
    {
        var (client, stub) = Build();
        stub.Enqueue(
            HttpStatusCode.Unauthorized,
            """{"success":false,"data":null,"error":{"code":"UNAUTHORIZED","message":"Invalid or expired update session token"}}""");

        await Assert.ThrowsAnyAsync<Exception>(
            () => client.GetManifestAsync("sess-1", "1.3.0", "stable", CancellationToken.None));
    }

    [Fact]
    public async Task The_download_ticket_is_asked_for_with_the_update_session_token()
    {
        var (client, stub) = Build();
        stub.Enqueue(HttpStatusCode.OK, DownloadInitJson);

        var ticket = await client.StartDownloadAsync(
            "sess-1", "agent-win-x64-1.4.0", "1.3.0", CancellationToken.None);

        Assert.Equal("Bearer sess-1", BearerOf(stub.Requests[0]));
        Assert.Contains("agent-win-x64-1.4.0", stub.Bodies[0]);
        Assert.Contains("1.3.0", stub.Bodies[0]);
        Assert.Equal("dl-1", ticket.DownloadToken);
        Assert.Equal("abc", ticket.Sha256);
    }

    /// <summary>
    /// 서버가 주는 <c>downloadUrl</c> 에는 <c>api/v1</c> 이 빠져 있다. 그대로 붙이면
    /// 없는 경로로 나가는데, 다운로드 토큰은 1회용이라 그 한 번으로 태워진다.
    /// </summary>
    [Fact]
    public void The_missing_api_prefix_is_put_back()
    {
        Assert.Equal(
            "http://server:3000/api/v1/agent-updates/artifacts/agent-win-x64-1.4.0",
            UpdateClient.ResolveArtifactUri(Base, "/agent-updates/artifacts/agent-win-x64-1.4.0", "x").ToString());
    }

    [Fact]
    public void A_missing_download_url_is_rebuilt_from_the_artifact_id()
    {
        Assert.Equal(
            "http://server:3000/api/v1/agent-updates/artifacts/agent-win-x64-1.4.0",
            UpdateClient.ResolveArtifactUri(Base, null, "agent-win-x64-1.4.0").ToString());
    }

    /// <summary>
    /// 다운로드 토큰을 다른 호스트로 보내면 그 호스트가 우리 토큰을 갖는다.
    /// 우리 서버가 준 값이라도 목적지가 우리 서버가 아니면 보내지 않는다.
    /// </summary>
    [Fact]
    public void A_download_url_pointing_somewhere_else_is_refused()
    {
        Assert.Throws<UpdateException>(
            () => UpdateClient.ResolveArtifactUri(Base, "http://evil.example.com/artifacts/x", "x"));
    }

    [Fact]
    public async Task A_file_that_matches_its_fingerprint_is_kept()
    {
        var (client, stub) = Build();
        RespondWithBody(stub, "installer-bytes");

        var target = Path.Combine(_folder, "KAsterAgent-1.4.0.exe");

        var saved = await client.FetchArtifactAsync(
            Ticket(Sha256Of("installer-bytes")), target, CancellationToken.None);

        Assert.Equal(target, saved);
        Assert.Equal("installer-bytes", await File.ReadAllTextAsync(target));
        Assert.Equal("Bearer dl-1", BearerOf(stub.Requests[0]));
        Assert.Equal(
            "/api/v1/agent-updates/artifacts/agent-win-x64-1.4.0",
            stub.Requests[0].RequestUri!.AbsolutePath);
    }

    /// <summary>대문자로 적힌 지문도 같은 지문이다. 글자 모양 때문에 멀쩡한 파일을 버리면 안 된다.</summary>
    [Fact]
    public async Task The_fingerprint_is_compared_without_regard_to_letter_case()
    {
        var (client, stub) = Build();
        RespondWithBody(stub, "installer-bytes");

        var target = Path.Combine(_folder, "KAsterAgent-1.4.0.exe");
        await client.FetchArtifactAsync(
            Ticket(Sha256Of("installer-bytes").ToUpperInvariant()), target, CancellationToken.None);

        Assert.True(File.Exists(target));
    }

    /// <summary>
    /// 받은 파일이 손상됐거나 바꿔치기됐으면 <b>실행할 수 있는 파일을 남기면 안 된다</b>.
    /// 남겨 두면 상담원이 그것을 두 번 눌러 실행한다.
    /// </summary>
    [Fact]
    public async Task A_file_that_does_not_match_is_thrown_away()
    {
        var (client, stub) = Build();
        RespondWithBody(stub, "tampered");

        var target = Path.Combine(_folder, "KAsterAgent-1.4.0.exe");

        await Assert.ThrowsAsync<UpdateException>(
            () => client.FetchArtifactAsync(Ticket(Sha256Of("what we asked for")), target, CancellationToken.None));

        Assert.False(File.Exists(target));
        Assert.Empty(Directory.GetFiles(_folder));
    }

    /// <summary>지문이 빈 manifest 는 검증할 것이 없다는 뜻이 아니다. 검증할 수 없으면 받지 않는다.</summary>
    [Fact]
    public async Task A_ticket_without_a_fingerprint_is_refused_before_anything_is_written()
    {
        var (client, stub) = Build();
        RespondWithBody(stub, "installer-bytes");

        var target = Path.Combine(_folder, "KAsterAgent-1.4.0.exe");

        await Assert.ThrowsAsync<UpdateException>(
            () => client.FetchArtifactAsync(Ticket(string.Empty), target, CancellationToken.None));

        Assert.False(File.Exists(target));
    }

    [Fact]
    public async Task A_result_is_reported_with_the_login_token()
    {
        var (client, stub) = Build();
        stub.Enqueue(HttpStatusCode.OK, """{"success":true,"data":{"recorded":true},"error":null}""");

        await client.ReportAsync(
            new UpdateReport
            {
                EventType = UpdateEvents.DownloadRejected,
                CurrentAppVersion = "1.3.0",
                TargetVersion = "1.4.0",
                ArtifactId = "agent-win-x64-1.4.0",
                Metadata = new Dictionary<string, object> { ["reason"] = "sha256-mismatch" },
            },
            CancellationToken.None);

        Assert.Equal("/api/v1/agent-updates/report", stub.Requests[0].RequestUri!.AbsolutePath);
        Assert.Equal("Bearer access-token", BearerOf(stub.Requests[0]));
        Assert.Contains("download-rejected", stub.Bodies[0]);
        Assert.Contains("sha256-mismatch", stub.Bodies[0]);
        Assert.Contains("pc-001", stub.Bodies[0]);
    }

    /// <summary>보고 하나가 실패했다고 업데이트 흐름이 멈추면 안 된다.</summary>
    [Fact]
    public async Task A_report_that_fails_is_swallowed()
    {
        var (client, stub) = Build();
        stub.Enqueue(HttpStatusCode.InternalServerError, "<html>proxy error</html>");

        await client.ReportAsync(new UpdateReport { EventType = UpdateEvents.UpdateAvailable }, CancellationToken.None);
    }
}
