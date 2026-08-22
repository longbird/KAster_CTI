using System.Net;
using KAster.Desktop.App.ViewModels;
using KAster.Desktop.Core.Contracts;
using KAster.Desktop.Core.Storage;
using KAster.Desktop.Tests.Server;
using Xunit;

namespace KAster.Desktop.Tests.App;

/// <summary>
/// 공지 서브 창.
///
/// 읽음 표시는 <b>이 PC 안에만</b> 남는다 — 서버의 읽음 처리 경로
/// (<c>POST /admin/announcements/{id}/read</c>)는 supervisor/admin 전용이라 상담원이 부르면 403 이다.
///
/// WS <c>announcement.pushed</c> 는 수정 이벤트일 때 관리자가 보낸 필드만 실려 와 매번 구성이
/// 다르다. 그래서 본문을 읽지 않고 재조회 신호로만 쓴다.
/// </summary>
public class AnnouncementsViewModelTests : SoftphoneViewModelTestBase
{
    private const string TwoAnnouncementsJson = """
    {"success":true,"data":[
      {"announcementId":"n-1","title":"9월 정기 점검","body":"9월 1일 02시부터 30분간 통화가 끊깁니다.",
       "authorName":"관리자","pinned":true,"category":"NOTICE","severity":"WARN",
       "createdAt":"2026-08-20T01:00:00.000Z"},
      {"announcementId":"n-2","title":"신규 지사 안내","body":"부산 지사가 열렸습니다.",
       "authorName":"운영팀","pinned":false,"category":"NOTICE","severity":"INFO",
       "createdAt":"2026-08-19T01:00:00.000Z"}
    ],"error":null}
    """;

    private const string OneAnnouncementJson = """
    {"success":true,"data":[
      {"announcementId":"n-1","title":"9월 정기 점검","body":"9월 1일 02시부터 30분간 통화가 끊깁니다.",
       "authorName":"관리자","pinned":true,"category":"NOTICE","severity":"WARN",
       "createdAt":"2026-08-20T01:00:00.000Z"}
    ],"error":null}
    """;

    /// <summary>공지 15건. 창에 다 못 들어가는 상황을 만든다.</summary>
    private static readonly string ManyAnnouncementsJson =
        """{"success":true,"data":["""
        + string.Join(",", Enumerable.Range(1, 15).Select(n =>
            $$"""
            {"announcementId":"n-{{n}}","title":"공지 {{n}}","body":"본문 {{n}}","authorName":"관리자",
             "pinned":false,"category":"NOTICE","severity":"INFO",
             "createdAt":"2026-08-19T01:00:00.000Z"}
            """))
        + """],"error":null}""";

    private static int AnnouncementLookups(StubHttpHandler stub)
        => stub.Requests.Count(r =>
            r.RequestUri!.AbsolutePath.EndsWith("/announcements", StringComparison.Ordinal));

    [Fact]
    public async Task The_list_comes_from_the_server_in_the_order_the_server_chose()
    {
        var (vm, _, _, stub) = Build();
        stub.Enqueue(HttpStatusCode.OK, TwoAnnouncementsJson);

        await vm.Announcements.RefreshAsync();

        Assert.Equal(new[] { "n-1", "n-2" }, vm.Announcements.Rows.Select(r => r.AnnouncementId));
        Assert.Equal("9월 정기 점검", vm.Announcements.Rows[0].Title);
        Assert.Equal("9월 1일 02시부터 30분간 통화가 끊깁니다.", vm.Announcements.Rows[0].Body);
        Assert.True(vm.Announcements.Rows[0].Pinned);
    }

    /// <summary>메인 화면이 알려야 하는 것은 "안 읽은 것이 몇 건인가" 하나다.</summary>
    [Fact]
    public async Task Everything_is_unread_the_first_time()
    {
        var (vm, _, _, stub) = Build();
        stub.Enqueue(HttpStatusCode.OK, TwoAnnouncementsJson);

        await vm.Announcements.RefreshAsync();

        Assert.Equal(2, vm.Announcements.UnreadCount);
        Assert.True(vm.Announcements.HasUnread);
        Assert.Equal("공지 2", vm.Announcements.EntryText);
    }

    [Fact]
    public async Task Opening_the_window_marks_what_it_shows_as_read_and_remembers_it()
    {
        var reads = new MemoryStore<AnnouncementReadState>(new AnnouncementReadState());
        var (vm, _, _, stub) = Build(announcementReads: reads);
        stub.Enqueue(HttpStatusCode.OK, TwoAnnouncementsJson);

        vm.Announcements.OpenCommand.Execute(null);
        await vm.PendingWork;

        Assert.Equal(0, vm.Announcements.UnreadCount);
        Assert.False(vm.Announcements.HasUnread);
        Assert.Equal("공지", vm.Announcements.EntryText);
        Assert.Equal(new[] { "n-1", "n-2" }, reads.Load().ReadIds.OrderBy(id => id));
        Assert.Equal("a-1", reads.Load().AgentId);
    }

    /// <summary>앱을 껐다 켜도 이미 읽은 공지가 다시 안 읽음으로 돌아오면 배지가 뜻을 잃는다.</summary>
    [Fact]
    public async Task An_announcement_read_before_stays_read()
    {
        var reads = new MemoryStore<AnnouncementReadState>(
            new AnnouncementReadState { AgentId = "a-1", ReadIds = new[] { "n-1" } });
        var (vm, _, _, stub) = Build(announcementReads: reads);
        stub.Enqueue(HttpStatusCode.OK, TwoAnnouncementsJson);

        await vm.Announcements.RefreshAsync();

        Assert.Equal(1, vm.Announcements.UnreadCount);
        Assert.False(vm.Announcements.Rows[0].IsUnread);
        Assert.True(vm.Announcements.Rows[1].IsUnread);
    }

