using System.Net.Http.Json;
using KAster.Desktop.Core.Contracts;
using KAster.Desktop.Core.Serialization;
using KAster.Desktop.Core.Storage;

namespace KAster.Desktop.Core.Server;

public sealed record LoginResult(TokenPair Tokens, SessionSummary Session);

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

    public async Task<SessionSummary> GetSessionAsync(CancellationToken ct)
    {
        using var response = await _http.GetAsync("me/session", ct);
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
