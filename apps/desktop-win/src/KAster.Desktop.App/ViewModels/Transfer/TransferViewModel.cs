using KAster.Desktop.Core.Contracts;
using KAster.Desktop.Core.Server;
using KAster.Desktop.Core.State;

namespace KAster.Desktop.App.ViewModels;

/// <summary>
/// 통화를 다른 상담원에게 돌려준다. 두 갈래가 있다 —
/// blind 는 협의 없이 바로 넘어가고, attended 는 상대에게 먼저 사정을 말하고 넘긴다.
/// <b>대상 고르기는 둘이 같고 마지막 동작만 다르다.</b>
///
/// 창 모양은 여기서 정하지 않는다 — 화면을 열었다(<see cref="Started"/>)/닫았다(<see cref="Ended"/>)만
/// 알리고, 그걸 듣는 통화 화면이 창을 정한다.
/// </summary>
public sealed class TransferViewModel : ObservableObject
{
    private readonly CallStateStore _store;
    private readonly CtiServerClient _server;
    private readonly Func<DateTimeOffset> _now;
    private readonly Action<string?> _notify;
    private readonly Action<Task> _track;

    /// <summary>내 내선. 자기 자신에게 돌려주는 것은 뜻이 없어 목록에서 뺀다.</summary>
    private readonly string _myExtension;

    private IReadOnlyList<AgentDirectoryEntry> _directory = Array.Empty<AgentDirectoryEntry>();
    private IReadOnlyList<ActiveCall> _activeCalls = Array.Empty<ActiveCall>();
    private TransferStage _stage = TransferStage.Closed;
    private string _transferFilter = string.Empty;

    /// <summary>협의를 건 상대. 목록이 사라진 뒤에도 누구와 이야기 중인지 화면에 남아야 한다.</summary>
    private TransferTarget? _consultTarget;

    /// <summary>
    /// 완료·취소 요청의 답을 기다리는 기한. 서버는 feature code 를 DTMF 로 넣을 뿐이라
    /// PBX 가 그것을 먹었는지 <b>모른다</b> — 아무 이벤트도 안 오는 경우가 있다.
    /// 기한이 없으면 화면이 영원히 "요청 중" 으로 남아 다시 시도할 방법이 없어진다.
    /// </summary>
    private DateTimeOffset? _confirmationDeadline;

    /// <summary>
    /// 서버가 이 통화를 전환 중이라고 말한 적이 있는가.
    ///
    /// 협의가 끝났다는 판정을 "전환 중에서 벗어났다" 로 하므로, 들어간 것을 본 적이 없으면
    /// 나온 것도 아니다. 이 표시가 없으면 협의를 열자마자 도착한 늦은 통화 상태 하나로
    /// 화면이 닫혀 버린다.
    /// </summary>
    private bool _sawTransferring;

    private const int MaxTransferTargetsShown = 5;

    /// <summary>PBX 응답을 기다리는 한도. 보류와 같은 값을 쓴다.</summary>
    private const int ConfirmationTimeoutSeconds = 5;

    public TransferViewModel(
        CallStateStore store,
        CtiServerClient server,
        string myExtension,
        Func<DateTimeOffset> now,
        Action<string?> notify,
        Action<Task> track)
    {
        _store = store;
        _server = server;
        _myExtension = myExtension;
        _now = now;
        _notify = notify;
        _track = track;

        _store.CurrentCallChanged += (_, call) => OnCurrentCallChanged(call);

        StartTransferCommand = new RelayCommand(
            BeginTransfer,
            () => _store.Current is not null && Stage == TransferStage.Closed);

        // 협의를 열어 둔 채 닫으면 완료도 취소도 누를 자리가 없어진다.
        CancelTransferCommand = new RelayCommand(
            CloseTargetList,
            () => Stage == TransferStage.ChoosingTarget);

        TransferToCommand = new RelayCommand<string>(
            target => _track(TransferToAsync(target)),
            _ => Stage == TransferStage.ChoosingTarget);
        ConsultCommand = new RelayCommand<string>(
            target => _track(ConsultAsync(target)),
            _ => Stage == TransferStage.ChoosingTarget);

        // 협의가 열려 있을 때만 서버가 받아 준다. 그 전에 누르면 무조건 400 이다.
        CompleteTransferCommand = new RelayCommand(
            () => _track(CompleteTransferAsync()),
            () => Stage == TransferStage.Consulting);
        CancelConsultationCommand = new RelayCommand(
            () => _track(CancelConsultationAsync()),
            () => Stage == TransferStage.Consulting);
    }

