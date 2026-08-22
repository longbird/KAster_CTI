using System.Net;
using System.Security.Cryptography;
using System.Text;
using KAster.Desktop.App.ViewModels;
using KAster.Desktop.Core.Updates;
using KAster.Desktop.Tests.Server;

namespace KAster.Desktop.Tests.App;

public class UpdateViewModelTests : IDisposable
{
    private static readonly Uri Base = new("http://server:3000/api/v1/");

    private readonly string _folder =
        Path.Combine(Path.GetTempPath(), "kaster-update-vm-" + Guid.NewGuid().ToString("N"));

    private DateTimeOffset _now = new(2026, 8, 22, 9, 0, 0, TimeSpan.Zero);
    private bool _free = true;
    private Task _work = Task.CompletedTask;
    private readonly List<string> _announced = new();

    public void Dispose()
    {
        if (Directory.Exists(_folder)) Directory.Delete(_folder, recursive: true);
    }

    private (UpdateViewModel Vm, StubHttpHandler Stub) Build(string currentVersion = "1.3.0")
    {
        var stub = new StubHttpHandler();
        var client = new UpdateClient(new HttpClient(stub) { BaseAddress = Base }, () => "access", "pc-001");

        return (
            new UpdateViewModel(
                client,
                currentVersion,
                "stable",
                _folder,
                () => _now,
                () => _free,
                task => _work = task,
                message => _announced.Add(message)),
            stub);
    }

    private const string SessionJson =
        """{"success":true,"data":{"updateSessionToken":"sess-1","expiresIn":600},"error":null}""";

    private const string NoReleaseJson = """{"success":true,"data":null,"error":null}""";

    private const string ReportJson = """{"success":true,"data":{"recorded":true},"error":null}""";

    private static string ManifestJson(bool mandatory = false, string sha = "abc") => $$"""
    {"success":true,"data":{
      "centerId":"t-1","channel":"stable","currentVersion":"1.3.0","latestVersion":"1.4.0",
      "mandatory":{{(mandatory ? "true" : "false")}},"minimumRequiredVersion":null,
      "serverCompatibility":{"minimumServerVersion":null,"maximumServerVersion":null},
      "artifacts":[{"artifactId":"agent-win-x64-1.4.0","version":"1.4.0",
        "fileName":"KAsterAgent-1.4.0.exe","size":15,"sha256":"{{sha}}"}],
      "notes":"고객 정보 표시 수정"},"error":null}
    """;

