using KAster.Desktop.Core.Contracts;
using KAster.Desktop.Core.Server;
using KAster.Desktop.Core.State;

namespace KAster.Desktop.App.ViewModels;

/// <summary>
/// 통화를 다른 상담원에게 돌려준다. blind — 협의 없이 바로 넘어간다.
///
/// 창 모양은 여기서 정하지 않는다 — 목록을 열었다(<see cref="Started"/>)/닫았다(<see cref="Ended"/>)만
/// 알리고, 그걸 듣는 통화 화면이 창을 정한다.
/// </summary>
public sealed class TransferViewModel : ObservableObject
{
    private readonly CallStateStore _store;
    private readonly CtiServerClient _server;
    private readonly Action<string?> _notify;
    private readonly Action<Task> _track;

    /// <summary>내 내선. 자기 자신에게 돌려주는 것은 뜻이 없어 목록에서 뺀다.</summary>
    private readonly string _myExtension;

    private IReadOnlyList<AgentDirectoryEntry> _directory = Array.Empty<AgentDirectoryEntry>();
    private IReadOnlyList<ActiveCall> _activeCalls = Array.Empty<ActiveCall>();
    private bool _isChoosingTransferTarget;
    private string _transferFilter = string.Empty;

    private const int MaxTransferTargetsShown = 5;

    public TransferViewModel(
        CallStateStore store,
        CtiServerClient server,
        string myExtension,
        Action<string?> notify,
        Action<Task> track)
    {
        _store = store;
        _server = server;
        _myExtension = myExtension;
        _notify = notify;
        _track = track;

        StartTransferCommand = new RelayCommand(BeginTransfer, () => _store.Current is not null);
        CancelTransferCommand = new RelayCommand(EndTransfer);
        TransferToCommand = new RelayCommand<string>(target => _track(TransferToAsync(target)));
    }

    /// <summary>대상 목록을 열었다.</summary>
    public event EventHandler? Started;

    /// <summary>대상 목록을 닫았다. 돌아갈 화면은 듣는 쪽이 정한다.</summary>
    public event EventHandler? Ended;

    /// <summary>
    /// 돌려줄 상대를 고르는 중인가. 통화 화면 대신 대상 목록이 보인다.
    /// </summary>
    public bool IsChoosingTransferTarget
    {
        get => _isChoosingTransferTarget;
        private set
        {
            if (!Set(ref _isChoosingTransferTarget, value)) return;
            Raise(nameof(TransferTargets));
        }
    }

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
    /// 고른 상대에게 통화를 넘긴다. blind — 협의 없이 바로 넘어간다.
    /// 성공하면 이 통화는 우리 손을 떠나므로 화면도 통화 상태를 따라 돌아간다.
    /// </summary>
    public async Task TransferToAsync(string? target)
    {
        var callId = _store.Current?.Server?.CallId;
        var extension = target?.Trim();
        if (callId is null || string.IsNullOrEmpty(extension)) return;

        // 못 받는 상대에게 넘기면 통화가 그대로 끊어진다. 발신자는 아무 설명 없이 끊기고
        // 상담원은 넘겼다고 믿는다. 화면에서 버튼을 닫아 두지만, 목록을 띄운 뒤 상대가
        // 전화를 받았을 수도 있으므로 보내기 직전에 한 번 더 본다.
        var chosen = TransferTargets.FirstOrDefault(t => t.Extension == extension);
        if (chosen is null || !chosen.CanTakeCall)
        {
            _notify(chosen is null
                ? $"{extension} 은(는) 돌려줄 수 있는 내선이 아닙니다."
                : $"{extension} {chosen.AgentName} 은(는) 지금 받을 수 없습니다 ({chosen.StatusText}).");
            return;
        }

        EndTransfer();

        try
        {
            await _server.TransferAsync(callId, extension, _myExtension, CancellationToken.None);
        }
        catch (Exception ex)
        {
            _notify($"돌려주지 못했습니다: {ex.Message}");
        }
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
        TransferFilter = string.Empty;
        IsChoosingTransferTarget = true;
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

    private void EndTransfer()
    {
        if (!IsChoosingTransferTarget) return;

        IsChoosingTransferTarget = false;
        Ended?.Invoke(this, EventArgs.Empty);
    }
}