    /// <summary>돌려주기 화면을 열었다.</summary>
    public event EventHandler? Started;

    /// <summary>돌려주기 화면을 닫았다. 돌아갈 화면은 듣는 쪽이 정한다.</summary>
    public event EventHandler? Ended;

    /// <summary>지금 어느 단계인가. 어떤 버튼이 살아 있는지가 전부 여기서 나온다.</summary>
    public TransferStage Stage
    {
        get => _stage;
        private set
        {
            if (!Set(ref _stage, value)) return;

            Raise(nameof(IsChoosingTransferTarget));
            Raise(nameof(IsTransferScreenOpen));
            Raise(nameof(IsConsulting));
            Raise(nameof(ConsultStatusText));
            Raise(nameof(ConsultTargetLabel));
            Raise(nameof(CompleteButtonText));
            Raise(nameof(CancelConsultButtonText));
            Raise(nameof(TransferTargets));
            Raise(nameof(TransferTargetsHidden));

            StartTransferCommand.RaiseCanExecuteChanged();
            CancelTransferCommand.RaiseCanExecuteChanged();
            TransferToCommand.RaiseCanExecuteChanged();
            ConsultCommand.RaiseCanExecuteChanged();
            CompleteTransferCommand.RaiseCanExecuteChanged();
            CancelConsultationCommand.RaiseCanExecuteChanged();
        }
    }

    /// <summary>
    /// 돌려줄 상대를 고르는 중인가. 통화 화면 대신 대상 목록이 보인다.
    /// </summary>
    public bool IsChoosingTransferTarget => Stage == TransferStage.ChoosingTarget;

    /// <summary>
    /// 돌려주기 화면이 떠 있는가. 대상 목록이든 협의 중이든 통화 화면 대신 이 화면이 보인다.
    /// </summary>
    public bool IsTransferScreenOpen => Stage != TransferStage.Closed;

    /// <summary>협의를 걸어 둔 상태인가. 대상 목록 대신 연결/취소가 보인다.</summary>
    public bool IsConsulting => Stage
        is TransferStage.ConsultRequested
        or TransferStage.Consulting
        or TransferStage.CompleteRequested
        or TransferStage.CancelRequested;

    /// <summary>누구와 협의 중인가. 목록이 사라진 뒤에도 상대를 잊지 않게 남긴다.</summary>
    public string ConsultTargetLabel => _consultTarget is null
        ? string.Empty
        : $"{_consultTarget.Extension} {_consultTarget.AgentName}";

    /// <summary>
    /// 협의가 어디까지 왔는지. <b>상대가 받았는지는 여기에 적지 않는다</b> —
    /// 서버가 협의 단계(CONSULT_RINGING / CONSULT_TALKING)를 클라이언트에 보내지 않으므로
    /// 우리는 그것을 모른다. 모르는 것을 아는 척 적으면 상담원이 빈 자리에 대고 말한다.
    /// </summary>
    public string ConsultStatusText => Stage switch
    {
        TransferStage.ConsultRequested => "협의 요청을 보내는 중입니다.",
        TransferStage.Consulting => "협의를 걸었습니다. 상대가 받았는지는 알 수 없으니 통화로 확인하세요.",
        TransferStage.CompleteRequested => "연결 요청을 보냈습니다. PBX 응답을 기다리는 중입니다.",
        TransferStage.CancelRequested => "취소 요청을 보냈습니다. PBX 응답을 기다리는 중입니다.",
        _ => string.Empty,
    };

    /// <summary>
    /// 연결 버튼의 문구. 요청 중이라는 것과 넘어갔다는 것을 다른 말로 적는다 —
    /// 같은 말로 적으면 안 넘어간 통화를 넘어갔다고 읽게 된다.
    /// </summary>
    public string CompleteButtonText => Stage == TransferStage.CompleteRequested ? "연결 요청 중" : "연결";

    public string CancelConsultButtonText => Stage == TransferStage.CancelRequested ? "취소 요청 중" : "협의 취소";

