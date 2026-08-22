using KAster.Desktop.Core.Contracts;
using KAster.Desktop.Core.Server;
using KAster.Desktop.Core.State;

namespace KAster.Desktop.App.ViewModels;

/// <summary>
/// 큐가 넘기기 전에 물어보는 호. 수락해야 전화기가 연결되고, 그 전까지 고객은
/// 큐에서 대기음을 듣고 있다.
///
/// 창 모양은 여기서 정하지 않는다 — 제안이 떴다/내려갔다만 <see cref="Changed"/> 로 알리고,
/// 그걸 듣는 통화 화면이 창을 정한다. 그렇지 않으면 창의 진실원이 둘이 된다.
/// </summary>
public sealed class OfferViewModel : ObservableObject
{
    private readonly CallStateStore _store;
    private readonly CtiServerClient _server;
    private readonly Action<string?> _notify;
    private readonly Action<Task> _track;
    private readonly Action<string> _note;
    private readonly Func<DateTimeOffset> _now;

    private CallOffer? _offer;

    /// <summary>이 제안이 화면에 뜬 시각. 몇 초 서 있었는지를 로그에 남기는 데 쓴다.</summary>
    private DateTimeOffset? _shownAt;

    /// <summary>이 시각이 지나면 서버가 다음 상담원에게 넘긴다. 대기 시간을 안 내려주면 없다.</summary>
    private DateTimeOffset? _deadline;

    private int _secondsRemaining;

    /// <param name="now">
    /// 남은 시간 계산용 시계. 테스트가 시간을 밀 수 있어야 한다.
    /// 안 넘기면 실제 시계를 쓴다 — 통화 화면이 쓰는 값과 같다.
    /// </param>
    /// <param name="note">
    /// 통화 흐름 기록. 제안이 언제 떴고 언제 내려갔는지를 남긴다 —
    /// "옆자리는 남아 있는데 내 것만 일찍 꺼졌다" 는 신고를 화면 캡처 없이 가르는 유일한 단서다.
    /// </param>
    public OfferViewModel(
        CallStateStore store,
        CtiServerClient server,
        Action<string?> notify,
        Action<Task> track,
        Action<string> note,
        Func<DateTimeOffset>? now = null)
    {
        _store = store;
        _server = server;
        _notify = notify;
        _track = track;
        _note = note;
        _now = now ?? (() => DateTimeOffset.UtcNow);

        AcceptOfferCommand = new RelayCommand(() => _track(RespondToOfferAsync(accept: true)), () => HasOffer);
        RejectOfferCommand = new RelayCommand(() => _track(RespondToOfferAsync(accept: false)), () => HasOffer);

        _store.OfferChanged += (_, offer) => OnOfferChanged(offer);
    }

    /// <summary>제안이 뜨거나 내려갔다. 창을 어떻게 할지는 듣는 쪽이 정한다.</summary>
    public event EventHandler<CallOffer?>? Changed;

    /// <summary>
    /// 큐가 물어보는 호가 떠 있는가. 수락해야 전화기가 연결되고, 그 전까지 고객은
    /// 큐에서 대기음을 듣고 있다.
    /// </summary>
    public bool HasOffer => _offer is not null;

    /// <summary>제안된 고객 번호. 발신번호 표시제한이면 "번호 없음".</summary>
    public string OfferPhoneNumber
    {
        get
        {
            var shown = PhoneNumberFormat.ForDisplay(_offer?.Caller);
            return shown.Length > 0 ? shown : "번호 없음";
        }
    }

    /// <summary>남은 시간을 띄울 수 있는가. 서버가 대기 시간을 안 내려주면 아무것도 안 띄운다.</summary>
    public bool HasCountdown => _deadline is not null;

    /// <summary>몇 초 안에 눌러야 하는가. 0 아래로는 안 내려간다.</summary>
    public int SecondsRemaining => _secondsRemaining;

