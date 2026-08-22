using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using KAster.Desktop.Core.Serialization;
using KAster.Desktop.Core.Server;

namespace KAster.Desktop.Core.Updates;

/// <summary>
/// 자동 업데이트의 서버 쪽 절차. <b>토큰이 세 종류라 이 클래스가 존재한다</b> —
/// 어느 요청에 어느 토큰을 실을지 틀리면 전부 401 이 나고, 화면에서는 그것이
/// "업데이트가 없다" 와 구분되지 않는다.
///
/// <list type="number">
///   <item>세션 발급 · 결과 보고 → <b>로그인 access token</b></item>
///   <item>manifest · 다운로드 티켓 → <b>updateSessionToken</b> (600초, 재사용 가능)</item>
///   <item>파일 받기 → <b>downloadToken</b> (120초, <b>1회용</b>)</item>
/// </list>
///
/// 그래서 <see cref="TokenRefreshHandler"/> 가 붙은 클라이언트를 쓰지 않는다 — 그쪽은 모든 요청에
/// access token 을 덮어써서 2·3번을 망가뜨린다. 대신 요청마다 헤더를 직접 얹는다.
/// </summary>
public sealed class UpdateClient
{
    private readonly HttpClient _http;
    private readonly Func<string?> _accessToken;
    private readonly string _deviceId;

    /// <param name="deviceId">
    /// 어느 자리에서 난 일인지. 감사 로그에서 "한 대만 실패하는지 전부 실패하는지" 를 이것으로 가른다.
    /// </param>
    public UpdateClient(HttpClient http, Func<string?> accessToken, string deviceId)
    {
        _http = http;
        _accessToken = accessToken;
        _deviceId = deviceId;
    }

    /// <summary>로그인 토큰을 업데이트 세션 토큰으로 바꾼다. 600초 동안 여러 번 쓸 수 있다.</summary>
    public async Task<string> StartSessionAsync(string currentVersion, CancellationToken ct)
    {
        using var request = Post("agent-updates/session", new { deviceId = _deviceId, currentVersion });
        Bearer(request, _accessToken());

        using var response = await _http.SendAsync(request, ct);
        return (await EnvelopeReader.ReadAsync<UpdateSessionResponse>(response, ct)).UpdateSessionToken;
    }

    /// <summary>
    /// 승인된 릴리스. <b>없으면 null 이다</b> — 서버가 404 가 아니라 <c>data: null</c> 로 답한다.
    ///
    /// 서버는 우리 버전과 비교해 주지 않는다. 최신 릴리스를 그대로 돌려줄 뿐이므로
    /// <b>새 것인지 가르는 일은 이쪽</b>(<see cref="UpdateAvailability"/>)이 한다.
    /// </summary>
    public async Task<UpdateManifest?> GetManifestAsync(
        string sessionToken,
        string currentVersion,
        string channel,
        CancellationToken ct)
    {
        var path = "agent-updates/manifest"
            + $"?currentVersion={Uri.EscapeDataString(currentVersion)}"
            + $"&channel={Uri.EscapeDataString(channel)}";

        using var request = new HttpRequestMessage(HttpMethod.Get, path);
        Bearer(request, sessionToken);

        using var response = await _http.SendAsync(request, ct);
        return await EnvelopeReader.ReadOptionalAsync<UpdateManifest>(response, ct);
    }

    /// <summary>
    /// 파일 하나를 받을 표를 끊는다. <b>표는 1회용이다</b> — 다운로드가 중간에 끊기면
    /// 같은 표로 다시 시도할 수 없고 여기부터 다시 해야 한다.
    /// </summary>
    public async Task<DownloadTicket> StartDownloadAsync(
        string sessionToken,
        string artifactId,
        string currentVersion,
        CancellationToken ct)
    {
        using var request = Post("agent-updates/download-init", new { artifactId, currentVersion });
        Bearer(request, sessionToken);

        using var response = await _http.SendAsync(request, ct);
        return await EnvelopeReader.ReadAsync<DownloadTicket>(response, ct);
    }

    /// <summary>
    /// 파일을 받아 <b>지문을 맞춘 뒤에만</b> 제자리에 놓는다.
    ///
    /// 받는 동안에는 <c>.part</c> 로 쓴다. 지문이 다르면 그것을 지우고 던진다 —
    /// 손상됐거나 바꿔치기된 설치 파일을 남겨 두면 상담원이 그것을 두 번 눌러 실행한다.
    /// </summary>
    /// <returns>제자리에 놓인 파일의 경로.</returns>
    public async Task<string> FetchArtifactAsync(
        DownloadTicket ticket,
        string destinationPath,
        CancellationToken ct)
    {
        // 지문이 없으면 맞출 것이 없다. 검증할 수 없는 파일은 아예 받지 않는다.
        if (string.IsNullOrWhiteSpace(ticket.Sha256))
        {
            throw new UpdateException("설치 파일의 지문이 없어 확인할 수 없다. 관리자에게 알리세요.");
        }

        var uri = ResolveArtifactUri(_http.BaseAddress!, ticket.DownloadUrl, ticket.ArtifactId);

        var folder = Path.GetDirectoryName(destinationPath);
        if (!string.IsNullOrEmpty(folder)) Directory.CreateDirectory(folder);

        var partial = destinationPath + ".part";

        try
        {
            var actual = await SaveAsync(uri, ticket.DownloadToken, partial, ct);

            if (!string.Equals(actual, ticket.Sha256.Trim(), StringComparison.OrdinalIgnoreCase))
            {
                throw new UpdateException(
                    "받은 설치 파일이 서버가 알려준 것과 다르다. 그 파일은 지웠다.");
            }

            File.Move(partial, destinationPath, overwrite: true);
            return destinationPath;
        }
        catch
        {
            Discard(partial);
            throw;
        }
    }