    /// <summary>
    /// 이름이나 내선으로 좁힌다. 사람이 많으면 창에 다 들어가지 않는데,
    /// 창에 스크롤을 만들지 않는 것이 이 앱의 제약이다.
    /// </summary>
    public string TransferFilter
    {
        get => _transferFilter;
        set
        {
            if (!Set(ref _transferFilter, value)) return;
            Raise(nameof(TransferTargets));
            Raise(nameof(TransferTargetsHidden));
        }
    }

    /// <summary>
    /// 돌려줄 수 있는 상대. 자기 자신은 뺀다 — 자기에게 돌려주는 것은 뜻이 없다.
    /// 받을 수 있는 사람이 위로 온다. 목록이 잘려도 쓸 수 있는 쪽이 남는다.
    /// </summary>
    public IReadOnlyList<TransferTarget> TransferTargets => MatchingTargets()
        .Select(entry => TransferTarget.From(entry, IsOnACall(entry.AgentId)))
        .OrderByDescending(target => target.CanTakeCall)
        .Take(MaxTransferTargetsShown)
        .ToArray();

    /// <summary>창에 못 담아 가린 인원. 숨기지 말고 숫자로 알린다.</summary>
    public int TransferTargetsHidden => Math.Max(0, MatchingTargets().Count() - MaxTransferTargetsShown);

    public RelayCommand StartTransferCommand { get; }

    public RelayCommand CancelTransferCommand { get; }

    public RelayCommand<string> TransferToCommand { get; }

    /// <summary>고른 상대에게 먼저 협의를 건다. attended 의 첫 단계다.</summary>
    public RelayCommand<string> ConsultCommand { get; }

    public RelayCommand CompleteTransferCommand { get; }

    public RelayCommand CancelConsultationCommand { get; }

    /// <summary>
    /// 로그인 직후에 받아 둔 내선 목록을 그대로 쓴다. 이때는 아직 목록이 화면에 없으므로
    /// 알림을 쏘지 않는다 — 열 때 <see cref="RefreshTransferTargetsAsync"/> 가 다시 받는다.
    /// </summary>
    public void UseDirectory(IReadOnlyList<AgentDirectoryEntry> directory) => _directory = directory;

    /// <summary>
    /// 지금 진행 중인 통화들. 서버가 주는 근무 상태는 통화 시작과 함께 바로 바뀌지 않을 수 있어,
    /// 누가 통화 중인지는 이걸로 한 번 더 본다.
    /// </summary>
    public void UseActiveCalls(IReadOnlyList<ActiveCall> calls) => _activeCalls = calls;

    /// <summary>
    /// 1초마다 불린다. PBX 가 feature code 를 안 먹으면 아무 이벤트도 오지 않고 서버는 그것을
    /// 모르므로, 기다림은 여기서 스스로 끝낸다. 협의 자체는 그대로 열려 있으니 협의 상태로 돌린다.
    /// </summary>
    public void Tick()
    {
        if (_confirmationDeadline is not { } due || _now() < due) return;

        var message = Stage == TransferStage.CompleteRequested
            ? "연결 요청에 PBX 가 응답하지 않았다."
            : "협의 취소 요청에 PBX 가 응답하지 않았다.";

        BackToConsulting();
        _notify(message);
    }

    /// <summary>
    /// 고른 상대에게 통화를 넘긴다. blind — 협의 없이 바로 넘어간다.
    /// 성공하면 이 통화는 우리 손을 떠나므로 화면도 통화 상태를 따라 돌아간다.
    /// </summary>
    public async Task TransferToAsync(string? target)
    {
        var callId = _store.Current?.Server?.CallId;
        var extension = target?.Trim();
        if (Stage != TransferStage.ChoosingTarget) return;
        if (callId is null || string.IsNullOrEmpty(extension)) return;

        if (ResolveTarget(extension) is null) return;

        Close();

        try
        {
            await _server.TransferAsync(callId, extension, _myExtension, CancellationToken.None);
        }
        catch (Exception ex)
        {
            _notify($"돌려주지 못했습니다: {ex.Message}");
        }
    }

