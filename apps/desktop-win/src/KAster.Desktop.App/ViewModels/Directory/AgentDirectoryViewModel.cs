using System.Net.Http;
using KAster.Desktop.Core.Contracts;
using KAster.Desktop.Core.Server;

namespace KAster.Desktop.App.ViewModels;

/// <summary>
/// 상담원 목록. 읽는 것은 둘이다 — <b>누가 지금 받을 수 있는가</b>와 <b>내선이 몇 번인가</b>.
///
/// 상태 문구는 돌려주기 화면과 <b>같은 것</b>을 쓴다 (<see cref="TransferTarget"/>). 두 벌로 적으면
/// 같은 사람이 두 화면에서 다른 상태로 보이고, 어느 쪽이 맞는지 알 방법이 없다.
///
/// 창 모양은 여기서 정하지 않는다 — 열었다/닫았다만 알리고, 그걸 듣는 조립 지점이 창을 연다.
/// </summary>
public sealed class AgentDirectoryViewModel : ObservableObject
{
    private readonly CtiServerClient _server;
    private readonly Func<DateTimeOffset> _now;
    private readonly Action<string?> _notify;
    private readonly Action<Task> _track;

    /// <summary>통화가 걸려 있지 않은 상태. 목록에서 거는 것은 이때만 뜻이 있다.</summary>
    private readonly Func<bool> _isFree;

    /// <summary>
    /// 고른 내선으로 건다. <b>여기서 직접 서버를 부르지 않는다</b> — 발신은 PBX 가 이 단말을
    /// 먼저 부르는 방식이라, "우리가 건 전화" 표시를 세우는 발신 화면을 지나지 않으면
    /// 방금 자기가 건 전화가 수신 전화로 뜨고 자동 응답도 안 된다.
    /// </summary>
    private readonly Action<string> _call;

    /// <summary>내 내선. 나에게 거는 것은 뜻이 없어 목록에서 뺀다.</summary>
    private readonly string _myExtension;

    private IReadOnlyList<AgentDirectoryEntry> _directory = Array.Empty<AgentDirectoryEntry>();
    private IReadOnlyList<ActiveCall> _activeCalls = Array.Empty<ActiveCall>();
    private string _filter = string.Empty;
    private bool _isOpen;

    /// <summary>다음 조회 시각. 창이 닫혀 있는 동안에는 오지 않는 시각으로 둔다.</summary>
    private DateTimeOffset _nextLook = DateTimeOffset.MaxValue;

    /// <summary>창에 한 번에 보일 인원. 이보다 많으면 창이 스크롤된다.</summary>
    private const int MaxRowsShown = 8;

    /// <summary>근무 상태를 다시 보는 주기. 돌려주기 화면과 달리 오래 띄워 두는 창이라 자주 낡는다.</summary>
    private const int LookSeconds = 10;

    public AgentDirectoryViewModel(
        CtiServerClient server,
        string myExtension,
        Func<DateTimeOffset> now,
        Action<string?> notify,
        Action<Task> track,
        Func<bool> isFree,
        Action<string> call)
    {
        _server = server;
        _myExtension = myExtension?.Trim() ?? string.Empty;
        _now = now;
        _notify = notify;
        _track = track;
        _isFree = isFree;
        _call = call;

        OpenCommand = new RelayCommand(Open);
        CloseCommand = new RelayCommand(Close);
        CallCommand = new RelayCommand<string>(CallExtension);
    }

    /// <summary>목록을 띄웠다.</summary>
    public event EventHandler? Opened;

    /// <summary>목록을 닫았다.</summary>
    public event EventHandler? Closed;

    public RelayCommand OpenCommand { get; }

    public RelayCommand CloseCommand { get; }

    /// <summary>고른 내선으로 건다.</summary>
    public RelayCommand<string> CallCommand { get; }

    /// <summary>창이 떠 있는가. 조회가 도는 조건이 이것 하나다.</summary>
    public bool IsOpen
    {
        get => _isOpen;
        private set => Set(ref _isOpen, value);
    }

    /// <summary>이름이나 내선으로 좁힌다. 사람이 많으면 창에 다 들어가지 않는다.</summary>
    public string Filter
    {
        get => _filter;
        set
        {
            if (!Set(ref _filter, value)) return;
            RaiseRows();
        }
    }

    /// <summary>
    /// 화면에 뜨는 사람들. 받을 수 있는 쪽이 위로 온다 — 목록이 잘려도 쓸 수 있는 쪽이 남는다.
    /// 같은 조건이면 내선 순이라 볼 때마다 자리가 바뀌지 않는다.
    /// </summary>
    public IReadOnlyList<TransferTarget> Rows => Matching()
        .Select(entry => TransferTarget.From(entry, IsOnACall(entry.AgentId)))
        .OrderByDescending(target => target.CanTakeCall)
        .ThenBy(target => target.Extension, StringComparer.Ordinal)
        .Take(MaxRowsShown)
        .ToArray();

