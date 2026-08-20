using System.Net;
using System.Net.Http.Headers;
using KAster.Desktop.Core.Storage;

namespace KAster.Desktop.Core.Server;

/// <summary>
/// 모든 REST 요청에 Bearer 를 붙이고, 401 이면 한 번만 토큰을 회전한 뒤 원요청을 한 번 재시도한다.
///
/// 은행 창구에 비유하면, 번호표가 만료됐을 때 줄 서 있는 사람 전원이 새 번호표를 뽑으러 가는 게 아니라
/// 맨 앞 한 명만 다녀오고 나머지는 그 번호표를 같이 쓰는 것이다. 서버의 refresh 는 회전형이라
/// 동시에 여러 번 부르면 뒤의 것들이 전부 실패하고 로그아웃된다.
/// </summary>
public sealed class TokenRefreshHandler : DelegatingHandler
{
    private readonly ITokenStore _store;
    private readonly Func<string, CancellationToken, Task<TokenPair?>> _refresh;
    private readonly SemaphoreSlim _gate = new(1, 1);

    public TokenRefreshHandler(ITokenStore store, Func<string, CancellationToken, Task<TokenPair?>> refresh)
    {
        _store = store;
        _refresh = refresh;
    }

    /// <summary>회전에 실패해 재로그인이 필요해졌을 때 오른다.</summary>
    public event EventHandler? SignedOut;

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
    {
        var buffered = await BufferBodyAsync(request, ct);
        var used = _store.Load()?.AccessToken;

        var response = await SendOnceAsync(request, used, buffered, ct);
        if (response.StatusCode != HttpStatusCode.Unauthorized)
        {
            return response;
        }

        var rotated = await RotateAsync(used, ct);
        if (rotated is null)
        {
            return response;
        }

        response.Dispose();
        return await SendOnceAsync(request, rotated.AccessToken, buffered, ct);
    }

    private async Task<TokenPair?> RotateAsync(string? staleAccessToken, CancellationToken ct)
    {
        await _gate.WaitAsync(ct);
        try
        {
            var current = _store.Load();
            if (current is null)
            {
                return null;
            }

            // 다른 요청이 이미 회전을 끝냈으면 그 결과를 그대로 쓴다.
            if (current.AccessToken != staleAccessToken)
            {
                return current;
            }

            var rotated = await _refresh(current.RefreshToken, ct);
            if (rotated is null)
            {
                _store.Clear();
                SignedOut?.Invoke(this, EventArgs.Empty);
                return null;
            }

            _store.Save(rotated);
            return rotated;
        }
        finally
        {
            _gate.Release();
        }
    }

    private static async Task<byte[]?> BufferBodyAsync(HttpRequestMessage request, CancellationToken ct)
        => request.Content is null ? null : await request.Content.ReadAsByteArrayAsync(ct);

    private async Task<HttpResponseMessage> SendOnceAsync(
        HttpRequestMessage original,
        string? accessToken,
        byte[]? body,
        CancellationToken ct)
    {
        // HttpRequestMessage 는 한 번만 보낼 수 있으므로 재시도할 때마다 복제한다.
        using var clone = new HttpRequestMessage(original.Method, original.RequestUri);
        foreach (var header in original.Headers)
        {
            clone.Headers.TryAddWithoutValidation(header.Key, header.Value);
        }

        if (body is not null)
        {
            clone.Content = new ByteArrayContent(body);
            foreach (var header in original.Content!.Headers)
            {
                clone.Content.Headers.TryAddWithoutValidation(header.Key, header.Value);
            }
        }

        if (!string.IsNullOrEmpty(accessToken))
        {
            clone.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        }

        return await base.SendAsync(clone, ct);
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _gate.Dispose();
        }

        base.Dispose(disposing);
    }
}