    /// <summary>
    /// 고른 상대에게 협의를 건다. 이것이 <b>먼저</b> 접수돼야 서버에 전환 후보가 열리고,
    /// 그때부터 연결과 취소가 뜻을 가진다. 접수되지 않으면 목록으로 돌아간다 —
    /// 열리지도 않은 협의에 연결 버튼을 띄우면 눌러 봐야 400 이다.
    /// </summary>
    public async Task ConsultAsync(string? target)
    {
        var callId = _store.Current?.Server?.CallId;
        var extension = target?.Trim();
        if (Stage != TransferStage.ChoosingTarget) return;
        if (callId is null || string.IsNullOrEmpty(extension)) return;

        var chosen = ResolveTarget(extension);
        if (chosen is null) return;

        _consultTarget = chosen;
        _sawTransferring = false;
        Stage = TransferStage.ConsultRequested;

        var ack = await ServerCall.SendAsync(
            () => _server.StartConsultationAsync(callId, extension, CancellationToken.None),
            _notify);

        // 기다리는 동안 통화가 끝났을 수 있다. 그때는 이미 화면이 정리됐으므로 되살리지 않는다.
        if (Stage != TransferStage.ConsultRequested) return;

        if (ack is null)
        {
            _consultTarget = null;
            Stage = TransferStage.ChoosingTarget;
            return;
        }

        // 이벤트만 기다리면 놓치는 경우가 있다 — 세션이 이미 전환 중이었으면 서버가 보내는
        // 갱신이 앞 값과 같아 화면까지 오지 않는다. 지금 값으로 한 번 채워 둔다.
        _sawTransferring |= _store.Current?.Server?.SessionStatus == SessionStatus.Transferring;
        Stage = TransferStage.Consulting;
    }

    /// <summary>
    /// 두 사람을 붙이고 빠진다. <b>화면은 여기서 넘어갔다고 말하지 않는다</b> — 서버는
    /// feature code 를 DTMF 로 흘려보낼 뿐이고 PBX 가 그것을 먹었는지 모른다.
    /// 실제로 넘어갔다는 근거는 이 통화가 우리에게서 사라지는 것뿐이다.
    /// </summary>
    public async Task CompleteTransferAsync()
    {
        var callId = _store.Current?.Server?.CallId;
        if (Stage != TransferStage.Consulting || callId is null) return;

        _confirmationDeadline = _now().AddSeconds(ConfirmationTimeoutSeconds);
        Stage = TransferStage.CompleteRequested;

        var ack = await ServerCall.SendAsync(
            () => _server.CompleteAttendedTransferAsync(callId, CancellationToken.None),
            _notify);

        // 접수 자체가 안 됐으면 기다릴 이유가 없다. 사유는 ServerCall 이 이미 화면에 올렸다.
        if (ack is null && Stage == TransferStage.CompleteRequested) BackToConsulting();
    }

    /// <summary>
    /// 협의를 접고 원 통화로 돌아간다. 실제 복귀는 PBX 설정에 달려 있어 서버도 모르므로,
    /// 화면은 세션이 전환 중에서 벗어나는 것을 보고서야 닫힌다.
    /// </summary>
    public async Task CancelConsultationAsync()
    {
        var callId = _store.Current?.Server?.CallId;
        if (Stage != TransferStage.Consulting || callId is null) return;

        _confirmationDeadline = _now().AddSeconds(ConfirmationTimeoutSeconds);
        Stage = TransferStage.CancelRequested;

        var ack = await ServerCall.SendAsync(
            () => _server.CancelAttendedTransferAsync(callId, CancellationToken.None),
            _notify);

        if (ack is null && Stage == TransferStage.CancelRequested) BackToConsulting();
    }

    /// <summary>
    /// 못 받는 상대에게 넘기면 통화가 그대로 끊어진다. 발신자는 아무 설명 없이 끊기고
    /// 상담원은 넘겼다고 믿는다. 협의도 마찬가지로 아무도 없는 자리를 부르게 된다.
    /// 화면에서 버튼을 닫아 두지만, 목록을 띄운 뒤 상대가 전화를 받았을 수도 있으므로
    /// 보내기 직전에 한 번 더 본다.
    /// </summary>
    private TransferTarget? ResolveTarget(string extension)
    {
        var chosen = TransferTargets.FirstOrDefault(t => t.Extension == extension);
        if (chosen is not null && chosen.CanTakeCall) return chosen;

        _notify(chosen is null
            ? $"{extension} 은(는) 돌려줄 수 있는 내선이 아닙니다."
            : $"{extension} {chosen.AgentName} 은(는) 지금 받을 수 없습니다 ({chosen.StatusText}).");
        return null;
    }