    /// <summary>창에 못 담아 가린 인원. 숨기지 말고 숫자로 알린다.</summary>
    public int RowsHidden => Math.Max(0, Matching().Count() - MaxRowsShown);

    public string RowsHiddenText => RowsHidden > 0 ? $"외 {RowsHidden}명" : string.Empty;

    /// <summary>로그인 직후에 받아 둔 목록. 창을 열 때 다시 받으므로 여기서는 알림을 쏘지 않는다.</summary>
    public void UseDirectory(IReadOnlyList<AgentDirectoryEntry> directory)
    {
        _directory = directory;
        RaiseRows();
    }

    /// <summary>
    /// 지금 진행 중인 통화들. 서버가 주는 근무 상태는 통화 시작과 함께 바로 바뀌지 않을 수 있어,
    /// 누가 통화 중인지는 이걸로 한 번 더 본다. 돌려주기 화면과 같은 조회를 나눠 쓴다.
    /// </summary>
    public void UseActiveCalls(IReadOnlyList<ActiveCall> calls)
    {
        _activeCalls = calls;
        RaiseRows();
    }

    /// <summary>
    /// 1초마다 불린다. <b>창이 닫혀 있으면 아무것도 물어보지 않는다</b> —
    /// 아무도 안 보는 화면 때문에 서버가 계속 두들겨 맞을 이유가 없다.
    /// </summary>
    public void Tick()
    {
        if (!IsOpen || _now() < _nextLook) return;

        _nextLook = _now().AddSeconds(LookSeconds);
        _track(RefreshAsync());
    }

    /// <summary>
    /// 목록을 다시 받는다. <b>조용히</b> 실패한다 — 주기 조회가 실패했다고 화면에 오류를 띄우면
    /// 통화 알림이 묻힌다.
    /// </summary>
    public async Task RefreshAsync(CancellationToken ct = default)
    {
        try
        {
            UseDirectory(await _server.GetAgentDirectoryAsync(ct));
        }
        catch (Exception ex) when (ex is CtiServerException or HttpRequestException or TaskCanceledException)
        {
            // 다음 차례에 다시 본다.
        }
    }

    /// <summary>창이 닫혔다. 상담원이 X 로 닫은 경로도 여기로 온다.</summary>
    public void Close()
    {
        if (!IsOpen) return;

        IsOpen = false;
        _nextLook = DateTimeOffset.MaxValue;
        Closed?.Invoke(this, EventArgs.Empty);
    }

    private void Open()
    {
        if (IsOpen)
        {
            // 이미 떠 있는 창을 다시 눌렀다. 조립 지점이 그 창을 앞으로 가져온다.
            Opened?.Invoke(this, EventArgs.Empty);
            return;
        }

        Filter = string.Empty;
        IsOpen = true;
        _nextLook = _now().AddSeconds(LookSeconds);
        Opened?.Invoke(this, EventArgs.Empty);

        // 상태는 낡는다. 로그인할 때 받아 둔 목록으로 "대기" 라고 보여 주면
        // 이미 자리를 비운 사람에게 전화를 건다.
        _track(RefreshAsync());
    }

    /// <summary>
    /// 못 받는 상대에게 걸면 아무도 받지 않는다. 목록을 띄운 뒤 상대가 전화를 받았을 수도 있으므로
    /// 보내기 직전에 한 번 더 본다.
    /// </summary>
    private void CallExtension(string? extension)
    {
        var target = extension?.Trim();
        if (string.IsNullOrEmpty(target)) return;

        // 통화 중에는 발신 자체가 열려 있지 않다. 목록에서 눌러도 같아야 한다.
        if (!_isFree()) return;

        var chosen = Rows.FirstOrDefault(row => row.Extension == target);
        if (chosen is null)
        {
            _notify($"{target} 은(는) 걸 수 있는 내선이 아닙니다.");
            return;
        }

        if (!chosen.CanTakeCall)
        {
            _notify($"{target} {chosen.AgentName} 은(는) 지금 받을 수 없습니다 ({chosen.StatusText}).");
            return;
        }

        _call(target);
    }

    private IEnumerable<AgentDirectoryEntry> Matching()
    {
        var needle = _filter.Trim();

        return _directory
            .Where(entry => !string.IsNullOrWhiteSpace(entry.Extension))
            .Where(entry => !string.Equals(entry.Extension.Trim(), _myExtension, StringComparison.Ordinal))
            .Where(entry => needle.Length == 0
                || entry.Extension.Contains(needle, StringComparison.OrdinalIgnoreCase)
                || entry.AgentName.Contains(needle, StringComparison.OrdinalIgnoreCase));
    }

    private bool IsOnACall(string agentId)
        => _activeCalls.Any(call => string.Equals(call.PrimaryAgentId, agentId, StringComparison.Ordinal));

    private void RaiseRows()
    {
        Raise(nameof(Rows));
        Raise(nameof(RowsHidden));
        Raise(nameof(RowsHiddenText));
    }
}