    /// <summary>
    /// 결과를 서버에 남긴다. <b>실패해도 던지지 않는다</b> — 감사 기록 하나 때문에
    /// 상담원 화면에 오류가 뜨거나 업데이트 흐름이 멈추면 안 된다.
    /// </summary>
    public async Task ReportAsync(UpdateReport report, CancellationToken ct)
    {
        try
        {
            using var request = Post("agent-updates/report", new
            {
                eventType = report.EventType,
                deviceId = _deviceId,
                currentAppVersion = report.CurrentAppVersion,
                targetVersion = report.TargetVersion,
                artifactId = report.ArtifactId,
                metadata = report.Metadata,
            });
            Bearer(request, _accessToken());

            using var response = await _http.SendAsync(request, ct);
            _ = response;
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or CtiServerException)
        {
            // 못 남겼을 뿐이다. 상담원이 할 일은 바뀌지 않는다.
        }
    }

    /// <summary>
    /// 파일을 받을 실제 주소. <b>서버가 주는 <c>downloadUrl</c> 에는 <c>api/v1</c> 이 빠져 있다</b> —
    /// 앞의 슬래시를 그대로 두고 이으면 <c>/agent-updates/...</c> 로 나가 404 가 되고,
    /// 다운로드 토큰은 1회용이라 그 한 번으로 태워진다.
    ///
    /// 절대 주소로 오면 <b>우리 서버인지 확인한다</b>. 다른 호스트로 보내면 그쪽이 우리 토큰을 갖는다.
    /// </summary>
    public static Uri ResolveArtifactUri(Uri baseAddress, string? downloadUrl, string artifactId)
    {
        var given = downloadUrl?.Trim();

        if (string.IsNullOrEmpty(given))
        {
            return new Uri(baseAddress, $"agent-updates/artifacts/{Uri.EscapeDataString(artifactId)}");
        }

        if (Uri.TryCreate(given, UriKind.Absolute, out var absolute))
        {
            var sameServer =
                string.Equals(absolute.Scheme, baseAddress.Scheme, StringComparison.OrdinalIgnoreCase)
                && string.Equals(absolute.Host, baseAddress.Host, StringComparison.OrdinalIgnoreCase)
                && absolute.Port == baseAddress.Port;

            if (!sameServer)
            {
                throw new UpdateException("다운로드 주소가 이 서버가 아니다. 받지 않는다.");
            }

            return absolute;
        }

        return new Uri(baseAddress, given.TrimStart('/'));
    }

    /// <summary>내려받으면서 그 자리에서 지문을 계산한다. 파일을 두 번 읽지 않는다.</summary>
    private async Task<string> SaveAsync(Uri uri, string downloadToken, string partial, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, uri);
        Bearer(request, downloadToken);

        using var response = await _http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
        if (!response.IsSuccessStatusCode)
        {
            throw new CtiServerException(
                $"설치 파일을 받지 못했다 (서버가 {(int)response.StatusCode} 로 응답했다)",
                null,
                (int)response.StatusCode);
        }

        await using var incoming = await response.Content.ReadAsStreamAsync(ct);
        await using var file = File.Create(partial);
        using var digest = SHA256.Create();

        var buffer = new byte[81920];
        int read;
        while ((read = await incoming.ReadAsync(buffer, ct)) > 0)
        {
            digest.TransformBlock(buffer, 0, read, null, 0);
            await file.WriteAsync(buffer.AsMemory(0, read), ct);
        }

        digest.TransformFinalBlock(Array.Empty<byte>(), 0, 0);
        return Convert.ToHexString(digest.Hash!).ToLowerInvariant();
    }

    private static void Discard(string path)
    {
        try
        {
            if (File.Exists(path)) File.Delete(path);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            // 지우지 못했어도 .part 라 실행되지 않는다. 원래 실패를 이것으로 덮지 않는다.
        }
    }

    private static HttpRequestMessage Post(string path, object body)
        => new(HttpMethod.Post, path) { Content = JsonContent.Create(body, options: JsonDefaults.Options) };

    private static void Bearer(HttpRequestMessage request, string? token)
    {
        if (!string.IsNullOrEmpty(token))
        {
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        }
    }

    private sealed record UpdateSessionResponse
    {
        public string UpdateSessionToken { get; init; } = string.Empty;
        public int ExpiresIn { get; init; }
    }
}