    /// <summary>
    /// 교대 근무에서 같은 PC 에 다음 상담원이 앉는다. 앞사람이 읽은 것을 뒷사람이 읽었다고 하면
    /// 뒷사람은 그 공지를 영영 못 본다.
    /// </summary>
    [Fact]
    public async Task Read_marks_left_by_another_agent_are_not_borrowed()
    {
        var reads = new MemoryStore<AnnouncementReadState>(
            new AnnouncementReadState { AgentId = "다른사람", ReadIds = new[] { "n-1", "n-2" } });
        var (vm, _, _, stub) = Build(announcementReads: reads);
        stub.Enqueue(HttpStatusCode.OK, TwoAnnouncementsJson);

        await vm.Announcements.RefreshAsync();

        Assert.Equal(2, vm.Announcements.UnreadCount);
    }

    /// <summary>서버에서 사라진 공지의 읽음 표시를 계속 들고 있으면 파일이 끝없이 자란다.</summary>
    [Fact]
    public async Task Read_marks_for_announcements_the_server_dropped_are_forgotten()
    {
        var reads = new MemoryStore<AnnouncementReadState>(
            new AnnouncementReadState { AgentId = "a-1", ReadIds = new[] { "n-1", "n-2" } });
        var (vm, _, _, stub) = Build(announcementReads: reads);
        stub.Enqueue(HttpStatusCode.OK, OneAnnouncementJson);

        await vm.Announcements.RefreshAsync();

        Assert.Equal(new[] { "n-1" }, reads.Load().ReadIds);
    }

    /// <summary>조회가 실패했으면 읽음 표시를 지우지 않는다. 없어진 것이 아니라 못 물어본 것이다.</summary>
    [Fact]
    public async Task A_failed_refresh_keeps_the_read_marks_and_stays_quiet()
    {
        var reads = new MemoryStore<AnnouncementReadState>(
            new AnnouncementReadState { AgentId = "a-1", ReadIds = new[] { "n-1", "n-2" } });
        var (vm, _, _, stub) = Build(announcementReads: reads);
        stub.Enqueue(HttpStatusCode.InternalServerError, """{"success":false,"data":null,"error":{"message":"터졌다"}}""");

        await vm.Announcements.RefreshAsync();

        Assert.Equal(2, reads.Load().ReadIds.Count);
        Assert.Null(vm.NoticeMessage);
    }

    /// <summary>
    /// 수정 이벤트의 페이로드는 관리자가 보낸 필드만 담아 매번 구성이 다르다. 그것을 화면에 넣으면
    /// 제목만 있고 본문이 사라진 공지가 뜬다. 이벤트는 재조회 신호로만 쓴다.
    /// </summary>
    [Fact]
    public async Task A_pushed_announcement_only_makes_it_ask_again_and_its_own_body_never_reaches_the_screen()
    {
        var (vm, _, _, stub) = Build();
        stub.Enqueue(HttpStatusCode.OK, OneAnnouncementJson);
        await vm.Announcements.RefreshAsync();

        stub.Enqueue(HttpStatusCode.OK, TwoAnnouncementsJson);
        vm.Apply(new AnnouncementPushedEvent("n-9", "밀어 넣은 제목", string.Empty, null));
        await vm.PendingWork;

        Assert.Equal(2, AnnouncementLookups(stub));
        Assert.DoesNotContain(vm.Announcements.Rows, row => row.AnnouncementId == "n-9");
        Assert.DoesNotContain(vm.Announcements.Rows, row => row.Title == "밀어 넣은 제목");
    }

    /// <summary>창에 스크롤을 만들지 않는다. 못 담은 공지는 숨기지 말고 숫자로 알린다.</summary>
    [Fact]
    public async Task Announcements_that_do_not_fit_are_counted_instead_of_scrolled()
    {
        var (vm, _, _, stub) = Build();
        stub.Enqueue(HttpStatusCode.OK, ManyAnnouncementsJson);

        await vm.Announcements.RefreshAsync();

        Assert.Equal(15, vm.Announcements.Rows.Count + vm.Announcements.RowsHidden);
        Assert.True(vm.Announcements.RowsHidden > 0);
        Assert.Equal($"외 {vm.Announcements.RowsHidden}건", vm.Announcements.RowsHiddenText);
    }

    /// <summary>
    /// 안 보여 준 공지를 읽었다고 표시하면 상담원은 그 공지를 영영 못 본다.
    /// 배지도 0 이 되어 다시 열 이유가 사라진다.
    /// </summary>
    [Fact]
    public async Task Announcements_that_were_never_shown_stay_unread()
    {
        var reads = new MemoryStore<AnnouncementReadState>(new AnnouncementReadState());
        var (vm, _, _, stub) = Build(announcementReads: reads);
        stub.Enqueue(HttpStatusCode.OK, ManyAnnouncementsJson);

        vm.Announcements.OpenCommand.Execute(null);
        await vm.PendingWork;

        Assert.Equal(vm.Announcements.RowsHidden, vm.Announcements.UnreadCount);
        Assert.Equal(vm.Announcements.Rows.Count, reads.Load().ReadIds.Count);
    }
}
