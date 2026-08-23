using System.Net.Http;
using KAster.Desktop.Core.Contracts;
using KAster.Desktop.Core.Server;

namespace KAster.Desktop.App.ViewModels;

/// <summary>
/// 지금 당겨받을 수 있는 전화. 큐에서 기다리거나 남의 자리에서 울리는 것들이다.
/// 내가 통화 중이면 비운다 — 남의 전화를 당기면 내 전화까지 놓친다.
/// </summary>
public sealed class WaitingCallsViewModel : ObservableObject
{
    private readonly CtiServerClient _server;
    private readonly Func<DateTimeOffset> _now;
    private readonly Action<string?> _notify;
    private readonly Action<string> _note;
    private readonly Action<Task> _track;

    /// <summary>통화가 걸려 있지 않은 상태. 당겨받기는 이때만 뜻이 있다.</summary>
    private readonly Func<bool> _isFree;

    /// <summary>
    /// 훑어 온 진행 중인 통화를 알린다. 돌려줄 상대가 지금 통화 중인지 가르는 데 같은 조회를 쓴다 —
    /// 같은 것을 두 번 물어보지 않으려고 여기서 넘긴다.
    /// </summary>
    private readonly Action<IReadOnlyList<ActiveCall>> _onActiveCalls;

    private IReadOnlyList<WaitingCall> _waitingCalls = Array.Empty<WaitingCall>();
    private DateTimeOffset _nextWaitingLook = DateTimeOffset.MaxValue;
    private int _waitingCallsHidden;
    private WaitingCallLayout _waitingLayout = WaitingCallLayout.List;

    /// <summary>당겨받을 전화를 다시 보는 주기. 울리는 동안 반응해야 하므로 짧다.</summary>
    private const int WaitingLookSeconds = 5;

    /// <summary>
    /// 화면에 한 번에 보일 건수. 이보다 많으면 창이 스크롤된다.
    /// 타일은 한 줄에 둘씩 들어가므로 같은 높이에 더 담긴다.
    /// </summary>
    private const int MaxWaitingCallsAsList = 3;

    private const int MaxWaitingCallsAsTile = 6;

    private int MaxWaitingCallsShown
        => WaitingLayout == WaitingCallLayout.Tile ? MaxWaitingCallsAsTile : MaxWaitingCallsAsList;

    public WaitingCallsViewModel(
        CtiServerClient server,
        Func<DateTimeOffset> now,
        Action<string?> notify,
        Action<string> note,
        Action<Task> track,
        Func<bool> isFree,
        Action<IReadOnlyList<ActiveCall>> onActiveCalls)
    {
        _server = server;
        _now = now;
        _notify = notify;
        _note = note;
        _track = track;
        _isFree = isFree;
        _onActiveCalls = onActiveCalls;

        PickupCommand = new RelayCommand<WaitingCall>(call => _track(PickupAsync(call)));

        // 화면에서 문자열로 넘긴다. 뷰가 enum 을 알 필요가 없다.
        SetWaitingLayoutCommand = new RelayCommand<string>(name =>
            WaitingLayout = string.Equals(name, "tile", StringComparison.OrdinalIgnoreCase)
                ? WaitingCallLayout.Tile
                : WaitingCallLayout.List);
    }

    public RelayCommand<WaitingCall> PickupCommand { get; }

    public RelayCommand<string> SetWaitingLayoutCommand { get; }

    public IReadOnlyList<WaitingCall> WaitingCalls
    {
        get => _waitingCalls;
        private set
        {
            if (!Set(ref _waitingCalls, value)) return;
            Raise(nameof(HasWaitingCalls));
        }
    }

    public bool HasWaitingCalls => WaitingCalls.Count > 0;

    /// <summary>자리에 안 들어가 못 보여 준 건수. 0 이면 다 보이고 있다는 뜻이다.</summary>
    public int WaitingCallsHidden
    {
        get => _waitingCallsHidden;
        private set
        {
            if (!Set(ref _waitingCallsHidden, value)) return;
            Raise(nameof(WaitingCallsHiddenText));
        }
    }

    public string WaitingCallsHiddenText
        => WaitingCallsHidden > 0 ? $"외 {WaitingCallsHidden}건" : string.Empty;

    /// <summary>목록으로 볼지 타일로 볼지. 대기가 쌓이면 타일이 한눈에 들어온다.</summary>
    public WaitingCallLayout WaitingLayout
    {
        get => _waitingLayout;
        set
        {
            if (!Set(ref _waitingLayout, value)) return;

            Raise(nameof(ShowsWaitingAsList));
            Raise(nameof(ShowsWaitingAsTile));
        }
    }

    public bool ShowsWaitingAsList => WaitingLayout == WaitingCallLayout.List;

    public bool ShowsWaitingAsTile => WaitingLayout == WaitingCallLayout.Tile;

    /// <summary>로그인이 끝났다. 다음 Tick 부터 훑기 시작한다.</summary>
    public void StartLooking() => _nextWaitingLook = _now();

