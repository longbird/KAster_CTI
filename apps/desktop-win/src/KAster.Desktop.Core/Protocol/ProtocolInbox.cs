namespace KAster.Desktop.Core.Protocol;

/// <summary>
/// 창이 서기 전에 도착한 요청을 붙들어 둔다.
///
/// 앱이 꺼져 있을 때 웹에서 주소를 누르면 요청이 <b>창보다 먼저</b> 온다 — 프로세스 인자로
/// 들어오기 때문이다. 그때 흘려버리면 상담원은 앱만 뜨고 로그인은 안 된 화면을 본다.
///
/// <b>기다리는 것은 마지막 한 건뿐이다.</b> 핸드오프 토큰은 60초 1회용이라, 쌓아 뒀다 순서대로
/// 처리하면 앞의 것들은 이미 만료·소비된 토큰이라 실패하고 그 실패 문구가 성공한 것을 덮는다.
/// </summary>
public sealed class ProtocolInbox
{
    private readonly object _gate = new();

    private ProtocolRequest? _waiting;
    private Action<ProtocolRequest>? _listener;
    private bool _ready;

    public void Enqueue(ProtocolRequest request)
    {
        lock (_gate) _waiting = request;
        Deliver();
    }

    public void Attach(Action<ProtocolRequest> listener)
    {
        lock (_gate) _listener = listener;
        Deliver();
    }

    /// <summary>창이 요청을 처리할 수 있게 됐다.</summary>
    public void MarkReady()
    {
        lock (_gate) _ready = true;
        Deliver();
    }

    private void Deliver()
    {
        ProtocolRequest? request;
        Action<ProtocolRequest>? listener;

        lock (_gate)
        {
            if (!_ready || _listener is null || _waiting is null) return;

            request = _waiting;
            listener = _listener;

            // 꺼내면서 비운다. 남겨 두면 창이 다시 준비됐다고 말할 때 같은 토큰이 두 번 나간다.
            _waiting = null;
        }

        listener(request);
    }
}