    private static string Sha256Of(string text)
        => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(text))).ToLowerInvariant();

    /// <summary>본문이 설치 파일인 응답과 봉투인 응답을 요청 경로로 갈라 준다.</summary>
    private static void ServeDownload(StubHttpHandler stub, string sha, string body)
        => stub.RespondWith(request =>
        {
            var path = request.RequestUri!.AbsolutePath;

            if (path.EndsWith("/session", StringComparison.Ordinal))
                return StubHttpHandler.Json(HttpStatusCode.OK, SessionJson);

            if (path.EndsWith("/manifest", StringComparison.Ordinal))
                return StubHttpHandler.Json(HttpStatusCode.OK, ManifestJson(sha: sha));

            if (path.EndsWith("/download-init", StringComparison.Ordinal))
                return StubHttpHandler.Json(HttpStatusCode.OK, $$"""
                {"success":true,"data":{"artifactId":"agent-win-x64-1.4.0","version":"1.4.0",
                  "downloadUrl":"/agent-updates/artifacts/agent-win-x64-1.4.0",
                  "downloadToken":"dl-1","expiresIn":120,"sha256":"{{sha}}"},"error":null}
                """);

            if (path.EndsWith("/report", StringComparison.Ordinal))
                return StubHttpHandler.Json(HttpStatusCode.OK, ReportJson);

            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new ByteArrayContent(Encoding.UTF8.GetBytes(body)),
            };
        });

    private static IEnumerable<string> ReportedEvents(StubHttpHandler stub)
        => stub.Requests
            .Select((request, i) => (request, body: stub.Bodies[i]))
            .Where(pair => pair.request.RequestUri!.AbsolutePath.EndsWith("/report", StringComparison.Ordinal))
            .Select(pair => pair.body ?? string.Empty);

    [Fact]
    public async Task An_up_to_date_app_says_so_and_offers_nothing_to_download()
    {
        var (vm, stub) = Build();
        stub.Enqueue(HttpStatusCode.OK, SessionJson).Enqueue(HttpStatusCode.OK, NoReleaseJson);

        await vm.CheckAsync();

        Assert.False(vm.HasUpdate);
        Assert.False(vm.DownloadCommand.CanExecute(null));
        Assert.Contains("최신", vm.StatusText);
        Assert.Empty(_announced);
    }

    [Fact]
    public async Task A_newer_version_is_announced_and_reported()
    {
        var (vm, stub) = Build();
        stub.Enqueue(HttpStatusCode.OK, SessionJson)
            .Enqueue(HttpStatusCode.OK, ManifestJson())
            .Enqueue(HttpStatusCode.OK, ReportJson);

        await vm.CheckAsync();

        Assert.True(vm.HasUpdate);
        Assert.False(vm.IsRequired);
        Assert.Equal("1.4.0", vm.LatestVersion);
        Assert.Equal("고객 정보 표시 수정", vm.Notes);
        Assert.Single(_announced);
        Assert.Contains("1.4.0", _announced[0]);
        Assert.Contains(ReportedEvents(stub), body => body.Contains(UpdateEvents.UpdateAvailable));
    }

    /// <summary>
    /// 강제 릴리스도 <b>말하는 것까지</b>다. 앱을 끄지도, 설치를 시작하지도 않는다 —
    /// 통화 중에 앱이 사라지면 고객 통화가 끊긴다.
    /// </summary>
    [Fact]
    public async Task A_mandatory_release_is_said_more_firmly_and_nothing_else_changes()
    {
        var (vm, stub) = Build();
        stub.Enqueue(HttpStatusCode.OK, SessionJson)
            .Enqueue(HttpStatusCode.OK, ManifestJson(mandatory: true))
            .Enqueue(HttpStatusCode.OK, ReportJson);

        await vm.CheckAsync();

        Assert.True(vm.IsRequired);
        Assert.Contains("필수", vm.StatusText);
        Assert.False(vm.HasFile);
    }

    /// <summary>
    /// 확인이 실패한 것과 최신인 것은 다르다. 401·끊긴 서버를 "최신입니다" 로 말하면
    /// 상담원은 낡은 클라이언트를 쓰는 줄 영영 모른다.
    /// </summary>
    [Fact]
    public async Task A_check_that_could_not_reach_the_server_does_not_claim_to_be_up_to_date()
    {
        var (vm, stub) = Build();
        stub.Enqueue(
            HttpStatusCode.Unauthorized,
            """{"success":false,"data":null,"error":{"code":"UNAUTHORIZED","message":"Invalid or expired update session token"}}""");

        await vm.CheckAsync();

        Assert.False(vm.HasUpdate);
        Assert.Contains("확인하지 못했", vm.StatusText);
        Assert.DoesNotContain("최신", vm.StatusText);
    }

    /// <summary>
    /// <b>통화 중에는 받지 않는다.</b> 설치 파일은 수십 MB 라 같은 회선으로 흐르는
    /// 통화 음성을 밀어낸다. 상담원이 눌러도 그 자리에서 거절하고 이유를 말한다.
    /// </summary>
    [Fact]
    public async Task A_download_is_refused_while_a_call_is_up()
    {
        var (vm, stub) = Build();
        stub.Enqueue(HttpStatusCode.OK, SessionJson)
            .Enqueue(HttpStatusCode.OK, ManifestJson())
            .Enqueue(HttpStatusCode.OK, ReportJson);
        await vm.CheckAsync();

        _free = false;
        Assert.False(vm.DownloadCommand.CanExecute(null));

        await vm.DownloadAsync();

        Assert.False(vm.HasFile);
        Assert.Contains("통화", vm.StatusText);
    }

    [Fact]
    public async Task A_verified_file_is_kept_and_the_agent_is_told_where_it_is()
    {
        var (vm, stub) = Build();
        ServeDownload(stub, Sha256Of("installer-bytes"), "installer-bytes");

        await vm.CheckAsync();
        await vm.DownloadAsync();

        Assert.True(vm.HasFile);
        Assert.True(File.Exists(vm.ReadyFilePath));
        Assert.Contains(ReportedEvents(stub), body => body.Contains(UpdateEvents.DownloadStarted));
        Assert.Contains(ReportedEvents(stub), body => body.Contains(UpdateEvents.DownloadVerified));
    }

    /// <summary>
    /// 지문이 다르면 <b>파일을 남기지 않고</b> 그 사실을 서버에 보고한다.
    /// 남겨 두면 상담원이 그것을 두 번 눌러 실행한다.
    /// </summary>
    [Fact]
    public async Task A_file_that_fails_its_fingerprint_leaves_nothing_behind_and_is_reported()
    {
        var (vm, stub) = Build();
        ServeDownload(stub, Sha256Of("what we asked for"), "tampered");

        await vm.CheckAsync();
        await vm.DownloadAsync();

        Assert.False(vm.HasFile);
        Assert.Null(vm.ReadyFilePath);
        Assert.False(Directory.Exists(_folder) && Directory.GetFiles(_folder).Length > 0);
        Assert.Contains(ReportedEvents(stub), body => body.Contains(UpdateEvents.DownloadRejected));
    }

    /// <summary>받는 도중 끊긴 것은 바꿔치기가 아니다. 다른 사건으로 남긴다.</summary>
    [Fact]
    public async Task A_download_the_server_refused_is_reported_as_a_failure_not_a_forgery()
    {
        var (vm, stub) = Build();
        stub.RespondWith(request =>
        {
            var path = request.RequestUri!.AbsolutePath;

            if (path.EndsWith("/session", StringComparison.Ordinal))
                return StubHttpHandler.Json(HttpStatusCode.OK, SessionJson);
            if (path.EndsWith("/manifest", StringComparison.Ordinal))
                return StubHttpHandler.Json(HttpStatusCode.OK, ManifestJson());
            if (path.EndsWith("/report", StringComparison.Ordinal))
                return StubHttpHandler.Json(HttpStatusCode.OK, ReportJson);

            return StubHttpHandler.Json(
                HttpStatusCode.Unauthorized,
                """{"success":false,"data":null,"error":{"code":"UNAUTHORIZED","message":"Invalid or expired download token"}}""");
        });

        await vm.CheckAsync();
        await vm.DownloadAsync();

        Assert.False(vm.HasFile);
        Assert.Contains(ReportedEvents(stub), body => body.Contains(UpdateEvents.DownloadFailed));
    }

    /// <summary>
    /// 파일 이름은 <b>서버가 주는 값</b>이다. 경로가 섞여 있으면 우리가 시키는 대로
    /// 엉뚱한 폴더(시작 프로그램 같은)에 실행 파일을 쓰게 된다.
    /// </summary>
    [Theory]
    [InlineData("KAsterAgent-1.4.0.exe", "KAsterAgent-1.4.0.exe")]
    [InlineData("..\\..\\Startup\\evil.exe", "evil.exe")]
    [InlineData("../../etc/passwd", "passwd")]
    [InlineData("C:\\Windows\\System32\\evil.exe", "evil.exe")]
    [InlineData("", "KAsterAgent-1.4.0.exe")]
    [InlineData("   ", "KAsterAgent-1.4.0.exe")]
    [InlineData(null, "KAsterAgent-1.4.0.exe")]
    [InlineData("ev|il?.exe", "evil.exe")]
    public void The_file_name_the_server_gave_us_cannot_walk_out_of_the_folder(string? given, string used)
    {
        Assert.Equal(used, UpdateFileName.SafeFor(given, "1.4.0"));
    }

    /// <summary>스스로도 다시 확인하지만, 정해진 주기 전에는 조용히 지나간다.</summary>
    [Fact]
    public async Task The_next_check_waits_for_its_turn()
    {
        var (vm, stub) = Build();
        stub.Enqueue(HttpStatusCode.OK, SessionJson).Enqueue(HttpStatusCode.OK, NoReleaseJson);
        await vm.CheckAsync();

        var asked = stub.Requests.Count;

        _now = _now.AddHours(1);
        vm.Tick();
        await _work;
        Assert.Equal(asked, stub.Requests.Count);

        stub.Enqueue(HttpStatusCode.OK, SessionJson).Enqueue(HttpStatusCode.OK, NoReleaseJson);
        _now = _now.AddHours(UpdateViewModel.CheckIntervalHours);
        vm.Tick();
        await _work;

        Assert.True(stub.Requests.Count > asked);
    }

    [Fact]
    public void The_agent_can_be_taken_to_the_folder_the_file_landed_in()
    {
        var (vm, _) = Build();
        string? asked = null;
        vm.FolderRequested += (_, path) => asked = path;

        vm.OpenDownloadFolderCommand.Execute(null);

        Assert.Equal(_folder, asked);
    }
}
