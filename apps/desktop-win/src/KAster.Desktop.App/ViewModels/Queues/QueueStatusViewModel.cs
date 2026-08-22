using System.Net.Http;
using KAster.Desktop.Core.Server;

namespace KAster.Desktop.App.ViewModels;

/// <summary>
/// 큐 대기 현황.
///
/// 값은 <b>REST 한 갈래에서만</b> 온다 (<c>GET queues/summary</c>). WS <c>queue.summary.updated</c> 도
/// 오지만 그 본문은 읽지 않는다 — 필드명이 REST 와 달라(<c>waitingCount</c> ↔ <c>waiting</c>) 두 벌로
/// 파싱하면 한쪽이 바뀔 때 다른 쪽이 조용히 어긋난다. 그래서 이벤트를 받는 자리
/// (<see cref="OnSummaryPushed"/>) 는 <b>인자를 받지 않는다</b> — 읽을 수 있는 페이로드가 아예 없다.
///
/// 창이 닫혀 있으면 아무것도 물어보지 않는다. 조회는 <see cref="Tick"/> 이 <see cref="IsOpen"/> 을
/// 보고서만 나간다.
/// </summary>
public sealed class QueueStatusViewModel : ObservableObject
{
    private readonly CtiServerClient _server;
    private readonly Func<DateTimeOffset> _now;
    private readonly Action<Task> _track;

    private IReadOnlyList<QueueRow> _all = Array.Empty<QueueRow>();
    private bool _isOpen;

    /// <summary>다음 조회 시각. 창이 닫혀 있는 동안에는 오지 않는 시각으로 둔다.</summary>
    private DateTimeOffset _nextLook = DateTimeOffset.MaxValue;

    /// <summary>창에 한 번에 보일 큐 수. 이보다 많으면 창이 스크롤된다.</summary>
    private const int MaxRowsShown = 6;

    /// <summary>다시 보는 주기. 대기 건수는 초 단위로 움직인다.</summary>
    private const int LookSeconds = 5;

    public QueueStatusViewModel(
        CtiServerClient server,
        Func<DateTimeOffset> now,
        Action<Task> track)
    {
        _server = server;
        _now = now;
        _track = track;

        OpenCommand = new RelayCommand(Open);
        CloseCommand = new RelayCommand(Close);
    }

    /// <summary>현황을 띄웠다.</summary>
    public event EventHandler? Opened;

    /// <summary>현황을 닫았다.</summary>
    public event EventHandler? Closed;

    public RelayCommand OpenCommand { get; }

    public RelayCommand CloseCommand { get; }

    /// <summary>창이 떠 있는가. 조회가 도는 조건이 이것 하나다.</summary>
    public bool IsOpen
    {
        get => _isOpen;
        private set => Set(ref _isOpen, value);
    }

    /// <summary>
    /// 화면에 뜨는 큐. 임계값을 넘긴 큐가 먼저, 그 다음 대기가 많은 순이다 —
    /// 목록이 잘려도 지금 손봐야 하는 큐가 남는다.
    /// </summary>
    public IReadOnlyList<QueueRow> Rows => _all
        .OrderByDescending(row => row.IsOverThreshold)
        .ThenByDescending(row => row.Waiting)
        .ThenBy(row => row.QueueName, StringComparer.Ordinal)
        .Take(MaxRowsShown)
        .ToArray();

    public bool HasRows => _all.Count > 0;

    /// <summary>창에 못 담아 가린 큐. 숨기지 말고 숫자로 알린다.</summary>
    public int RowsHidden => Math.Max(0, _all.Count - MaxRowsShown);

    public string RowsHiddenText => RowsHidden > 0 ? $"외 {RowsHidden}개 큐" : string.Empty;

    /// <summary>
    /// 1초마다 불린다. <b>창이 닫혀 있으면 아무것도 물어보지 않는다.</b>
    /// </summary>
    public void Tick()
    {
        if (!IsOpen || _now() < _nextLook) return;

        _nextLook = _now().AddSeconds(LookSeconds);
        _track(RefreshAsync());
    }

    /// <summary>
    /// 서버가 큐 현황이 바뀌었다고 알려 왔다. <b>무엇이 어떻게 바뀌었는지는 듣지 않는다</b> —
    /// 이 메서드에 인자가 없는 것이 그 약속이다. 다음 조회 시각만 지금으로 당긴다.
    ///
    /// 창이 닫혀 있으면 아무 일도 하지 않는다. 안 보는 화면 때문에 조회가 나갈 이유가 없다.
    /// </summary>
    public void OnSummaryPushed()
    {
        if (!IsOpen) return;
        _nextLook = _now();
    }

    /// <summary>
    /// 현황을 다시 받는다. <b>조용히</b> 실패한다 — 주기 조회가 실패했다고 화면에 오류를 띄우면
    /// 통화 알림이 묻힌다. 앞서 받아 둔 값은 그대로 두므로 화면이 비지 않는다.
    /// </summary>
    public async Task RefreshAsync(CancellationToken ct = default)
    {
        try
        {
            _all = (await _server.GetQueueSummaryAsync(ct)).Select(QueueRow.From).ToArray();
            RaiseRows();
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

        IsOpen = true;
        _nextLook = _now().AddSeconds(LookSeconds);
        Opened?.Invoke(this, EventArgs.Empty);
        _track(RefreshAsync());
    }

    private void RaiseRows()
    {
        Raise(nameof(Rows));
        Raise(nameof(HasRows));
        Raise(nameof(RowsHidden));
        Raise(nameof(RowsHiddenText));
    }
}
