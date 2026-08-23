using System.Net;
using System.Text;
using System.Text.Json;
using KAster.Desktop.Core.Protocol;

namespace KAster.Desktop.App.Services;

/// <summary>
/// 웹앱이 "이 PC 에 상담원 앱이 떠 있는가" 를 확인하고, 넘긴 세션이 어떻게 됐는지 되물어 보는 자리.
///
/// <para>
/// 이것이 없으면 <c>apps/web/src/utils/desktopBridge.ts</c> 의 <c>ensureDesktopAgentReady()</c> 가
/// 6번 찔러 보고 <b>"설치하고 실행해 주세요"</b> 를 띄운다 — 앱이 켜져 있고 프로토콜도 걸려 있는데도.
/// 이어지는 <c>waitForDesktopHandoff()</c> 도 영영 <c>connected</c> 를 못 본다.
/// </para>
///
/// <para>
/// <b>127.0.0.1 에만 연다.</b> 0.0.0.0 에 열면 같은 망의 아무 PC 나 이 상담원 자리의 상태를 읽는다.
/// 그래도 이 PC 의 브라우저가 여는 아무 웹페이지나 두드릴 수 있는 자리이므로,
/// <b>웹앱이 실제로 쓰는 두 길만</b> 연다. Electron 판에 있던 <c>/diagnostics</c> 는 옮기지 않았다 —
/// 아무 페이지나 읽을 수 있는 곳에 내부 상태를 두지 않는다. pid 도 내보내지 않는다.
/// </para>
/// </summary>
public sealed class DesktopBridgeServer : IDisposable
{
    /// <summary>웹앱에 박혀 있는 값. 바꾸려면 그쪽과 함께 바꾼다.</summary>
    public const int DefaultPort = 48125;

    private readonly HandoffStatusBoard _board;
    private readonly Action<string> _note;
    private HttpListener? _listener;

    public DesktopBridgeServer(
        HandoffStatusBoard board,
        int port = DefaultPort,
        Action<string>? note = null)
    {
        _board = board;
        Port = port;
        _note = note ?? (_ => { });
    }

    public int Port { get; }

    public bool IsRunning => _listener?.IsListening == true;

    /// <summary>
    /// 포트를 이미 누가 잡고 있으면(Electron 판을 함께 켜 둔 기간) <b>조용히 접는다.</b>
    /// 브리지는 편의 기능이고, 이것 때문에 상담원 앱이 안 뜨면 전화를 못 받는다.
    /// </summary>
    public void Start()
    {
        if (IsRunning) return;

        var listener = new HttpListener();
        listener.Prefixes.Add($"http://127.0.0.1:{Port}/");

        try
        {
            listener.Start();
        }
        catch (Exception ex) when (ex is HttpListenerException or ObjectDisposedException)
        {
            _note($"웹 연동 포트를 열지 못했다 ({Port}): {ex.Message}");
            listener.Close();
            return;
        }

        _listener = listener;
        _ = Task.Run(() => AcceptLoopAsync(listener));
    }

    private async Task AcceptLoopAsync(HttpListener listener)
    {
        while (listener.IsListening)
        {
            HttpListenerContext context;
            try
            {
                context = await listener.GetContextAsync();
            }
            catch (Exception ex) when (ex is HttpListenerException or ObjectDisposedException or InvalidOperationException)
            {
                return; // 닫혔다. 정상 종료다.
            }

            // 한 요청이 잘못돼도 다음 요청은 받아야 한다.
            try
            {
                Respond(context);
            }
            catch (Exception ex)
            {
                _note($"웹 연동 요청 처리 실패: {ex.Message}");
                TryClose(context);
            }
        }
    }

    private void Respond(HttpListenerContext context)
    {
        var request = context.Request;

        // 다른 출처에서 부르는 요청이다. 이 헤더가 없으면 브라우저가 응답을 못 읽고
        // fetch 가 실패로 떨어진다 — 200 을 줬는데도 웹은 "앱이 없다" 로 읽는다.
        var headers = context.Response.Headers;
        headers["Access-Control-Allow-Origin"] = "*";
        headers["Cache-Control"] = "no-store";

        if (string.Equals(request.HttpMethod, "OPTIONS", StringComparison.OrdinalIgnoreCase))
        {
            // 크롬은 공개 페이지가 사설망을 부를 때 먼저 물어본다. 여기서 막히면 본 요청이 안 나간다.
            headers["Access-Control-Allow-Methods"] = "GET, OPTIONS";
            headers["Access-Control-Allow-Headers"] = "*";
            headers["Access-Control-Allow-Private-Network"] = "true";
            headers["Access-Control-Max-Age"] = "600";
            Write(context, HttpStatusCode.NoContent, null);
            return;
        }

        var path = request.Url?.AbsolutePath.TrimEnd('/') ?? string.Empty;

        if (string.Equals(request.HttpMethod, "GET", StringComparison.OrdinalIgnoreCase))
        {
            if (path == "/health")
            {
                Write(context, HttpStatusCode.OK, new
                {
                    ok = true,
                    status = "ok",
                    app = "kaster-agent-desktop",
                    protocol = "kaster-agent",
                });
                return;
            }

            if (path == "/handoff-status")
            {
                // 토큰은 되돌려 주지 않는다. 웹앱이 읽지 않는 값이고, 아무나 보낸 문자열을
                // 그대로 되비칠 이유가 없다.
                var status = _board.Find(request.QueryString["handoffToken"]);
                Write(context, HttpStatusCode.OK, status is null
                    ? new { ok = true, state = "unknown", reason = (string?)null }
                    : new { ok = true, state = status.Wire, reason = status.Reason });
                return;
            }
        }

        Write(context, HttpStatusCode.NotFound, new { ok = false });
    }

    private static void Write(HttpListenerContext context, HttpStatusCode status, object? body)
    {
        var response = context.Response;
        response.StatusCode = (int)status;

        if (body is null)
        {
            response.ContentLength64 = 0;
            response.Close();
            return;
        }

        var payload = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(body));
        response.ContentType = "application/json; charset=utf-8";
        response.ContentLength64 = payload.Length;
        response.OutputStream.Write(payload, 0, payload.Length);
        response.Close();
    }

    private static void TryClose(HttpListenerContext context)
    {
        try { context.Response.Abort(); } catch { /* 이미 닫혔다 */ }
    }

    public void Dispose()
    {
        var listener = _listener;
        _listener = null;
        if (listener is null) return;

        try { listener.Stop(); } catch { /* 이미 닫혔다 */ }
        listener.Close();
    }
}