    /// <summary>
    /// 큐를 한 번 훑은 결과. 새로 들어온 것만이 아니라 <b>지금 기다리는 전체</b>를 함께 넘긴다 —
    /// 알림을 띄운 전화가 아직 기다리는지는 전체를 봐야 알 수 있고, 안 기다리면 알림을 내려야 한다.
    ///
    /// <b>알릴지 말지는 여기서 정하지 않는다</b> — 상담원의 상태를 아는 통화 화면이 정한다.
    /// </summary>
    public event EventHandler<WaitingCallsLook>? Looked;

    /// <summary>
    /// 지난번에 본 대기 통화. 같은 전화가 계속 기다린다고 5초마다 알리면 상담원이
    /// 알림을 꺼 버리고, 그러면 진짜 알림도 못 본다.
    /// </summary>
    private HashSet<string> _seen = new(StringComparer.Ordinal);

    private void NoticeNewcomers(IReadOnlyList<WaitingCall> pickable)
    {
        var now = pickable.Select(call => call.CallId).ToHashSet(StringComparer.Ordinal);
        var newcomers = pickable.Where(call => !_seen.Contains(call.CallId)).ToArray();

        // 끊겼다 다시 들어온 전화는 새 전화다. 그래서 남기지 않고 지금 것으로 갈아 끼운다.
        _seen = now;

        Looked?.Invoke(this, new WaitingCallsLook(pickable, newcomers));
    }

    /// <summary>1초마다 불린다. 주기가 됐을 때만 다시 훑는다.</summary>
    public void Tick()
    {
        if (_now() < _nextWaitingLook) return;

        _nextWaitingLook = _now().AddSeconds(WaitingLookSeconds);
        _track(RefreshWaitingCallsAsync());
    }

    /// <summary>
    /// 당겨받을 수 있는 전화를 다시 훑는다. <b>조용히</b> 실패한다 —
    /// 주기 조회가 실패했다고 화면에 오류를 띄우면 통화 알림이 묻힌다.
    /// </summary>
    public async Task RefreshWaitingCallsAsync(CancellationToken ct = default)
    {
        try
        {
            var calls = await _server.GetActiveCallsAsync(ct);
            // 누가 통화 중인지 판단하는 데도 쓴다 — 돌려줄 상대를 고를 때.
            _onActiveCalls(calls);
            var pickable = calls
                .Where(CanBePickedUp)
                .Select(call => new WaitingCall(
                    call.CallId,
                    PhoneNumberFormat.ForDisplay(call.Ani),
                    string.IsNullOrWhiteSpace(call.Customer?.CustomerName) ? null : call.Customer.CustomerName,
                    call.QueueName,
                    BranchLineOf(call)))
                .ToArray();

            NoticeNewcomers(pickable);

            // 창에 스크롤을 만들지 않는다. 넘치는 건수는 숨기지 말고 숫자로 알린다.
            WaitingCallsHidden = Math.Max(0, pickable.Length - MaxWaitingCallsShown);
            WaitingCalls = pickable.Take(MaxWaitingCallsShown).ToArray();
        }
        catch (Exception ex) when (ex is CtiServerException or HttpRequestException or TaskCanceledException)
        {
            // 다음 차례에 다시 본다.
        }
    }

    public async Task PickupAsync(WaitingCall call, CancellationToken ct = default)
    {
        // 목록은 어떤 상태에서도 본다. 다만 <b>당기는 것</b>은 손이 빈 자리만 할 수 있다 —
        // 통화 중에 남의 전화를 당기면 지금 붙어 있는 통화와 새 통화를 함께 놓친다.
        // 이 보호는 예전에 "통화 중이면 목록을 비운다" 로 서 있었다. 목록을 계속 보여 주게
        // 됐으므로 보호도 여기로 옮겨 왔다.
        if (!_isFree())
        {
            _notify("통화 중에는 당겨받을 수 없습니다.");
            return;
        }

        _note($"당겨받기 {call.CallId}");
        await ServerCall.SendAsync(() => _server.PickupAsync(call.CallId, ct), _notify);
    }

    /// <summary>
    /// 고객이 건 곳. 지사가 있으면 지사와 번호를, 없으면 번호만.
    /// 받을지 고르는 데 가장 먼저 필요한 정보다.
    /// </summary>
    private static string BranchLineOf(ActiveCall call)
    {
        var branch = call.BranchName?.Trim() ?? string.Empty;
        var number = PhoneNumberFormat.ForDisplay(
            call.RepresentativeNumber ?? call.DidNumber ?? call.Dnis);

        if (branch.Length == 0) return number;
        return number.Length == 0 ? branch : $"{branch} · {number}";
    }

    /// <summary>
    /// 서버는 큐 대기 또는 상담원 호출 중인 통화만 당겨받게 해 준다.
    /// 이미 누가 받은 통화를 목록에 띄우면 눌러도 거부당한다.
    /// </summary>
    private static bool CanBePickedUp(ActiveCall call)
        => call.SessionStatus is SessionStatus.Queued or SessionStatus.RingingAgent;
}
