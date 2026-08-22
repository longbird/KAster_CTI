using System.Net.Http;
using KAster.Desktop.Core.Contracts;
using KAster.Desktop.Core.Server;
using KAster.Desktop.Core.Storage;

namespace KAster.Desktop.App.ViewModels;

/// <summary>
/// 공지.
///
/// 목록은 <b>REST 한 갈래에서만</b> 온다 (<c>GET announcements</c>). WS <c>announcement.pushed</c> 도
/// 오지만 그 본문은 읽지 않는다 — 수정 이벤트일 때 관리자가 보낸 필드만 실려 와 매 요청마다 구성이
/// 다르고, 그것을 화면에 넣으면 제목만 있고 본문이 사라진 공지가 뜬다. 그래서 이벤트를 받는 자리
/// (<see cref="OnPushed"/>) 는 <b>인자를 받지 않는다</b> — 읽을 수 있는 페이로드가 아예 없다.
///
/// 큐 현황과 달리 <b>주기 조회가 없다</b>. 배지는 창이 닫혀 있어도 맞아야 하므로 창 생명주기에
/// 묶을 수 없고, 대신 갱신이 로그인 직후 한 번과 WS 신호 때만 나간다.
/// </summary>
public sealed class AnnouncementsViewModel : ObservableObject
{
    private readonly CtiServerClient _server;
    private readonly ISettingsStore<AnnouncementReadState> _reads;
    private readonly string _agentId;
    private readonly Func<DateTimeOffset> _now;
    private readonly Action<Task> _track;

    private IReadOnlyList<Announcement> _all = Array.Empty<Announcement>();
    private readonly HashSet<string> _readIds;
    private bool _isOpen;

    /// <summary>창에 한 번에 보일 건수. 이보다 많으면 창이 스크롤된다.</summary>
    private const int MaxRowsShown = 6;

    public AnnouncementsViewModel(
        CtiServerClient server,
        ISettingsStore<AnnouncementReadState> reads,
        string agentId,
        Func<DateTimeOffset> now,
        Action<Task> track)
    {
        _server = server;
        _reads = reads;
        _agentId = agentId;
        _now = now;
        _track = track;
        _readIds = LoadReadIds();

        OpenCommand = new RelayCommand(Open);
        CloseCommand = new RelayCommand(Close);
    }

    /// <summary>공지를 띄웠다.</summary>
    public event EventHandler? Opened;

    /// <summary>공지를 닫았다.</summary>
    public event EventHandler? Closed;

    public RelayCommand OpenCommand { get; }

    public RelayCommand CloseCommand { get; }

    public bool IsOpen
    {
        get => _isOpen;
        private set => Set(ref _isOpen, value);
    }

    /// <summary>
    /// 화면에 뜨는 공지. <b>다시 정렬하지 않는다</b> — 고정 공지를 위로 올리는 순서는 서버가 정한다.
    /// </summary>
    public IReadOnlyList<AnnouncementRow> Rows => _all
        .Take(MaxRowsShown)
        .Select(a => AnnouncementRow.From(a, _now, !_readIds.Contains(a.AnnouncementId)))
        .ToArray();

    public bool HasRows => _all.Count > 0;

    /// <summary>창에 못 담아 가린 건수. 숨기지 말고 숫자로 알린다.</summary>
    public int RowsHidden => Math.Max(0, _all.Count - MaxRowsShown);

    public string RowsHiddenText => RowsHidden > 0 ? $"외 {RowsHidden}건" : string.Empty;

    /// <summary>안 읽은 공지 수. 메인 화면이 알려야 하는 것은 이것 하나다.</summary>
    public int UnreadCount => _all.Count(a => !_readIds.Contains(a.AnnouncementId));

    public bool HasUnread => UnreadCount > 0;

    /// <summary>
    /// 메인 화면의 버튼에 그대로 쓰는 문구. 숫자를 버튼 안에 넣어 <b>줄을 늘리지 않는다</b> —
    /// 대기 화면에는 새 줄을 넣을 자리가 없다.
    /// </summary>
    public string EntryText => HasUnread ? $"공지 {UnreadCount}" : "공지";

