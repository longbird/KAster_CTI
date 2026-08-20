using System.Net;

namespace KAster.Desktop.Tests.Server;

/// <summary>
/// 테스트용 HTTP 종단. 큐에 넣은 순서대로 돌려주거나, 요청을 보고 판단하는 함수를 걸 수 있다.
/// 경합 테스트에서는 순서가 보장되지 않으므로 <see cref="RespondWith"/> 를 쓴다.
/// </summary>
public sealed class StubHttpHandler : HttpMessageHandler
{
    private readonly Queue<Func<HttpRequestMessage, HttpResponseMessage>> _responses = new();
    private readonly List<HttpRequestMessage> _requests = new();
    private readonly List<string?> _bodies = new();
    private readonly object _gate = new();
    private Func<HttpRequestMessage, HttpResponseMessage>? _always;

    public IReadOnlyList<HttpRequestMessage> Requests
    {
        get { lock (_gate) return _requests.ToArray(); }
    }

    /// <summary>요청 본문. 요청 객체는 전송 후 폐기되므로 문자열로 따로 남긴다.</summary>
    public IReadOnlyList<string?> Bodies
    {
        get { lock (_gate) return _bodies.ToArray(); }
    }

    public StubHttpHandler Enqueue(HttpStatusCode status, string json)
    {
        lock (_gate) _responses.Enqueue(_ => Json(status, json));
        return this;
    }

    public StubHttpHandler RespondWith(Func<HttpRequestMessage, HttpResponseMessage> responder)
    {
        lock (_gate) _always = responder;
        return this;
    }

    public static HttpResponseMessage Json(HttpStatusCode status, string json) =>
        new(status) { Content = new StringContent(json, System.Text.Encoding.UTF8, "application/json") };

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
    {
        // 요청 객체는 전송 뒤 폐기되므로 본문은 여기서 읽어 둔다.
        var body = request.Content is null ? null : await request.Content.ReadAsStringAsync(ct);

        lock (_gate)
        {
            _requests.Add(request);
            _bodies.Add(body);
            if (_always is not null) return _always(request);
            if (_responses.Count == 0) throw new InvalidOperationException("스텁에 남은 응답이 없다");
            return _responses.Dequeue()(request);
        }
    }
}
