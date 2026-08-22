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

    private CallOffer? _offer;

    public OfferViewModel(
        CallStateStore store,
        CtiServerClient server,
        Action<string?> notify,
        Action<Task> track)
    {
        _store = store;
        _server = server;
        _notify = notify;
        _track = track;

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
        _offer = offer;
        Raise(nameof(HasOffer));
        Raise(nameof(OfferPhoneNumber));
        AcceptOfferCommand.RaiseCanExecuteChanged();
        RejectOfferCommand.RaiseCanExecuteChanged();

        Changed?.Invoke(this, offer);
    }
}
