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
    private readonly string _extension;
    private readonly Func<DateTimeOffset> _now;
    private readonly TimeSpan _pairingWindow;
    private readonly object _gate = new();

    private ActiveCall? _server;
    private DateTimeOffset? _serverReceivedAt;
    private LocalSipCall? _sip;
    private bool _paired;
    private DateTimeOffset? _expectOutboundUntil;

    public CallStateStore(
        string agentId,
        Func<DateTimeOffset> now,
        TimeSpan? pairingWindow = null,
        string extension = "")
    {
        _agentId = agentId;
        _extension = extension.Trim();
        _now = now;
        _pairingWindow = pairingWindow ?? DefaultPairingWindow;
    }

    public event EventHandler<CurrentCall?>? CurrentCallChanged;

    /// <summary>큐가 물어보는 호. 없으면 null.</summary>
    public event EventHandler<CallOffer?>? OfferChanged;

    public CurrentCall? Current { get; private set; }

    public CallOffer? CurrentOffer { get; private set; }

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
            case CallOfferedEvent offered:
                SetOffer(offered.Offer);
                break;
            case CallOfferClosedEvent closed:
                ClearOffer(closed.OfferId);
                break;
        }
    }

    /// <summary>
    /// 제안은 테넌트 전체로 뿌려진다. 내 내선이 아니면 화면에 띄우지 않는다 —
    /// 띄우면 옆자리로 간 호를 대신 받아 버린다.
    /// </summary>
    private void SetOffer(CallOffer offer)
    {
        if (_extension.Length > 0 && !string.Equals(offer.Extension.Trim(), _extension, StringComparison.Ordinal))
        {
            return;
        }

        CurrentOffer = offer;
        OfferChanged?.Invoke(this, offer);
    }

    /// <summary>
    /// 끝난 제안만 내린다. 다음 제안이 이미 떠 있는데 앞 제안의 종료가 늦게 오면,
    /// 그걸로 화면을 지워 상담원이 새 호를 못 보게 된다.
    /// </summary>
    private void ClearOffer(string offerId)
    {
        if (CurrentOffer is null) return;
        if (!string.Equals(CurrentOffer.OfferId, offerId, StringComparison.Ordinal)) return;

        CurrentOffer = null;
        OfferChanged?.Invoke(this, null);
    }

    /// <summary>제안을 수락하거나 거절해서 더 볼 일이 없다.</summary>
    public void DismissOffer()
    {
        if (CurrentOffer is null) return;

        CurrentOffer = null;
        OfferChanged?.Invoke(this, null);
    }

    /// <summary>
    /// 발신을 요청했다. 곧 서버가 만들어 줄 통화는 아직 아무에게도 배정돼 있지 않지만 우리 것이다.
    ///
    /// 기한을 두는 이유는, 발신이 실패해 아무 통화도 안 왔을 때 이 상태가 남아 있다가
    /// 한참 뒤 큐에 들어온 남의 전화를 우리 화면에 띄우는 것을 막기 위해서다.
    /// </summary>
    public void ExpectOutboundCall(TimeSpan window)
        => Mutate(() => _expectOutboundUntil = _now() + window);

    private bool IsExpectingOutbound()
        => _expectOutboundUntil is { } until && _now() <= until;

    /// <summary>이미 들고 있는 통화의 갱신이면 배정 여부와 무관하게 받는다.</summary>
    private bool HoldsCall(string callId) => _server?.CallId == callId;

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

            // 배정된 사람이 없는 통화는 큐에서 기다리는 중이거나 방금 만들어진 것이다.
            // 그걸 자기 전화로 띄우면 그 큐의 모든 상담원 화면이 같은 통화로 덮이고 받기 경쟁이 난다.
            // 그런 통화가 우리 것인 경우는 하나뿐이다 — 우리가 방금 걸었을 때.
            // (배정되면 서버가 RINGING_AGENT 로 바꾸며 primaryAgentId 를 채운다.)
            if (call.PrimaryAgentId is null && !IsExpectingOutbound() && !HoldsCall(call.CallId)) return;

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
            _expectOutboundUntil = null;
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
