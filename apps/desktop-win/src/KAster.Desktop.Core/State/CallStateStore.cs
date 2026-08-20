using KAster.Desktop.Core.Contracts;

namespace KAster.Desktop.Core.State;

public enum LocalSipState
{
    Incoming,
    Established,
}

/// <summary>로컬 SIP 다이얼로그. 미디어 제어용이며 화면 상태의 근거가 아니다.</summary>
public sealed record LocalSipCall(
    string DialogId,
    string RemoteNumber,
    DateTimeOffset ArrivedAt,
    LocalSipState State);

/// <summary>화면이 보는 현재 통화. 서버 쪽과 로컬 SIP 쪽을 같이 들고 있다.</summary>
public sealed record CurrentCall
{
    public ActiveCall? Server { get; init; }
    public LocalSipCall? Sip { get; init; }
    public bool IsPaired { get; init; }
}

/// <summary>
/// 서버 이벤트와 로컬 SIP 다이얼로그를 하나의 현재 통화로 합친다.
///
/// 관제탑과 조종석에 비유하면, 조종석(SIP)은 지금 엔진이 도는지를 알고 관제탑(서버)은 이 비행기가
/// 어느 편명이고 승객이 누구인지를 안다. 둘이 다르면 편명·상태는 **관제탑을 따른다.**
///
/// 규칙
/// 1. 상태·callId·고객 정보의 진실원은 서버다.
/// 2. 수신 INVITE 와 <c>call.created</c> 는 순서가 뒤집힐 수 있어 발신번호 + 도착 시각 창으로 짝짓는다.
/// 3. 짝을 못 찾으면 SIP 는 미디어만 제어하고 화면은 서버를 따른다.
/// 4. <c>call.ended</c> 가 오면 다이얼로그가 살아 있어도 화면은 종료로 간다.
/// </summary>
public sealed class CallStateStore
{
    private static readonly TimeSpan DefaultPairingWindow = TimeSpan.FromSeconds(5);

    private readonly string _agentId;
    private readonly Func<DateTimeOffset> _now;
    private readonly TimeSpan _pairingWindow;
    private readonly object _gate = new();

    private ActiveCall? _server;
    private DateTimeOffset? _serverReceivedAt;
    private LocalSipCall? _sip;
    private bool _paired;

    public CallStateStore(string agentId, Func<DateTimeOffset> now, TimeSpan? pairingWindow = null)
    {
        _agentId = agentId;
        _now = now;
        _pairingWindow = pairingWindow ?? DefaultPairingWindow;
    }

    public event EventHandler<CurrentCall?>? CurrentCallChanged;

    public CurrentCall? Current { get; private set; }

    public void Apply(CtiEvent evt)
    {
        switch (evt)
        {
            case CallCreatedEvent created:
                AdoptServerCall(created.Call);
                break;
            case CallUpdatedEvent updated:
                AdoptServerCall(updated.Call);
                break;
            case CallEndedEvent ended:
                EndServerCall(ended.Call);
                break;
            case ScreenPopEvent pop:
                AttachCustomer(pop);
                break;
        }
    }

    public void OnSipIncoming(string dialogId, string remoteNumber)
    {
        Mutate(() =>
        {
            _sip = new LocalSipCall(dialogId, remoteNumber, _now(), LocalSipState.Incoming);
            _paired = CanPair();
        });
    }

    public void OnSipEstablished(string dialogId)
    {
        Mutate(() =>
        {
            if (_sip?.DialogId != dialogId) return;
            _sip = _sip with { State = LocalSipState.Established };
        });
    }

    public void OnSipEnded(string dialogId)
    {
        Mutate(() =>
        {
            if (_sip?.DialogId != dialogId) return;
            _sip = null;
            _paired = false;
        });
    }

    private void AdoptServerCall(ActiveCall call)
    {
        Mutate(() =>
        {
            // 다른 상담원에게 배정된 통화는 이 클라이언트의 관심사가 아니다.
            if (call.PrimaryAgentId is not null && call.PrimaryAgentId != _agentId) return;

            // 이미 다른 통화를 들고 있으면 그 통화의 갱신만 받는다.
            if (_server is not null && _server.CallId != call.CallId) return;

            // 화면 팝업으로 붙여 둔 고객 정보를 서버 갱신이 지우지 않게 한다.
            _server = call.Customer is null && _server?.Customer is not null
                ? call with { Customer = _server.Customer }
                : call;
            _serverReceivedAt = _now();
            _paired = CanPair();
        });
    }

    private void EndServerCall(ActiveCall call)
    {
        Mutate(() =>
        {
            if (_server is not null && _server.CallId != call.CallId) return;

            _server = null;
            _serverReceivedAt = null;
            _sip = null;
            _paired = false;
        });
    }

    private void AttachCustomer(ScreenPopEvent pop)
    {
        Mutate(() =>
        {
            if (_server is null || _server.CallId != pop.CallId) return;
            _server = _server with { Customer = pop.Customer };
        });
    }

    private bool CanPair()
    {
        if (_server is null || _sip is null || _serverReceivedAt is null) return false;

        var apart = _sip.ArrivedAt - _serverReceivedAt.Value;
        if (apart < TimeSpan.Zero) apart = apart.Negate();
        if (apart > _pairingWindow) return false;

        return SameNumber(_server.Ani, _sip.RemoteNumber);
    }

    /// <summary>
    /// 발신번호 비교. SIP From 은 <c>+82</c> 접두나 하이픈이 붙어 올 수 있으므로 숫자만 남겨
    /// 뒤 8자리로 맞춰 본다. 국내 번호는 뒤 8자리가 사실상 유일하다.
    /// </summary>
    private static bool SameNumber(string? left, string? right)
    {
        var a = Digits(left);
        var b = Digits(right);
        if (a.Length == 0 || b.Length == 0) return false;
        if (a == b) return true;

        const int TailLength = 8;
        if (a.Length < TailLength || b.Length < TailLength) return false;
        return a[^TailLength..] == b[^TailLength..];
    }

    private static string Digits(string? value)
        => value is null ? string.Empty : new string(value.Where(char.IsAsciiDigit).ToArray());

    private void Mutate(Action change)
    {
        CurrentCall? snapshot;
        lock (_gate)
        {
            var before = Current;
            change();

            snapshot = _server is null && _sip is null
                ? null
                : new CurrentCall { Server = _server, Sip = _sip, IsPaired = _paired };

            if (snapshot == before) return;
            Current = snapshot;
        }

        CurrentCallChanged?.Invoke(this, snapshot);
    }
}
