using System.Net.Http.Headers;
using System.Net.Http.Json;
using KAster.Desktop.Core.Contracts;
using KAster.Desktop.Core.Serialization;
using KAster.Desktop.Core.Storage;

namespace KAster.Desktop.Core.Server;

public sealed record LoginResult(TokenPair Tokens, SessionSummary Session);

/// <summary>
/// 웹에서 넘어온 1회용 토큰을 바꾼 결과. <b>SIP 설정이 없다</b> — 교환 응답에는 상담원만 실려 온다.
/// 전화기를 띄우려면 <see cref="AuthClient.GetDesktopSessionAsync"/> 를 한 번 더 불러야 한다.
/// </summary>
public sealed record HandoffResult(TokenPair Tokens, AgentProfile Agent);

/// <summary>
/// 로그인 · 토큰 회전 · 세션 조회. 이 클라이언트는 <see cref="TokenRefreshHandler"/> 를 거치지 않는
/// 별도 <see cref="HttpClient"/> 로 붙어야 한다. 안 그러면 refresh 가 자기 자신을 다시 부른다.
/// </summary>
public sealed class AuthClient
{
    private readonly HttpClient _http;

    public AuthClient(HttpClient http) => _http = http;

    public async Task<LoginResult> LoginAsync(
        string loginId,
        string password,
        string extension,
        CancellationToken ct)
    {
        // clientType 이 desktop 이어야 서버가 SIP credential 을 실어 보낸다.
        var body = new
        {
            loginId,
            password,
            extension,
            clientType = "desktop",
        };

        using var response = await _http.PostAsJsonAsync("auth/login", body, JsonDefaults.Options, ct);
        var data = await EnvelopeReader.ReadAsync<AuthResponse>(response, ct);
        return ToResult(data);
    }

    public async Task<LoginResult> RefreshAsync(string refreshToken, CancellationToken ct)
    {
        using var response = await _http.PostAsJsonAsync("auth/refresh", new { refreshToken }, JsonDefaults.Options, ct);
        var data = await EnvelopeReader.ReadAsync<AuthResponse>(response, ct);
        return ToResult(data);
    }

    /// <summary>
    /// 로그아웃. 서버가 refresh token 을 회수한다.
    /// <b>실패해도 던지지 않는다</b> — 서버가 죽었다고 상담원이 로그인 화면으로 못 나가면 안 된다.
    /// 토큰은 어차피 이쪽에서도 지운다.
    /// </summary>
    public async Task LogoutAsync(string refreshToken, CancellationToken ct)
    {
        try
        {
            using var response = await _http.PostAsJsonAsync(
                "auth/logout", new { refreshToken }, JsonDefaults.Options, ct);
            _ = response;
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            // 서버에 못 알렸을 뿐이다. 토큰은 만료되면 무효가 된다.
        }
    }

    public async Task<SessionSummary> GetSessionAsync(CancellationToken ct)
    {
        using var response = await _http.GetAsync("me/session", ct);
        return await EnvelopeReader.ReadAsync<SessionSummary>(response, ct);
    }

    /// <summary>
    /// 웹에서 넘긴 1회용 토큰을 이 앱의 세션으로 바꾼다. 가드가 없는 공개 경로다.
    ///
    /// 없는 토큰 · 만료된 토큰 · 이미 쓴 토큰 · 비활성 계정이 서버에서 <b>전부 같은 401</b> 이다.
    /// 우리도 그것을 가르지 않는다 — 가를 근거가 없고, 가르는 척하면 없는 정보를 지어내는 것이다.
    /// </summary>
    public async Task<HandoffResult> ExchangeHandoffAsync(string handoffToken, CancellationToken ct)
    {
        using var response = await _http.PostAsJsonAsync(
            "auth/handoff/exchange", new { handoffToken }, JsonDefaults.Options, ct);
        var data = await EnvelopeReader.ReadAsync<AuthResponse>(response, ct);

        return new HandoffResult(new TokenPair(data.AccessToken, data.RefreshToken), data.Agent);
    }

    /// <summary>
    /// SIP credential 이 실린 데스크톱 세션. 방금 교환한 토큰은 아직 어느 클라이언트에도
    /// 실려 있지 않으므로 <b>여기서 직접 얹는다</b> — 안 얹으면 401 이다.
    /// </summary>
    public async Task<SessionSummary> GetDesktopSessionAsync(string accessToken, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, "auth/desktop/session");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

        using var response = await _http.SendAsync(request, ct);
        return await EnvelopeReader.ReadAsync<SessionSummary>(response, ct);
    }

    private static LoginResult ToResult(AuthResponse data) => new(
        new TokenPair(data.AccessToken, data.RefreshToken),
        new SessionSummary { Agent = data.Agent, SoftphoneConfig = data.SoftphoneConfig });

    private sealed record AuthResponse
    {
        public string AccessToken { get; init; } = string.Empty;
        public string RefreshToken { get; init; } = string.Empty;
        public required AgentProfile Agent { get; init; }
        public SoftphoneConfig? SoftphoneConfig { get; init; }
    }
}