    /// <summary>화면에 그대로 쓰는 문구. 띄울 것이 없으면 빈 문자열이라 화면에서 접힌다.</summary>
    public string CountdownText => _deadline is null
        ? string.Empty
        : _secondsRemaining > 0 ? $"{_secondsRemaining}초 남음" : "대기 시간 초과";

    /// <summary>
    /// 남은 시간을 다시 그린다. 1초 타이머가 부른다.
    ///
    /// 값을 깎지 않고 매번 시계로 다시 계산한다 — 그래서 몇 번 불리든, 타이머가 밀려
    /// 몇 초를 건너뛰어도 화면에 뜨는 숫자가 같다.
    /// </summary>
    public void Tick()
    {
        var remaining = Remaining();
        if (remaining == _secondsRemaining) return;

        _secondsRemaining = remaining;
        Raise(nameof(SecondsRemaining));
        Raise(nameof(CountdownText));
    }

    public RelayCommand AcceptOfferCommand { get; }

    public RelayCommand RejectOfferCommand { get; }

    /// <summary>
    /// 수락하거나 거절한다. 응답을 서버가 받든 못 받든 화면에서는 내린다 —
    /// 누른 뒤에도 버튼이 남아 있으면 상담원이 다시 누른다.
    /// </summary>
    public async Task RespondToOfferAsync(bool accept)
    {
        var offer = _offer;
        if (offer is null) return;

        _store.DismissOffer();

        try
        {
            await _server.RespondToOfferAsync(offer.Linkedid, offer.Extension, accept, CancellationToken.None);
        }
        catch (Exception ex)
        {
            _notify($"응답을 보내지 못했습니다: {ex.Message}");
        }
    }

    private void OnOfferChanged(CallOffer? offer)
    {
        // 내려간 제안의 값은 덮어쓰기 전에 챙긴다. 남은 시간은 마지막으로 화면에 뜬 값이라,
        // 여기서 다시 계산하면 상담원이 실제로 본 숫자가 아니게 된다.
        var previous = _offer;
        var previousShownAt = _shownAt;
        var previousRemaining = _secondsRemaining;

        _offer = offer;

        // 서버가 제안마다 대기 시간을 내려준다. 기준은 서버 시각이 아니라 이 화면에 뜬 시각이다 —
        // 상담원 PC 시계가 서버와 어긋나 있어도 화면에 음수나 엉뚱한 큰 수가 뜨지 않는다.
        _deadline = offer is { TimeoutSeconds: > 0 }
            ? _now().AddSeconds(offer.TimeoutSeconds)
            : null;
        _secondsRemaining = Remaining();

        Raise(nameof(HasOffer));
        Raise(nameof(OfferPhoneNumber));
        Raise(nameof(HasCountdown));
        Raise(nameof(SecondsRemaining));
        Raise(nameof(CountdownText));
        AcceptOfferCommand.RaiseCanExecuteChanged();
        RejectOfferCommand.RaiseCanExecuteChanged();

        if (offer is not null)
        {
            _shownAt = _now();
            _note($"제안 표시 offerId={offer.OfferId} 발신={offer.Caller} 대기={offer.TimeoutSeconds}초");
        }
        else if (previous is not null)
        {
            var stood = previousShownAt is { } at ? (int)Math.Round((_now() - at).TotalSeconds) : -1;
            _shownAt = null;
            _note($"제안 내림 offerId={previous.OfferId} 표시={stood}초 남음표시={previousRemaining}초");
        }

        Changed?.Invoke(this, offer);
    }

    /// <summary>
    /// 0 에서 멈추고 제안은 그대로 둔다. 제안을 닫는 진실원은 서버의 <c>agent.offer.closed</c> 다 —
    /// 카운트다운은 표시일 뿐이라, 0 이 됐다고 여기서 제안을 지우면 서버가 아직 안 닫은 제안을
    /// 화면만 지워 상담원이 받을 수 있는 전화를 놓친다.
    /// </summary>
    private int Remaining()
    {
        if (_deadline is not { } deadline) return 0;

        var left = (deadline - _now()).TotalSeconds;
        return left <= 0 ? 0 : (int)Math.Ceiling(left);
    }
}
