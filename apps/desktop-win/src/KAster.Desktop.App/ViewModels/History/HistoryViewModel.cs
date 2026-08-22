using KAster.Desktop.Core.Server;

namespace KAster.Desktop.App.ViewModels;

/// <summary>
/// 지난 통화. 읽는 것은 넷이다 — 언제, 어느 번호와, 얼마나, 받았는지.
///
/// 창 모양은 여기서 정하지 않는다 — 열었다(<see cref="Opened"/>)/닫았다(<see cref="Closed"/>)만
/// 알리고, 그걸 듣는 통화 화면이 창을 정한다.
/// </summary>
public sealed class HistoryViewModel : ObservableObject
{
    private readonly CtiServerClient _server;
    private readonly string _agentId;
    private readonly Func<DateTimeOffset> _now;
    private readonly Action<string?> _notify;
    private readonly Action<Task> _track;

    /// <summary>고른 번호를 발신 칸에 넣는다. 번호를 옮겨 적게 하지 않는다.</summary>
    private readonly Action<string> _fillDialBox;

    private bool _isViewingHistory;

    private const int MaxHistoryShown = 20;

    public HistoryViewModel(
        CtiServerClient server,
        string agentId,
        Func<DateTimeOffset> now,
        Action<string?> notify,
        Action<Task> track,
        Action<string> fillDialBox,
        Func<bool> canOpen)
    {
        _server = server;
        _agentId = agentId;
        _now = now;
        _notify = notify;
        _track = track;
        _fillDialBox = fillDialBox;

        OpenHistoryCommand = new RelayCommand(() => _track(OpenHistoryAsync()), canOpen);
        CloseHistoryCommand = new RelayCommand(CloseHistory);
        CallBackCommand = new RelayCommand<HistoryRow>(CallBack);
    }

    /// <summary>이력을 띄웠다.</summary>
    public event EventHandler? Opened;

    /// <summary>이력을 닫았다. 돌아갈 화면은 듣는 쪽이 정한다.</summary>
    public event EventHandler? Closed;

    /// <summary>지난 통화를 보고 있는가.</summary>
    public bool IsViewingHistory
    {
        get => _isViewingHistory;
        private set => Set(ref _isViewingHistory, value);
    }

    public IReadOnlyList<HistoryRow> Rows { get; private set; } = Array.Empty<HistoryRow>();

    public RelayCommand OpenHistoryCommand { get; }

    public RelayCommand CloseHistoryCommand { get; }

    public RelayCommand<HistoryRow> CallBackCommand { get; }

    /// <summary>
    /// 지난 통화를 받아 온다. 열 때마다 새로 받는다 — 그 사이에 통화가 더 쌓였을 수 있고,
    /// 오래된 목록을 보여 주면 방금 놓친 전화가 안 보인다.
    /// </summary>
    public async Task OpenHistoryAsync(CancellationToken ct = default)
    {
        var rows = await ServerCall.SendAsync(
            () => _server.GetCallHistoryAsync(_agentId, MaxHistoryShown, ct), _notify);

        if (rows is null)
        {
            _notify("통화 이력을 불러오지 못했습니다.");
            return;
        }

        Rows = rows.Select(entry => HistoryRow.From(entry, _now)).ToArray();
        Raise(nameof(Rows));
        IsViewingHistory = true;
        Opened?.Invoke(this, EventArgs.Empty);
    }

    /// <summary>이력에서 바로 다시 건다. 번호를 옮겨 적게 하지 않는다.</summary>
    private void CallBack(HistoryRow? row)
    {
        if (row is null || row.RawNumber.Length == 0) return;

        _fillDialBox(row.RawNumber);
        CloseHistory();
    }

    private void CloseHistory()
    {
        if (!IsViewingHistory) return;

        IsViewingHistory = false;
        Closed?.Invoke(this, EventArgs.Empty);
    }
}