    private IEnumerable<AgentDirectoryEntry> MatchingTargets()
    {
        var mine = _myExtension?.Trim() ?? string.Empty;
        var needle = _transferFilter.Trim();

        return _directory
            .Where(entry => !string.IsNullOrWhiteSpace(entry.Extension))
            .Where(entry => !string.Equals(entry.Extension.Trim(), mine, StringComparison.Ordinal))
            .Where(entry => needle.Length == 0
                || entry.Extension.Contains(needle, StringComparison.OrdinalIgnoreCase)
                || entry.AgentName.Contains(needle, StringComparison.OrdinalIgnoreCase));
    }

    /// <summary>
    /// 이 상담원이 지금 통화 중인가. 서버가 주는 근무 상태는 통화 시작과 함께 바로
    /// 바뀌지 않을 수 있어, 실제 진행 중인 통화로 한 번 더 본다.
    /// </summary>
    private bool IsOnACall(string agentId)
        => _activeCalls.Any(call => string.Equals(call.PrimaryAgentId, agentId, StringComparison.Ordinal));

    private void BeginTransfer()
    {
        if (Stage != TransferStage.Closed) return;

        TransferFilter = string.Empty;
        _sawTransferring = false;
        Stage = TransferStage.ChoosingTarget;
        Started?.Invoke(this, EventArgs.Empty);

        // 상태는 낡는다. 로그인할 때 받아 둔 목록으로 "대기" 라고 보여 주면
        // 이미 이석한 사람에게 돌려주게 된다. 열면서 다시 받는다.
        _track(RefreshTransferTargetsAsync());
    }

    private async Task RefreshTransferTargetsAsync(CancellationToken ct = default)
    {
        var directory = await ServerCall.SendAsync(() => _server.GetAgentDirectoryAsync(ct), _notify);
        if (directory is null) return;

        UseDirectory(directory);
        Raise(nameof(TransferTargets));
        Raise(nameof(TransferTargetsHidden));
    }

    /// <summary>
    /// 협의가 끝났는지는 <b>서버가 보내 준 세션 상태</b>로만 판정한다. 우리가 완료나 취소를
    /// 보냈다는 사실은 그것이 먹혔다는 뜻이 아니다.
    /// </summary>
    private void OnCurrentCallChanged(CurrentCall? call)
    {
        // 통화가 통째로 없어졌다. 넘길 것도 협의할 것도 없다.
        if (call?.Server is null)
        {
            Close();
            return;
        }

        if (call.Server.SessionStatus == SessionStatus.Transferring)
        {
            _sawTransferring = true;
            return;
        }

        // 대상을 고르는 중에는 아직 아무것도 안 걸었다. 세션 상태가 화면을 닫을 이유가 없다.
        if (Stage is TransferStage.Closed or TransferStage.ChoosingTarget) return;

        // 들어간 것을 본 적이 없으면 나온 것도 아니다. 협의를 열자마자 도착한 늦은 통화 상태
        // 하나로 화면이 닫히면, 상담원은 열린 협의를 닫을 자리를 잃는다.
        if (_sawTransferring) Close();
    }

    /// <summary>기다림만 끝낸다. 협의 자체는 서버에 그대로 열려 있으므로 단계는 협의 중으로 돌린다.</summary>
    private void BackToConsulting()
    {
        _confirmationDeadline = null;
        Stage = TransferStage.Consulting;
    }

    /// <summary>대상 목록을 접는다. 협의가 열려 있으면 닫지 않는다 — 닫을 자리가 사라진다.</summary>
    private void CloseTargetList()
    {
        if (Stage != TransferStage.ChoosingTarget) return;
        Close();
    }

    private void Close()
    {
        if (Stage == TransferStage.Closed) return;

        _consultTarget = null;
        _confirmationDeadline = null;
        _sawTransferring = false;
        Stage = TransferStage.Closed;
        Ended?.Invoke(this, EventArgs.Empty);
    }
}