    /// <summary>
    /// 서버가 공지가 바뀌었다고 알려 왔다. <b>무엇이 어떻게 바뀌었는지는 듣지 않는다</b> —
    /// 이 메서드에 인자가 없는 것이 그 약속이다. 다시 물어보는 것이 전부다.
    /// </summary>
    public void OnPushed() => _track(RefreshAsync());

    /// <summary>
    /// 공지를 다시 받는다. <b>조용히</b> 실패한다 — 배지 하나 때문에 화면에 오류를 띄우면
    /// 통화 알림이 묻힌다.
    /// </summary>
    public async Task RefreshAsync(CancellationToken ct = default)
    {
        IReadOnlyList<Announcement> fetched;
        try
        {
            fetched = await _server.GetAnnouncementsAsync(ct);
        }
        catch (Exception ex) when (ex is CtiServerException or HttpRequestException or TaskCanceledException)
        {
            // 못 물어본 것이지 공지가 없어진 것이 아니다. 읽음 표시도 그대로 둔다.
            return;
        }

        _all = fetched;

        // 서버에서 사라진 공지의 읽음 표시는 걷어 낸다. 안 걷어 내면 파일이 끝없이 자란다.
        var alive = fetched.Select(a => a.AnnouncementId).ToHashSet(StringComparer.Ordinal);
        if (_readIds.RemoveWhere(id => !alive.Contains(id)) > 0) SaveReadIds();

        // 창을 띄워 둔 채로 새 공지가 들어왔다. 지금 보이는 것은 읽은 것이다.
        if (IsOpen) MarkShownAsRead();

        RaiseAll();
    }

    /// <summary>창이 닫혔다. 상담원이 X 로 닫은 경로도 여기로 온다.</summary>
    public void Close()
    {
        if (!IsOpen) return;

        IsOpen = false;
        Closed?.Invoke(this, EventArgs.Empty);
    }

    private void Open()
    {
        if (IsOpen)
        {
            Opened?.Invoke(this, EventArgs.Empty);
            return;
        }

        IsOpen = true;
        Opened?.Invoke(this, EventArgs.Empty);

        // 지금 화면에 있는 것은 읽은 것으로 친다. 그 뒤에 다시 받아 새로 들어온 것을 마저 처리한다.
        MarkShownAsRead();
        RaiseAll();
        _track(RefreshAsync());
    }

    /// <summary>
    /// <b>보여 준 것만</b> 읽음으로 표시한다. 창에 안 들어가 가려진 공지까지 읽었다고 하면
    /// 상담원은 그것을 영영 못 보고, 배지도 0 이 되어 다시 열 이유가 사라진다.
    /// </summary>
    private void MarkShownAsRead()
    {
        var shown = _all.Take(MaxRowsShown).Select(a => a.AnnouncementId);
        var added = shown.Count(id => _readIds.Add(id));
        if (added > 0) SaveReadIds();
    }

    /// <summary>
    /// 앞 상담원이 남긴 표시는 가져오지 않는다. 같은 PC 를 교대로 쓰는 자리에서
    /// 뒷사람이 공지를 못 보게 된다.
    /// </summary>
    private HashSet<string> LoadReadIds()
    {
        var saved = _reads.Load();
        return string.Equals(saved.AgentId, _agentId, StringComparison.Ordinal)
            ? saved.ReadIds.ToHashSet(StringComparer.Ordinal)
            : new HashSet<string>(StringComparer.Ordinal);
    }

    private void SaveReadIds()
        => _reads.Save(new AnnouncementReadState { AgentId = _agentId, ReadIds = _readIds.ToArray() });

    private void RaiseAll()
    {
        Raise(nameof(Rows));
        Raise(nameof(HasRows));
        Raise(nameof(RowsHidden));
        Raise(nameof(RowsHiddenText));
        Raise(nameof(UnreadCount));
        Raise(nameof(HasUnread));
        Raise(nameof(EntryText));
    }
}
