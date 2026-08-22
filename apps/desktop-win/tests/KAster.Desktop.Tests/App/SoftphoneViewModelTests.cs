using System.Net;
using KAster.Desktop.App.Services;
using KAster.Desktop.App.ViewModels;
using KAster.Desktop.Core.Contracts;
using KAster.Desktop.Core.Server;
using KAster.Desktop.Core.State;
using KAster.Desktop.Softphone;
using KAster.Desktop.Tests.Server;
using Xunit;

namespace KAster.Desktop.Tests.App;

internal sealed class FakeSoftphone : ISoftphoneControl
{
    /// <summary>소리 경로가 안 열려 있으면 소프트폰은 음소거 요청을 삼킨다. 그 상황을 흉내 낸다.</summary>
    public bool IgnoresMute { get; set; }

    private bool _muted;

    public bool IsMuted
    {
        get => _muted;
        set { if (!IgnoresMute) _muted = value; }
    }
    public int AnswerCalls { get; private set; }
    public int HangupCalls { get; private set; }

    public Task<bool> AnswerAsync()
    {
        AnswerCalls++;
        return Task.FromResult(true);
    }

    public void Hangup() => HangupCalls++;
}

public class SoftphoneViewModelTests
{
    private const string AckJson = """
    {"success":true,"data":{"accepted":true,"requestedAt":"2026-08-20T04:00:00.000Z","correlationId":"c"},
    "error":null}
    """;

    private static readonly AgentProfile Agent = new()
    {
        AgentId = "a-1",
        AgentName = "김상담",
        Extension = "1001",
    };

    private DateTimeOffset _now = new(2026, 8, 20, 4, 0, 0, TimeSpan.Zero);

    private static readonly SoftphoneConfig SipConfig = new()
    {
        Enabled = true,
        SipUri = "sip:1001@pbx.local",
        SipServer = "49.247.46.86:48950",
        Transport = "udp",
        AuthorizationUsername = "1001",
        AuthorizationPassword = "s3cret-pw",
        DisplayName = "김상담",
    };

    private (SoftphoneViewModel Vm, CallStateStore Store, FakeSoftphone Phone, StubHttpHandler Stub) Build(
        bool useSoftphone = true,
        bool withSipConfig = true)
    {
        var stub = new StubHttpHandler();
        var store = new CallStateStore(Agent.AgentId, () => _now, null, Agent.Extension);
        var phone = new FakeSoftphone();
        var server = new CtiServerClient(new HttpClient(stub) { BaseAddress = new Uri("http://server/api/v1/") });
        return (
            new SoftphoneViewModel(
                store, server, phone, Agent, () => _now, useSoftphone, withSipConfig ? SipConfig : null),
            store, phone, stub);
    }

    private static ActiveCall Call(SessionStatus status, DateTimeOffset? answeredAt = null) => new()
    {
        CallId = "c-1",
        Linkedid = "l-1",
        Ani = "01011112222",
        SessionStatus = status,
        StartedAt = new DateTimeOffset(2026, 8, 20, 4, 0, 0, TimeSpan.Zero),
        AnsweredAt = answeredAt,
        PrimaryAgentId = "a-1",
        Customer = new CustomerInfo { CustomerName = "홍길동", PhoneNumber = "01011112222" },
    };

    [Fact]
    public void Starts_in_idle()
    {
        var (vm, _, _, _) = Build();

        Assert.Equal(WindowMode.Idle, vm.WindowMode);
    }

    [Fact]
    public void Follows_the_call_from_idle_through_ringing_and_talking_and_back()
    {
        var (vm, store, _, _) = Build();
        var seen = new List<WindowMode>();
        vm.WindowModeRequested += (_, mode) => seen.Add(mode);

        store.Apply(new CallCreatedEvent(Call(SessionStatus.RingingAgent)));
        Assert.Equal(WindowMode.Ringing, vm.WindowMode);

        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, _now)));
        Assert.Equal(WindowMode.Talking, vm.WindowMode);

        store.Apply(new CallEndedEvent(Call(SessionStatus.Ended)));
        Assert.Equal(WindowMode.Idle, vm.WindowMode);

        Assert.Equal(new[] { WindowMode.Ringing, WindowMode.Talking, WindowMode.Idle }, seen);
    }

    [Fact]
    public void After_call_work_gets_its_own_window_mode()
    {
        var (vm, store, _, _) = Build();

        store.Apply(new CallCreatedEvent(Call(SessionStatus.AfterCallWork, _now)));

        Assert.Equal(WindowMode.AfterCall, vm.WindowMode);
    }

    /// <summary>
    /// 큐에서 기다리는 통화는 아직 아무에게도 배정되지 않았다. 예전에는 이것도 자기 전화로
    /// 띄웠지만, 그러면 그 큐의 모든 상담원 화면이 같은 통화로 덮이고 받기 경쟁이 난다.
    /// 이제 그 자리는 당겨받기 목록이다.
    /// </summary>
    [Fact]
    public void A_queued_call_does_not_take_over_the_screen()
    {
        var (vm, store, _, _) = Build();

        store.Apply(new CallCreatedEvent(Call(SessionStatus.Queued) with { PrimaryAgentId = null }));

        Assert.Equal(WindowMode.Idle, vm.WindowMode);
    }

    /// <summary>배정되면 서버가 RINGING_AGENT 로 바꾸며 내 것이라고 알려 준다.</summary>
    [Fact]
    public void A_call_assigned_to_me_does_take_over_the_screen()
    {
        var (vm, store, _, _) = Build();

        store.Apply(new CallCreatedEvent(Call(SessionStatus.RingingAgent)));

        Assert.Equal(WindowMode.Ringing, vm.WindowMode);
    }

    /// <summary>상담원은 통화 중에 번호를 눈으로 읽고 받아 적는다. 붙어 있으면 자리를 세어야 한다.</summary>
    [Fact]
    public void Shows_the_customer_name_and_the_number_in_a_readable_shape()
    {
        var (vm, store, _, _) = Build();

        store.Apply(new CallCreatedEvent(Call(SessionStatus.RingingAgent)));

        Assert.Equal("홍길동", vm.CustomerName);
        Assert.Equal("010-1111-2222", vm.PhoneNumber);
    }

    /// <summary>
    /// 상담원이 받기 전에 가장 먼저 알아야 하는 것은 <b>고객이 어느 지사로 걸었는가</b>다.
    /// 인사말과 안내가 지사마다 다르다.
    /// </summary>
    [Fact]
    public void Shows_which_branch_the_customer_called()
    {
        var (vm, store, _, _) = Build();

        store.Apply(new CallCreatedEvent(Call(SessionStatus.RingingAgent) with
        {
            BranchName = "강남지사",
            RepresentativeNumber = "15881588",
        }));

        Assert.Equal("강남지사", vm.BranchName);
        Assert.Equal("1588-1588", vm.CalledNumber);
        Assert.Equal("강남지사 · 1588-1588", vm.CalledLine);
    }

    /// <summary>지사 매핑이 없는 번호도 있다. 그때는 번호만 보여 준다.</summary>
    [Fact]
    public void With_no_branch_mapping_the_called_number_stands_alone()
    {
        var (vm, store, _, _) = Build();

        store.Apply(new CallCreatedEvent(Call(SessionStatus.RingingAgent) with
        {
            BranchName = null,
            RepresentativeNumber = null,
            DidNumber = "0215881588",
        }));

        Assert.Equal(string.Empty, vm.BranchName);
        Assert.Equal("02-1588-1588", vm.CalledNumber);
        Assert.Equal("02-1588-1588", vm.CalledLine);
    }

    [Fact]
    public async Task The_number_being_dialled_is_shown_in_the_same_shape()
    {
        var (vm, _, _, stub) = Build();
        await Ready(vm, stub);
        stub.Enqueue(HttpStatusCode.OK, AckJson);
        vm.DialNumber = "01034623453";

        await vm.DialAsync();

        Assert.Equal("010-3462-3453", vm.DialingNumber);
    }

    /// <summary>
    /// 고객명은 모르는 경우가 더 많다. 예전에는 "알 수 없음" 을 크게 띄웠지만, 그러면 화면의
    /// 가장 좋은 자리를 아무 정보도 없는 문구가 차지한다. 번호가 그 자리를 대신한다.
    /// </summary>
    [Fact]
    public void An_unknown_customer_leaves_the_name_empty_and_shows_the_number()
    {
        var (vm, store, _, _) = Build();
        var unknown = Call(SessionStatus.RingingAgent) with { Customer = null };

        store.Apply(new CallCreatedEvent(unknown));

        Assert.Equal(string.Empty, vm.CustomerName);
        Assert.Equal("010-1111-2222", vm.PhoneNumber);
    }

    [Fact]
    public void The_timer_counts_from_answered_at()
    {
        var (vm, store, _, _) = Build();
        var answeredAt = _now;
        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, answeredAt)));

        _now = answeredAt.AddSeconds(75);
        vm.Tick();

        Assert.Equal("01:15", vm.CallDurationText);
    }

    [Fact]
    public void The_timer_shows_zero_before_the_call_is_answered()
    {
        var (vm, store, _, _) = Build();
        store.Apply(new CallCreatedEvent(Call(SessionStatus.RingingAgent)));

        _now = _now.AddSeconds(40);
        vm.Tick();

        Assert.Equal("00:00", vm.CallDurationText);
    }

    [Fact]
    public void The_timer_crosses_an_hour()
    {
        var (vm, store, _, _) = Build();
        var answeredAt = _now;
        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, answeredAt)));

        _now = answeredAt.AddSeconds(3725);
        vm.Tick();

        Assert.Equal("1:02:05", vm.CallDurationText);
    }

    /// <summary>
    /// 받기는 소프트폰이 SIP 200 OK 를 보내는 것으로 끝난다. 서버의 <c>calls/{id}/answer</c> 는
    /// <b>당겨받기</b>(남의 자리에 울리는 전화를 내 내선으로 끌어오기)라서, 이미 내 단말에 울리는
    /// 전화에 부르면 거부당한다. 서버는 PBX 이벤트로 응답을 알게 된다.
    /// </summary>
    [Fact]
    public async Task Answering_tells_the_softphone_and_does_not_ask_the_server_to_pick_up()
    {
        var (vm, store, phone, stub) = Build();
        store.Apply(new CallCreatedEvent(Call(SessionStatus.RingingAgent)));

        await vm.AnswerAsync();

        Assert.Equal(1, phone.AnswerCalls);
        Assert.Empty(stub.Requests);
    }

    /// <summary>
    /// 발신은 PBX 가 <b>우리 단말을 먼저</b> 부른 뒤 상대에게 잇는 방식이다. 그래서 우리가 건 전화인데도
    /// 수신 INVITE 가 들어온다. 여기서 다시 "받기"를 누르게 하면 안 된다 — 걸었으면 걸린 것이다.
    /// </summary>
    [Fact]
    public async Task A_call_we_placed_answers_itself_without_asking_again()
    {
        var (vm, _, phone, stub) = Build();
        await Ready(vm, stub);
        stub.Enqueue(HttpStatusCode.OK, AckJson);
        vm.DialNumber = "1002";
        await vm.DialAsync();

        vm.OnSoftphoneCallStatusChanged(new SoftphoneCallStatus(SoftphoneCallState.Ringing));

        Assert.Equal(1, phone.AnswerCalls);
    }

    /// <summary>
    /// PBX 가 서버의 HTTP 응답보다 <b>먼저</b> 우리를 부를 수 있다 (실측: INVITE 가 ack 보다 1ms 빨랐다).
    /// 자동 응답 창을 응답 뒤에 열면 그 한 통을 놓치고, 상담원은 자기가 건 전화를 다시 받아야 한다.
    /// </summary>
    [Fact]
    public async Task A_call_that_arrives_before_the_server_answers_is_still_ours()
    {
        var (vm, _, phone, stub) = Build();
        await Ready(vm, stub);

        // 요청을 받는 순간 INVITE 부터 도착시킨다.
        stub.RespondWith(request =>
        {
            vm.OnSoftphoneCallStatusChanged(new SoftphoneCallStatus(SoftphoneCallState.Ringing));
            return StubHttpHandler.Json(HttpStatusCode.OK, AckJson);
        });
        vm.DialNumber = "01011112222";

        await vm.DialAsync();

        Assert.Equal(1, phone.AnswerCalls);
    }

    /// <summary>거부당하면 그 창은 즉시 닫혀야 한다. 열어 둔 채로 두면 남의 전화를 받는다.</summary>
    [Fact]
    public async Task A_refused_call_does_not_leave_the_door_open()
    {
        var (vm, _, phone, stub) = Build();
        await Ready(vm, stub);
        stub.Enqueue(
            HttpStatusCode.BadRequest,
            """{"success":false,"data":null,"error":{"code":"BLOCKED","message":"발신이 차단된 번호"}}""");
        vm.DialNumber = "060123456";

        await vm.DialAsync();
        vm.OnSoftphoneCallStatusChanged(new SoftphoneCallStatus(SoftphoneCallState.Ringing));

        Assert.Equal(0, phone.AnswerCalls);
    }

    /// <summary>걸기를 눌렀는데 화면이 그대로면 눌린 건지 알 수 없다. 바로 발신 중으로 바뀌어야 한다.</summary>
    [Fact]
    public async Task Pressing_dial_shows_that_a_call_is_going_out()
    {
        var (vm, _, _, stub) = Build();
        await Ready(vm, stub);
        stub.Enqueue(HttpStatusCode.OK, AckJson);
        vm.DialNumber = "1002";

        await vm.DialAsync();

        Assert.True(vm.IsDialing);
        Assert.Equal("1002", vm.DialingNumber);   // 내선은 나누지 않는다
    }

    [Fact]
    public async Task A_refused_call_never_shows_as_going_out()
    {
        var (vm, _, _, stub) = Build();
        await Ready(vm, stub);
        stub.Enqueue(
            HttpStatusCode.BadRequest,
            """{"success":false,"data":null,"error":{"code":"BLOCKED","message":"발신이 차단된 번호"}}""");
        vm.DialNumber = "060123456";

        await vm.DialAsync();

        Assert.False(vm.IsDialing);
    }

    [Fact]
    public async Task The_call_arriving_ends_the_going_out_state()
    {
        var (vm, _, _, stub) = Build();
        await Ready(vm, stub);
        stub.Enqueue(HttpStatusCode.OK, AckJson);
        vm.DialNumber = "1002";
        await vm.DialAsync();

        vm.OnSoftphoneCallStatusChanged(new SoftphoneCallStatus(SoftphoneCallState.Ringing));

        Assert.False(vm.IsDialing);
    }

    /// <summary>
    /// PBX 가 되걸어 주지 않으면 아무 일도 일어나지 않는다. 그대로 두면 상담원은 "대기 중" 화면을
    /// 보며 전화가 걸린 줄 안다. 기한이 지나면 말해 준다.
    /// </summary>
    [Fact]
    public async Task A_call_that_never_comes_back_says_so_instead_of_going_quiet()
    {
        var (vm, _, _, stub) = Build();
        await Ready(vm, stub);
        stub.Enqueue(HttpStatusCode.OK, AckJson);
        vm.DialNumber = "1002";
        await vm.DialAsync();

        _now = _now.AddSeconds(46);
        vm.Tick();

        Assert.False(vm.IsDialing);
        Assert.Contains("전화가 오지 않았다", vm.NoticeMessage);
    }

    [Fact]
    public void A_call_we_did_not_place_still_waits_for_the_agent()
    {
        var (vm, _, phone, _) = Build();

        vm.OnSoftphoneCallStatusChanged(new SoftphoneCallStatus(SoftphoneCallState.Ringing));

        Assert.Equal(0, phone.AnswerCalls);
    }

    /// <summary>
    /// 발신이 실패해 아무 전화도 오지 않으면, 그 상태가 남아 있으면 안 된다.
    /// 한참 뒤 걸려 온 고객 전화를 말없이 받아 버리는 것이 가장 나쁜 결과다.
    /// </summary>
    [Fact]
    public async Task The_self_answer_window_closes_so_a_later_call_is_not_grabbed()
    {
        var (vm, _, phone, stub) = Build();
        await Ready(vm, stub);
        stub.Enqueue(HttpStatusCode.OK, AckJson);
        vm.DialNumber = "1002";
        await vm.DialAsync();

        _now = _now.AddMinutes(5);
        vm.OnSoftphoneCallStatusChanged(new SoftphoneCallStatus(SoftphoneCallState.Ringing));

        Assert.Equal(0, phone.AnswerCalls);
    }

    /// <summary>
    /// 내선 발신은 서버가 <c>direction</c> 을 outbound 로 남기지 않아, 세션의 번호가 상대가 아니라
    /// <b>우리 내선</b>으로 온다. 그러면 1002 로 걸었는데 화면에 1001 이 뜬다. 우리가 건 번호를 쓴다.
    /// </summary>
    [Fact]
    public async Task The_screen_shows_the_number_we_called_not_our_own_extension()
    {
        var (vm, store, _, stub) = Build();
        await Ready(vm, stub);
        stub.Enqueue(HttpStatusCode.OK, AckJson);
        vm.DialNumber = "1002";
        await vm.DialAsync();

        // 서버가 만든 세션은 우리 내선을 발신번호로 들고 온다.
        store.Apply(new CallCreatedEvent(Call(SessionStatus.RingingAgent) with
        {
            Ani = "1001",
            Customer = null,
        }));

        Assert.Equal("1002", vm.PhoneNumber);
    }

    [Fact]
    public async Task Hanging_up_tells_the_softphone_and_the_server()
    {
        var (vm, store, phone, stub) = Build();
        stub.Enqueue(HttpStatusCode.OK, AckJson);
        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, _now)));

        await vm.HangupAsync();

        Assert.Equal(1, phone.HangupCalls);
        Assert.Equal("/api/v1/calls/c-1/hangup", stub.Requests[0].RequestUri!.AbsolutePath);
    }

    [Fact]
    public async Task Muting_applies_locally_and_on_the_server()
    {
        var (vm, store, phone, stub) = Build();
        stub.Enqueue(HttpStatusCode.OK, AckJson);
        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, _now)));

        await vm.ToggleMuteAsync();

        // 로컬은 즉시 반영해야 상담원이 말을 멈춘 순간 실제로 안 나간다.
        Assert.True(phone.IsMuted);
        Assert.True(vm.IsMuted);
        Assert.Contains("\"state\":\"on\"", stub.Bodies[0]);
    }

    /// <summary>
    /// 소프트폰이 음소거를 못 걸었는데 화면만 "마이크 켜기" 로 바뀌면, 상담원은 꺼진 줄 알고 말한다.
    /// 상대에게 다 들린다. 화면은 <b>실제로 걸린 것</b>만 보여야 한다.
    /// </summary>
    [Fact]
    public async Task A_mute_the_softphone_could_not_apply_is_not_shown_as_applied()
    {
        var (vm, store, phone, stub) = Build();
        phone.IgnoresMute = true;
        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, _now)));

        await vm.ToggleMuteAsync();

        Assert.False(vm.IsMuted);
        Assert.Contains("마이크", vm.NoticeMessage);
        Assert.Empty(stub.Requests);
    }

    [Fact]
    public async Task Unmuting_sends_off()
    {
        var (vm, store, phone, stub) = Build();
        stub.Enqueue(HttpStatusCode.OK, AckJson).Enqueue(HttpStatusCode.OK, AckJson);
        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, _now)));

        await vm.ToggleMuteAsync();
        await vm.ToggleMuteAsync();

        Assert.False(phone.IsMuted);
        Assert.Contains("\"state\":\"off\"", stub.Bodies[1]);
    }

    [Fact]
    public async Task A_failed_server_command_surfaces_a_message_instead_of_throwing()
    {
        var (vm, store, _, stub) = Build();
        stub.Enqueue(
            HttpStatusCode.BadRequest,
            """{"success":false,"data":null,"error":{"code":"NO_LEG","message":"상담원 leg 없음"}}""");
        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, _now)));

        await vm.HangupAsync();

        Assert.Contains("상담원 leg 없음", vm.NoticeMessage);
    }

    [Fact]
    public async Task Changing_the_agent_status_posts_the_wire_value()
    {
        var (vm, _, _, stub) = Build();
        stub.Enqueue(
            HttpStatusCode.OK,
            """{"success":true,"data":{"agentId":"a-1","statusCode":"BREAK","reasonCode":null},"error":null}""");

        await vm.ChangeStatusAsync(AgentStatusCode.Break);

        Assert.Equal("/api/v1/agents/a-1/status", stub.Requests[0].RequestUri!.AbsolutePath);
        Assert.Equal(AgentStatusCode.Break, vm.AgentStatus);
    }

    private const string DirectoryJson = """
    {"success":true,"data":[
      {"agentId":"a-1","agentName":"김상담","extension":"1001"},
      {"agentId":"a-2","agentName":"이상담","extension":"1002"}
    ],"error":null}
    """;

    private const string CapabilitiesJson = """
    {"success":true,"data":{
      "canOriginateExternal":true,"canOriginateInternal":true,
      "outboundDialOptions":{"allowedCallerIds":["0215881588","07052346380"],"defaultCallerId":"07052346380"},
      "disabledReasons":[]},"error":null}
    """;

    /// <summary>
    /// 큐가 물어보는 호. 수락해야 전화기가 연결되고, 그 전까지 고객은 대기음을 듣고 있다.
    /// 이걸 화면에 못 띄우면 상담원은 누를 것이 없고 10초 뒤 다음 사람에게 넘어간다.
    /// </summary>
    [Fact]
    public void An_offered_call_takes_over_the_window()
    {
        var (vm, store, _, _) = Build();

        store.Apply(new CallOfferedEvent(new CallOffer
        {
            OfferId = "lk:1001", Linkedid = "lk", Extension = "1001",
            Caller = "01034623453", TimeoutSeconds = 10,
        }));

        Assert.True(vm.HasOffer);
        Assert.Equal(WindowMode.Ringing, vm.WindowMode);
        Assert.Equal("010-3462-3453", vm.OfferPhoneNumber);
    }

    /// <summary>제안은 테넌트 전체로 뿌려진다. 남의 것을 띄우면 옆자리 호를 가로챈다.</summary>
    [Fact]
    public void An_offer_for_someone_else_is_ignored()
    {
        var (vm, store, _, _) = Build();

        store.Apply(new CallOfferedEvent(new CallOffer
        {
            OfferId = "lk:2001", Linkedid = "lk", Extension = "2001", TimeoutSeconds = 10,
        }));

        Assert.False(vm.HasOffer);
    }

    /// <summary>
    /// 다른 상담원이 받았거나 시간이 지나면 내려야 한다. 안 내리면 이미 끝난 통화의
    /// 수락 버튼이 남아 상담원이 그걸 누른다.
    /// </summary>
    [Fact]
    public void A_closed_offer_leaves_the_window()
    {
        var (vm, store, _, _) = Build();
        store.Apply(new CallOfferedEvent(new CallOffer
        {
            OfferId = "lk:1001", Linkedid = "lk", Extension = "1001", TimeoutSeconds = 10,
        }));

        store.Apply(new CallOfferClosedEvent("lk:1001", "1001", "TIMEOUT"));

        Assert.False(vm.HasOffer);
        Assert.Equal(WindowMode.Idle, vm.WindowMode);
    }

    [Fact]
    public async Task Accepting_an_offer_tells_the_server_which_call_it_was()
    {
        var (vm, store, _, stub) = Build();
        await Ready(vm, stub);
        stub.Enqueue(HttpStatusCode.OK, AckJson);
        store.Apply(new CallOfferedEvent(new CallOffer
        {
            OfferId = "lk:1001", Linkedid = "lk", Extension = "1001", TimeoutSeconds = 10,
        }));

        await vm.RespondToOfferAsync(accept: true);

        var last = stub.Requests[^1];
        Assert.Equal("/api/v1/client/call-commands/offer/decision", last.RequestUri!.AbsolutePath);
        Assert.Contains("\"decision\":\"ACCEPT\"", stub.Bodies[^1]);
        Assert.Contains("\"linkedid\":\"lk\"", stub.Bodies[^1]);
    }

    [Fact]
    public async Task Rejecting_an_offer_says_so_and_clears_the_window()
    {
        var (vm, store, _, stub) = Build();
        await Ready(vm, stub);
        stub.Enqueue(HttpStatusCode.OK, AckJson);
        store.Apply(new CallOfferedEvent(new CallOffer
        {
            OfferId = "lk:1001", Linkedid = "lk", Extension = "1001", TimeoutSeconds = 10,
        }));

        await vm.RespondToOfferAsync(accept: false);

        Assert.Contains("\"decision\":\"REJECT\"", stub.Bodies[^1]);
        Assert.False(vm.HasOffer);
    }

    /// <summary>
    /// 돌려주기는 통화 중에만 뜻이 있다. 대기 중에 눌리면 아무 통화도 없이
    /// 대상 선택 화면이 떠서 상담원이 헤맨다.
    /// </summary>
    [Fact]
    public void Transfer_is_only_offered_while_on_a_call()
    {
        var (vm, store, _, _) = Build();
        Assert.False(vm.StartTransferCommand.CanExecute(null));

        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, _now)));

        Assert.True(vm.StartTransferCommand.CanExecute(null));
    }

    [Fact]
    public async Task Transfer_targets_are_colleagues_not_myself()
    {
        var (vm, store, _, stub) = Build();
        await Ready(vm, stub);
        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, _now)));

        vm.StartTransferCommand.Execute(null);

        Assert.True(vm.IsChoosingTransferTarget);
        Assert.Contains(vm.TransferTargets, t => t.Extension == "1002");
        Assert.DoesNotContain(vm.TransferTargets, t => t.Extension == "1001");
    }

    /// <summary>사람이 많으면 창에 다 들어가지 않는다. 창에 스크롤을 만들지 않는다.</summary>
    [Fact]
    public async Task Typing_narrows_the_transfer_list()
    {
        var (vm, store, _, stub) = Build();
        await Ready(vm, stub);
        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, _now)));
        vm.StartTransferCommand.Execute(null);

        vm.TransferFilter = "1002";

        Assert.All(vm.TransferTargets, t => Assert.Contains("1002", t.Extension));
    }

    [Fact]
    public async Task Transferring_sends_the_target_and_my_own_extension()
    {
        var (vm, store, _, stub) = Build();
        await Ready(vm, stub);
        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, _now)));
        vm.StartTransferCommand.Execute(null);
        stub.Enqueue(HttpStatusCode.OK, AckJson);

        await vm.TransferToAsync("1002");

        var last = stub.Requests[^1];
        Assert.Equal("/api/v1/calls/c-1/transfer", last.RequestUri!.AbsolutePath);
        Assert.Contains("\"transferType\":\"blind\"", stub.Bodies[^1]);
        Assert.Contains("\"target\":\"1002\"", stub.Bodies[^1]);
        Assert.Contains("\"fromExtension\":\"1001\"", stub.Bodies[^1]);
    }

    [Fact]
    public async Task Cancelling_the_target_pick_goes_back_to_the_call()
    {
        var (vm, store, _, stub) = Build();
        await Ready(vm, stub);
        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, _now)));
        vm.StartTransferCommand.Execute(null);

        vm.CancelTransferCommand.Execute(null);

        Assert.False(vm.IsChoosingTransferTarget);
        Assert.Equal(WindowMode.Talking, vm.WindowMode);
    }

    private static int DirectoryLookups(StubHttpHandler stub)
        => stub.Requests.Count(r => r.RequestUri!.AbsolutePath.EndsWith("/agents", StringComparison.Ordinal));

    private static async Task<StubHttpHandler> Ready(SoftphoneViewModel vm, StubHttpHandler stub)
    {
        stub.Enqueue(HttpStatusCode.OK, DirectoryJson).Enqueue(HttpStatusCode.OK, CapabilitiesJson);
        await vm.LoadDialSetupAsync();
        return stub;
    }

    [Fact]
    public async Task Dialing_an_external_number_goes_through_the_client_command_path()
    {
        var (vm, _, _, stub) = Build();
        await Ready(vm, stub);
        stub.Enqueue(HttpStatusCode.OK, AckJson);
        vm.DialNumber = "01011112222";

        await vm.DialAsync();

        Assert.Equal("/api/v1/client/call-commands/originate", stub.Requests[2].RequestUri!.AbsolutePath);
        Assert.Contains("\"phoneNumber\":\"01011112222\"", stub.Bodies[2]);
    }

    /// <summary>내선은 외부 발신 규칙에 걸려 거부된다. 목록에 있는 내선이면 내선 경로로 보낸다.</summary>
    [Fact]
    public async Task Dialing_a_colleagues_extension_goes_through_the_extension_path()
    {
        var (vm, _, _, stub) = Build();
        await Ready(vm, stub);
        stub.Enqueue(HttpStatusCode.OK, AckJson);
        vm.DialNumber = "1002";

        await vm.DialAsync();

        Assert.Equal("/api/v1/calls/originate/internal", stub.Requests[2].RequestUri!.AbsolutePath);
        Assert.Contains("\"targetExtension\":\"1002\"", stub.Bodies[2]);
    }

    /// <summary>
    /// 119·112 는 세 자리라 내선처럼 보이지만 내선이 아니다. 자릿수로 짐작하지 않고
    /// <b>실제 상담원 내선 목록</b>에 있는지로만 가른다. 잘못 가르면 긴급전화가 사내로 빠진다.
    /// </summary>
    [Theory]
    [InlineData("119")]
    [InlineData("112")]
    [InlineData("114")]
    [InlineData("1588")]
    public async Task A_short_number_that_is_not_an_extension_still_goes_outside(string number)
    {
        var (vm, _, _, stub) = Build();
        await Ready(vm, stub);
        stub.Enqueue(HttpStatusCode.OK, AckJson);
        vm.DialNumber = number;

        await vm.DialAsync();

        Assert.Equal("/api/v1/client/call-commands/originate", stub.Requests[2].RequestUri!.AbsolutePath);
    }

    [Fact]
    public async Task The_allowed_caller_ids_arrive_with_the_default_already_chosen()
    {
        var (vm, _, _, stub) = Build();
        await Ready(vm, stub);

        Assert.Equal(new[] { "0215881588", "07052346380" }, vm.CallerIds);
        Assert.Equal("07052346380", vm.SelectedCallerId);
    }

    [Fact]
    public async Task An_external_call_carries_the_chosen_caller_id()
    {
        var (vm, _, _, stub) = Build();
        await Ready(vm, stub);
        stub.Enqueue(HttpStatusCode.OK, AckJson);
        vm.SelectedCallerId = "0215881588";
        vm.DialNumber = "01011112222";

        await vm.DialAsync();

        Assert.Contains("\"callerId\":\"0215881588\"", stub.Bodies[2]);
    }

    /// <summary>발신번호는 외부 발신에만 쓴다. 내선 통화에 실어 보내면 서버가 모르는 필드가 된다.</summary>
    [Fact]
    public async Task An_internal_call_carries_no_caller_id()
    {
        var (vm, _, _, stub) = Build();
        await Ready(vm, stub);
        stub.Enqueue(HttpStatusCode.OK, AckJson);
        vm.DialNumber = "1002";

        await vm.DialAsync();

        Assert.DoesNotContain("callerId", stub.Bodies[2]);
    }

    /// <summary>내선을 누르는 동안 발신번호 칸이 떠 있으면 헷갈린다. 외부 번호일 때만 보인다.</summary>
    [Fact]
    public async Task The_caller_id_picker_only_shows_for_an_outside_number()
    {
        var (vm, _, _, stub) = Build();
        await Ready(vm, stub);

        vm.DialNumber = "1002";
        Assert.False(vm.ShowsCallerIdPicker);

        vm.DialNumber = "01011112222";
        Assert.True(vm.ShowsCallerIdPicker);
    }

    /// <summary>발신번호가 하나도 등록돼 있지 않으면 고를 것이 없다.</summary>
    [Fact]
    public async Task With_no_registered_caller_id_the_picker_stays_hidden()
    {
        var (vm, _, _, stub) = Build();
        stub.Enqueue(HttpStatusCode.OK, DirectoryJson).Enqueue(HttpStatusCode.OK, """
        {"success":true,"data":{
          "canOriginateExternal":false,"canOriginateInternal":true,
          "outboundDialOptions":{"allowedCallerIds":[],"defaultCallerId":null},
          "disabledReasons":["허용된 발신번호가 설정되어 있지 않습니다."]},"error":null}
        """);
        await vm.LoadDialSetupAsync();

        vm.DialNumber = "01011112222";

        Assert.Empty(vm.CallerIds);
        Assert.False(vm.ShowsCallerIdPicker);
    }

    /// <summary>서버가 목록을 못 주더라도 앱이 죽으면 안 된다. 발신만 못 하고 나머지는 그대로 돈다.</summary>
    [Fact]
    public async Task A_broken_directory_call_does_not_take_the_app_down()
    {
        var (vm, _, _, stub) = Build();
        const string Failure = """{"success":false,"data":null,"error":{"code":"X","message":"서버 오류"}}""";
        stub.Enqueue(HttpStatusCode.InternalServerError, Failure)
            .Enqueue(HttpStatusCode.InternalServerError, Failure);

        await vm.LoadDialSetupAsync();

        Assert.Empty(vm.CallerIds);
        Assert.Contains("서버 오류", vm.NoticeMessage);
    }

    [Fact]
    public async Task Dialing_clears_the_number_so_the_next_call_starts_empty()
    {
        var (vm, _, _, stub) = Build();
        await Ready(vm, stub);
        stub.Enqueue(HttpStatusCode.OK, AckJson);
        vm.DialNumber = "1002";

        await vm.DialAsync();

        Assert.Equal(string.Empty, vm.DialNumber);
    }

    /// <summary>전화번호에는 숫자와 몇 개의 기호만 온다. 실수로 붙은 공백·하이픈은 서버가 거부한다.</summary>
    [Fact]
    public async Task Dialing_strips_the_separators_people_type()
    {
        var (vm, _, _, stub) = Build();
        await Ready(vm, stub);
        stub.Enqueue(HttpStatusCode.OK, AckJson);
        vm.DialNumber = " 010-1234-5678 ";

        await vm.DialAsync();

        Assert.Contains("\"phoneNumber\":\"01012345678\"", stub.Bodies[2]);
    }

    [Fact]
    public async Task Dialing_nothing_sends_nothing()
    {
        var (vm, _, _, stub) = Build();
        vm.DialNumber = "   ";

        await vm.DialAsync();

        Assert.Empty(stub.Requests);
    }

    [Fact]
    public void Dialing_is_only_offered_while_no_call_is_in_progress()
    {
        var (vm, store, _, _) = Build();
        vm.DialNumber = "1002";
        Assert.True(vm.DialCommand.CanExecute(null));

        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, _now)));
        Assert.False(vm.DialCommand.CanExecute(null));
    }

    [Fact]
    public void An_empty_number_leaves_the_dial_button_off()
    {
        var (vm, _, _, _) = Build();

        Assert.False(vm.DialCommand.CanExecute(null));

        vm.DialNumber = "1002";
        Assert.True(vm.DialCommand.CanExecute(null));
    }

    [Fact]
    public async Task A_refused_call_says_why_instead_of_throwing()
    {
        var (vm, _, _, stub) = Build();
        await Ready(vm, stub);
        stub.Enqueue(
            HttpStatusCode.BadRequest,
            """{"success":false,"data":null,"error":{"code":"BLOCKED","message":"발신이 차단된 번호"}}""");
        vm.DialNumber = "060123456";

        await vm.DialAsync();

        Assert.Contains("발신이 차단된 번호", vm.NoticeMessage);
    }

    /// <summary>거절당한 번호는 지우지 않는다. 고쳐서 다시 걸 수 있어야 한다.</summary>
    [Fact]
    public async Task A_refused_call_keeps_the_number_on_screen()
    {
        var (vm, _, _, stub) = Build();
        await Ready(vm, stub);
        stub.Enqueue(
            HttpStatusCode.BadRequest,
            """{"success":false,"data":null,"error":{"code":"BLOCKED","message":"발신이 차단된 번호"}}""");
        vm.DialNumber = "060123456";

        await vm.DialAsync();

        Assert.Equal("060123456", vm.DialNumber);
    }

    [Fact]
    public async Task Going_on_break_and_coming_back_both_post()
    {
        var (vm, _, _, stub) = Build();
        stub.Enqueue(
            HttpStatusCode.OK,
            """{"success":true,"data":{"agentId":"a-1","statusCode":"BREAK","reasonCode":null},"error":null}""");
        stub.Enqueue(
            HttpStatusCode.OK,
            """{"success":true,"data":{"agentId":"a-1","statusCode":"AVAILABLE","reasonCode":null},"error":null}""");

        await vm.ChangeStatusAsync(AgentStatusCode.Break);
        Assert.Equal(AgentStatusCode.Break, vm.AgentStatus);
        Assert.False(vm.IsAvailable);

        await vm.ChangeStatusAsync(AgentStatusCode.Available);
        Assert.Equal(AgentStatusCode.Available, vm.AgentStatus);
        Assert.True(vm.IsAvailable);
    }

    /// <summary>통화 중에 이석으로 바꾸면 전화가 끊기는 게 아니라 다음 배정이 멈춰야 한다. 그래도 지금은 막는다.</summary>
    [Fact]
    public void Status_cannot_be_changed_while_a_call_is_in_progress()
    {
        var (vm, store, _, _) = Build();
        Assert.True(vm.ToggleAvailabilityCommand.CanExecute(null));

        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, _now)));
        Assert.False(vm.ToggleAvailabilityCommand.CanExecute(null));
    }

    /// <summary>
    /// 서버 연결과 전화 등록은 다른 것이다. 웹소켓만 보고 "연결됨"을 띄우면, 전화 등록이 죽어도
    /// 화면은 멀쩡해 보이고 상담원은 전화가 안 오는 이유를 알 수 없다. 둘을 따로 보여 준다.
    /// </summary>
    [Fact]
    public void The_phone_registration_is_shown_separately_from_the_server_link()
    {
        var (vm, _, _, _) = Build();

        vm.OnConnectionStateChanged(CtiConnectionState.Connected);
        Assert.True(vm.IsConnected);
        Assert.False(vm.IsPhoneRegistered);

        vm.OnRegistrationStatusChanged(new RegistrationStatus(RegistrationState.Registered));
        Assert.True(vm.IsPhoneRegistered);
        Assert.Equal("전화 준비됨", vm.PhoneStatusText);

        vm.OnRegistrationStatusChanged(new RegistrationStatus(RegistrationState.Failed, "403 Forbidden"));
        Assert.False(vm.IsPhoneRegistered);
        Assert.Contains("403", vm.PhoneStatusText);
    }

    [Theory]
    [InlineData(RegistrationState.Stopped, "전화 꺼짐")]
    [InlineData(RegistrationState.Registering, "전화 등록 중")]
    public void Every_registration_state_says_something_readable(RegistrationState state, string expected)
    {
        var (vm, _, _, _) = Build();

        vm.OnRegistrationStatusChanged(new RegistrationStatus(state));

        Assert.Equal(expected, vm.PhoneStatusText);
        Assert.False(vm.IsPhoneRegistered);
    }

    /// <summary>
    /// 메모는 통화가 끝날 때 저장한다. 통화 중에 적어 둔 것이 화면 전환과 함께 사라지면
    /// 상담원은 그걸 다시 쓸 방법이 없다.
    /// </summary>
    [Fact]
    public void A_memo_typed_during_the_call_is_filed_when_it_ends()
    {
        var (vm, store, _, stub) = Build();
        stub.Enqueue(HttpStatusCode.OK, """{"success":true,"data":{},"error":null}""");
        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, _now)));
        vm.MemoText = "고객이 재통화 요청";

        store.Apply(new CallEndedEvent(Call(SessionStatus.Ended)));

        Assert.Equal("/api/v1/calls/c-1/memo", stub.Requests[0].RequestUri!.AbsolutePath);
        Assert.Equal(string.Empty, vm.MemoText);
    }

    /// <summary>빈 메모까지 서버로 보내면 통화마다 빈 줄이 쌓인다.</summary>
    [Fact]
    public void An_empty_memo_is_not_filed()
    {
        var (vm, store, _, stub) = Build();
        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, _now)));
        vm.MemoText = "   ";

        store.Apply(new CallEndedEvent(Call(SessionStatus.Ended)));

        Assert.Empty(stub.Requests);
    }

    /// <summary>다음 통화에 앞 통화의 메모가 남아 있으면 엉뚱한 통화에 붙는다.</summary>
    [Fact]
    public void A_new_call_starts_with_an_empty_memo()
    {
        var (vm, store, _, stub) = Build();
        stub.Enqueue(HttpStatusCode.OK, """{"success":true,"data":{},"error":null}""");
        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, _now)));
        vm.MemoText = "첫 통화";
        store.Apply(new CallEndedEvent(Call(SessionStatus.Ended)));

        store.Apply(new CallCreatedEvent(Call(SessionStatus.RingingAgent)));

        Assert.Equal(string.Empty, vm.MemoText);
    }

    /// <summary>
    /// 관리자가 상담원을 강제로 이석시키면 그 상담원 화면도 바뀌어야 한다.
    /// 서버는 <c>agent.status.changed</c> 로 알려 주는데 지금까지 화면이 버리고 있었다.
    /// </summary>
    [Fact]
    public void A_status_change_made_elsewhere_reaches_this_screen()
    {
        var (vm, _, _, _) = Build();
        Assert.True(vm.IsAvailable);

        vm.Apply(new AgentStatusChangedEvent(new AgentStatusChange
        {
            AgentId = "a-1",
            StatusCode = AgentStatusCode.Break,
        }));

        Assert.Equal(AgentStatusCode.Break, vm.AgentStatus);
        Assert.False(vm.IsAvailable);
    }

    /// <summary>같은 테넌트의 다른 상담원 상태까지 내 화면에 반영하면 안 된다.</summary>
    [Fact]
    public void Another_agents_status_is_none_of_our_business()
    {
        var (vm, _, _, _) = Build();

        vm.Apply(new AgentStatusChangedEvent(new AgentStatusChange
        {
            AgentId = "a-2",
            StatusCode = AgentStatusCode.Break,
        }));

        Assert.Equal(AgentStatusCode.Available, vm.AgentStatus);
    }

    /// <summary>스크린팝은 통화 중에 고객이 누구인지 알려 준다. 화면에는 이미 자리가 있다.</summary>
    [Fact]
    public void A_screen_pop_names_the_customer_on_the_call()
    {
        var (vm, store, _, _) = Build();
        store.Apply(new CallCreatedEvent(Call(SessionStatus.RingingAgent) with { Customer = null }));
        Assert.Equal(string.Empty, vm.CustomerName);

        vm.Apply(new ScreenPopEvent("c-1", new CustomerInfo
        {
            CustomerId = "cu-9",
            CustomerName = "이순신",
            PhoneNumber = "01099998888",
        }));

        Assert.Equal("이순신", vm.CustomerName);
    }

    /// <summary>다른 통화의 스크린팝이 지금 화면을 덮어쓰면 안 된다.</summary>
    [Fact]
    public void A_screen_pop_for_another_call_is_ignored()
    {
        var (vm, store, _, _) = Build();
        store.Apply(new CallCreatedEvent(Call(SessionStatus.RingingAgent)));

        vm.Apply(new ScreenPopEvent("other-call", new CustomerInfo { CustomerName = "이순신" }));

        Assert.Equal("홍길동", vm.CustomerName);
    }

    [Fact]
    public void The_realtime_connection_state_is_shown()
    {
        var (vm, _, _, _) = Build();

        vm.OnConnectionStateChanged(CtiConnectionState.Connected);
        Assert.True(vm.IsConnected);

        vm.OnConnectionStateChanged(CtiConnectionState.Disconnected);
        Assert.False(vm.IsConnected);
    }

    /// <summary>
    /// 실기기 모드에서는 소프트폰이 아예 안 돈다. 받기는 서버의 당겨받기로 나가야 한다 —
    /// 그게 울리는 고객 레그를 이 내선으로 돌리는 경로다.
    /// </summary>
    [Fact]
    public async Task On_a_desk_phone_answering_goes_through_the_server()
    {
        var (vm, store, phone, stub) = Build(useSoftphone: false);
        stub.Enqueue(HttpStatusCode.OK, AckJson);
        store.Apply(new CallCreatedEvent(Call(SessionStatus.RingingAgent)));

        await vm.AnswerAsync();

        Assert.Equal(0, phone.AnswerCalls);
        Assert.Equal("/api/v1/calls/c-1/answer", stub.Requests[0].RequestUri!.AbsolutePath);
    }

    /// <summary>실기기 모드에는 우리 오디오가 없다. 음소거는 PBX 가 건다.</summary>
    [Fact]
    public async Task On_a_desk_phone_muting_is_the_servers_job()
    {
        var (vm, store, phone, stub) = Build(useSoftphone: false);
        stub.Enqueue(HttpStatusCode.OK, AckJson);
        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, _now)));

        await vm.ToggleMuteAsync();

        Assert.False(phone.IsMuted);
        Assert.True(vm.IsMuted);
        Assert.Equal("/api/v1/calls/c-1/mute", stub.Requests[0].RequestUri!.AbsolutePath);
    }

    /// <summary>실기기 모드에서 우리 SIP 등록 상태를 보여 주면 거짓말이다. 우리는 등록하지 않는다.</summary>
    [Fact]
    public void On_a_desk_phone_the_status_describes_the_desk_phone()
    {
        var (vm, _, _, _) = Build(useSoftphone: false);

        Assert.Equal("전화기 확인 중", vm.PhoneStatusText);
        Assert.False(vm.IsPhoneRegistered);
    }

    [Fact]
    public async Task A_desk_phone_that_is_registered_says_so()
    {
        var (vm, _, _, stub) = Build(useSoftphone: false);
        stub.Enqueue(HttpStatusCode.OK, """
        {"success":true,"data":[
          {"agentId":"a-1","agentName":"김상담","extension":"1001",
           "sipRegistration":{"registered":true,"registrationStatus":"Avail","contactUri":"sip:1001@x","userAgent":"Yealink"}}
        ],"error":null}
        """).Enqueue(HttpStatusCode.OK, CapabilitiesJson);

        await vm.LoadDialSetupAsync();

        Assert.True(vm.IsPhoneRegistered);
        Assert.Equal("전화기 준비됨", vm.PhoneStatusText);
    }

    /// <summary>
    /// 등록 안 된 내선으로 로그인하면 전화가 한 통도 안 온다. 그 사실을 로그인 직후에 말해야 한다.
    /// </summary>
    [Fact]
    public async Task A_desk_phone_that_is_missing_says_that_too()
    {
        var (vm, _, _, stub) = Build(useSoftphone: false);
        stub.Enqueue(HttpStatusCode.OK, """
        {"success":true,"data":[
          {"agentId":"a-1","agentName":"김상담","extension":"1001",
           "sipRegistration":{"registered":false,"registrationStatus":"UNREGISTERED"}}
        ],"error":null}
        """).Enqueue(HttpStatusCode.OK, CapabilitiesJson);

        await vm.LoadDialSetupAsync();

        Assert.False(vm.IsPhoneRegistered);
        Assert.Contains("등록되지", vm.PhoneStatusText);
    }

    /// <summary>소프트폰 모드에서는 서버가 보내 준 남의 등록 상태가 우리 표시를 건드리면 안 된다.</summary>
    [Fact]
    public async Task In_softphone_mode_the_directory_does_not_touch_the_phone_status()
    {
        var (vm, _, _, stub) = Build(useSoftphone: true);
        vm.OnRegistrationStatusChanged(new RegistrationStatus(RegistrationState.Registered));
        stub.Enqueue(HttpStatusCode.OK, """
        {"success":true,"data":[
          {"agentId":"a-1","agentName":"김상담","extension":"1001",
           "sipRegistration":{"registered":false,"registrationStatus":"UNREGISTERED"}}
        ],"error":null}
        """).Enqueue(HttpStatusCode.OK, CapabilitiesJson);

        await vm.LoadDialSetupAsync();

        Assert.True(vm.IsPhoneRegistered);
        Assert.Equal("전화 준비됨", vm.PhoneStatusText);
    }

    /// <summary>
    /// 전화기가 등록돼 있지 않으면 전화를 한 통도 못 받는다. 그 자리에서 가장 필요한 것은
    /// "대기 중" 이라는 안내가 아니라 <b>전화기에 넣을 정보</b>다.
    /// </summary>
    [Fact]
    public async Task An_unregistered_desk_phone_is_told_what_to_type_into_it()
    {
        var (vm, _, _, stub) = Build(useSoftphone: false);
        stub.Enqueue(HttpStatusCode.OK, """
        {"success":true,"data":[{"agentId":"a-1","agentName":"김상담","extension":"1001",
         "sipRegistration":{"registered":false,"registrationStatus":"UNREGISTERED"}}],"error":null}
        """).Enqueue(HttpStatusCode.OK, CapabilitiesJson);

        await vm.LoadDialSetupAsync();

        Assert.True(vm.ShowsDeskPhoneSetup);
        Assert.Equal("49.247.46.86:48950", vm.SipServerAddress);
        Assert.Equal("1001", vm.SipUsername);
        Assert.Equal("pbx.local", vm.SipDomain);
        Assert.Equal("UDP", vm.SipTransport);
    }

    /// <summary>등록이 끝나면 그 안내는 자리를 비켜야 한다.</summary>
    [Fact]
    public async Task A_registered_desk_phone_does_not_need_the_instructions()
    {
        var (vm, _, _, stub) = Build(useSoftphone: false);
        stub.Enqueue(HttpStatusCode.OK, """
        {"success":true,"data":[{"agentId":"a-1","agentName":"김상담","extension":"1001",
         "sipRegistration":{"registered":true,"registrationStatus":"Avail"}}],"error":null}
        """).Enqueue(HttpStatusCode.OK, CapabilitiesJson);

        await vm.LoadDialSetupAsync();

        Assert.False(vm.ShowsDeskPhoneSetup);
    }

    /// <summary>소프트폰 모드에는 책상 전화기가 없다.</summary>
    [Fact]
    public void Softphone_mode_never_shows_desk_phone_instructions()
    {
        var (vm, _, _, _) = Build(useSoftphone: true);

        Assert.False(vm.ShowsDeskPhoneSetup);
    }

    /// <summary>
    /// 비밀번호는 기본으로 가린다. 상담원 자리 화면은 지나가는 사람에게 다 보인다.
    /// 전화기에 넣을 때만 펼친다.
    /// </summary>
    [Fact]
    public void The_sip_password_is_hidden_until_it_is_asked_for()
    {
        var (vm, _, _, _) = Build(useSoftphone: false);

        Assert.Equal("••••••••", vm.SipPasswordDisplay);
        Assert.False(vm.IsSipPasswordVisible);

        vm.ToggleSipPasswordCommand.Execute(null);

        Assert.True(vm.IsSipPasswordVisible);
        Assert.Equal("s3cret-pw", vm.SipPasswordDisplay);
    }

    /// <summary>서버가 SIP 정보를 안 내려주는 현장이 있다. 빈 칸을 보여 주면 더 헷갈린다.</summary>
    [Fact]
    public async Task With_no_sip_config_the_screen_says_so_instead_of_showing_blanks()
    {
        var (vm, _, _, stub) = Build(useSoftphone: false, withSipConfig: false);
        stub.Enqueue(HttpStatusCode.OK, """
        {"success":true,"data":[{"agentId":"a-1","agentName":"김상담","extension":"1001",
         "sipRegistration":{"registered":false,"registrationStatus":"UNREGISTERED"}}],"error":null}
        """).Enqueue(HttpStatusCode.OK, CapabilitiesJson);

        await vm.LoadDialSetupAsync();

        Assert.False(vm.ShowsDeskPhoneSetup);
        Assert.Contains("등록되지", vm.PhoneStatusText);
    }

    private const string DeskPhoneJson = """
    {"success":true,"data":[{"agentId":"a-1","agentName":"김상담","extension":"1001",
     "sipRegistration":{"registered":false,"registrationStatus":"UNREGISTERED"}}],"error":null}
    """;

    private const string DeskPhoneReadyJson = """
    {"success":true,"data":[{"agentId":"a-1","agentName":"김상담","extension":"1001",
     "sipRegistration":{"registered":true,"registrationStatus":"Avail"}}],"error":null}
    """;

    /// <summary>
    /// 상담원이 전화기에 값을 넣는 동안 화면은 그대로다. 등록이 끝났는데도 "등록되지 않았다" 가
    /// 계속 떠 있으면 뭘 잘못한 줄 알고 다시 입력한다. 스스로 다시 확인해야 한다.
    /// </summary>
    [Fact]
    public async Task A_desk_phone_that_registers_later_is_noticed_without_asking()
    {
        var (vm, _, _, stub) = Build(useSoftphone: false);
        stub.Enqueue(HttpStatusCode.OK, DeskPhoneJson).Enqueue(HttpStatusCode.OK, CapabilitiesJson);
        await vm.LoadDialSetupAsync();
        Assert.False(vm.IsPhoneRegistered);

        // 전화기가 등록됐다. 대기 콜 조회도 같은 Tick 에서 도므로 경로로 응답한다.
        stub.RespondWith(request => request.RequestUri!.AbsolutePath.EndsWith("/agents", StringComparison.Ordinal)
            ? StubHttpHandler.Json(HttpStatusCode.OK, DeskPhoneReadyJson)
            : StubHttpHandler.Json(HttpStatusCode.OK, """{"success":true,"data":[],"error":null}"""));
        _now = _now.AddSeconds(6);
        vm.Tick();
        await vm.PendingWork;

        Assert.True(vm.IsPhoneRegistered);
        Assert.False(vm.ShowsDeskPhoneSetup);
    }

    /// <summary>확인이 1초마다 나가면 서버를 쓸데없이 두드린다.</summary>
    [Fact]
    public async Task The_recheck_does_not_run_every_second()
    {
        var (vm, _, _, stub) = Build(useSoftphone: false);
        stub.Enqueue(HttpStatusCode.OK, DeskPhoneJson).Enqueue(HttpStatusCode.OK, CapabilitiesJson);
        await vm.LoadDialSetupAsync();

        stub.RespondWith(_ => StubHttpHandler.Json(HttpStatusCode.OK, """{"success":true,"data":[],"error":null}"""));
        _now = _now.AddSeconds(1);
        vm.Tick();
        await vm.PendingWork;

        Assert.Equal(1, DirectoryLookups(stub));
    }

    /// <summary>등록이 끝난 뒤에도 죽는 것을 알아야 하지만, 그때는 자주 볼 필요가 없다.</summary>
    [Fact]
    public async Task Once_registered_the_recheck_slows_down()
    {
        var (vm, _, _, stub) = Build(useSoftphone: false);
        stub.Enqueue(HttpStatusCode.OK, DeskPhoneReadyJson).Enqueue(HttpStatusCode.OK, CapabilitiesJson);
        await vm.LoadDialSetupAsync();
        Assert.True(vm.IsPhoneRegistered);

        stub.RespondWith(request => request.RequestUri!.AbsolutePath.EndsWith("/agents", StringComparison.Ordinal)
            ? StubHttpHandler.Json(HttpStatusCode.OK, DeskPhoneReadyJson)
            : StubHttpHandler.Json(HttpStatusCode.OK, """{"success":true,"data":[],"error":null}"""));

        _now = _now.AddSeconds(10);
        vm.Tick();
        await vm.PendingWork;
        Assert.Equal(1, DirectoryLookups(stub));

        _now = _now.AddSeconds(25);
        vm.Tick();
        await vm.PendingWork;
        Assert.Equal(2, DirectoryLookups(stub));
    }

    /// <summary>소프트폰 모드는 우리가 직접 등록하므로 서버에 물어볼 것이 없다.</summary>
    [Fact]
    public async Task Softphone_mode_never_polls_for_a_desk_phone()
    {
        var (vm, _, _, stub) = Build(useSoftphone: true);
        stub.Enqueue(HttpStatusCode.OK, DeskPhoneJson).Enqueue(HttpStatusCode.OK, CapabilitiesJson);
        await vm.LoadDialSetupAsync();

        stub.RespondWith(_ => StubHttpHandler.Json(HttpStatusCode.OK, """{"success":true,"data":[],"error":null}"""));
        _now = _now.AddMinutes(5);
        vm.Tick();
        await vm.PendingWork;

        Assert.Equal(1, DirectoryLookups(stub));
    }

    /// <summary>기다리지 않고 바로 확인하고 싶을 때가 있다.</summary>
    [Fact]
    public async Task The_agent_can_ask_for_a_recheck_right_away()
    {
        var (vm, _, _, stub) = Build(useSoftphone: false);
        stub.Enqueue(HttpStatusCode.OK, DeskPhoneJson).Enqueue(HttpStatusCode.OK, CapabilitiesJson);
        await vm.LoadDialSetupAsync();

        stub.Enqueue(HttpStatusCode.OK, DeskPhoneReadyJson);
        await vm.RecheckDeskPhoneAsync();

        Assert.True(vm.IsPhoneRegistered);
    }

    /// <summary>확인이 실패했다고 화면에 오류를 계속 띄우면 안 된다. 조용히 다음 차례를 기다린다.</summary>
    [Fact]
    public async Task A_failed_recheck_stays_quiet()
    {
        var (vm, _, _, stub) = Build(useSoftphone: false);
        stub.Enqueue(HttpStatusCode.OK, DeskPhoneJson).Enqueue(HttpStatusCode.OK, CapabilitiesJson);
        await vm.LoadDialSetupAsync();

        stub.RespondWith(_ => StubHttpHandler.Json(
            HttpStatusCode.InternalServerError,
            """{"success":false,"data":null,"error":{"code":"X","message":"서버 오류"}}"""));
        _now = _now.AddSeconds(6);
        vm.Tick();
        await vm.PendingWork;

        Assert.Null(vm.NoticeMessage);
        Assert.False(vm.IsPhoneRegistered);
    }

    /// <summary>
    /// 발신은 PBX 가 우리 단말을 먼저 부르는 방식이라 수신 INVITE 로 들어온다. 그렇다고 화면에
    /// "수신 전화 / 받기" 라고 띄우면, 방금 자기가 건 전화를 받아야 하는 줄 알고 멈칫한다.
    /// </summary>
    [Fact]
    public async Task A_call_we_placed_is_not_labelled_as_an_incoming_one()
    {
        var (vm, store, _, stub) = Build(useSoftphone: false);
        await Ready(vm, stub);
        stub.Enqueue(HttpStatusCode.OK, AckJson);
        vm.DialNumber = "01034623453";
        await vm.DialAsync();

        store.Apply(new CallCreatedEvent(Call(SessionStatus.RingingAgent) with { Customer = null }));

        Assert.True(vm.IsOutboundCall);
        Assert.Equal(WindowMode.Ringing, vm.WindowMode);
        Assert.False(vm.AnswerCommand.CanExecute(null));
    }

    [Fact]
    public void A_call_that_arrives_on_its_own_is_still_answerable()
    {
        var (vm, store, _, _) = Build(useSoftphone: false);

        store.Apply(new CallCreatedEvent(Call(SessionStatus.RingingAgent)));

        Assert.False(vm.IsOutboundCall);
        Assert.True(vm.AnswerCommand.CanExecute(null));
    }

    /// <summary>통화가 끝나면 다음 수신 전화는 다시 받을 수 있어야 한다.</summary>
    [Fact]
    public async Task The_outbound_mark_clears_when_the_call_ends()
    {
        var (vm, store, _, stub) = Build(useSoftphone: false);
        await Ready(vm, stub);
        stub.Enqueue(HttpStatusCode.OK, AckJson);
        vm.DialNumber = "01034623453";
        await vm.DialAsync();
        store.Apply(new CallCreatedEvent(Call(SessionStatus.RingingAgent)));
        Assert.True(vm.IsOutboundCall);

        store.Apply(new CallEndedEvent(Call(SessionStatus.Ended)));

        Assert.False(vm.IsOutboundCall);
    }

    /// <summary>대기 8건. 화면에 다 못 들어가는 상황을 만든다.</summary>
    private static readonly string ManyWaitingJson =
        """{"success":true,"data":["""
        + string.Join(",", Enumerable.Range(1, 8).Select(n =>
            $$"""{"callId":"c-{{n}}","linkedid":"l-{{n}}","ani":"0105555000{{n}}","sessionStatus":"QUEUED","startedAt":"2026-08-20T04:00:00.000Z","primaryAgentId":null}"""))
        + """],"error":null}""";

    private const string WaitingCallsJson = """
    {"success":true,"data":[
      {"callId":"c-9","linkedid":"l-9","ani":"01055556666","sessionStatus":"QUEUED",
       "startedAt":"2026-08-20T04:00:00.000Z","queueName":"대표","primaryAgentId":null},
      {"callId":"c-1","linkedid":"l-1","ani":"01011112222","sessionStatus":"TALKING",
       "startedAt":"2026-08-20T04:00:00.000Z","primaryAgentId":"a-2"}
    ],"error":null}
    """;

    /// <summary>
    /// 옆자리에 울리는 전화를 당겨받으려면 그런 전화가 있다는 것부터 보여야 한다.
    /// 이미 통화 중인 건은 당길 수 없으므로 목록에 넣지 않는다.
    /// </summary>
    [Fact]
    public async Task Only_calls_that_can_still_be_picked_up_are_listed()
    {
        var (vm, _, _, stub) = Build();
        stub.Enqueue(HttpStatusCode.OK, WaitingCallsJson);

        await vm.RefreshWaitingCallsAsync();

        var waiting = Assert.Single(vm.WaitingCalls);
        Assert.Equal("c-9", waiting.CallId);
        Assert.Equal("010-5555-6666", waiting.PhoneNumber);
    }

    [Fact]
    public async Task Picking_one_up_asks_the_server_for_that_call()
    {
        var (vm, _, _, stub) = Build();
        stub.Enqueue(HttpStatusCode.OK, WaitingCallsJson);
        await vm.RefreshWaitingCallsAsync();
        stub.Enqueue(HttpStatusCode.OK, AckJson);

        await vm.PickupAsync(vm.WaitingCalls[0]);

        Assert.Equal("/api/v1/calls/c-9/pickup", stub.Requests[1].RequestUri!.AbsolutePath);
    }

    /// <summary>내 전화가 울리는 중에 남의 전화를 당기면 둘 다 놓친다.</summary>
    [Fact]
    public async Task Nothing_is_listed_while_this_agent_is_on_a_call()
    {
        var (vm, store, _, stub) = Build();
        stub.Enqueue(HttpStatusCode.OK, WaitingCallsJson);
        await vm.RefreshWaitingCallsAsync();
        Assert.NotEmpty(vm.WaitingCalls);

        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, _now)));

        Assert.Empty(vm.WaitingCalls);
    }

    /// <summary>
    /// 대기가 한두 건일 때는 목록이 읽기 좋고, 쌓이면 타일이 한눈에 들어온다.
    /// 자리마다 선호가 달라 고를 수 있어야 한다.
    /// </summary>
    [Fact]
    public void The_waiting_list_starts_as_a_list()
    {
        var (vm, _, _, _) = Build();

        Assert.Equal(WaitingCallLayout.List, vm.WaitingLayout);
        Assert.True(vm.ShowsWaitingAsList);
        Assert.False(vm.ShowsWaitingAsTile);
    }

    [Fact]
    public void The_screen_can_switch_to_tiles()
    {
        var (vm, _, _, _) = Build();

        vm.SetWaitingLayoutCommand.Execute("tile");

        Assert.Equal(WaitingCallLayout.Tile, vm.WaitingLayout);
        Assert.False(vm.ShowsWaitingAsList);
        Assert.True(vm.ShowsWaitingAsTile);
    }

    /// <summary>타일은 한 줄에 둘씩 들어가므로 같은 높이에 더 담긴다.</summary>
    [Fact]
    public async Task Tiles_show_more_calls_than_the_list_does()
    {
        var (vm, _, _, stub) = Build();
        stub.RespondWith(_ => StubHttpHandler.Json(HttpStatusCode.OK, ManyWaitingJson));

        await vm.RefreshWaitingCallsAsync();
        var asList = vm.WaitingCalls.Count;

        vm.WaitingLayout = WaitingCallLayout.Tile;
        await vm.RefreshWaitingCallsAsync();

        Assert.True(vm.WaitingCalls.Count > asList, $"타일 {vm.WaitingCalls.Count} > 목록 {asList} 이어야 한다");
    }

    /// <summary>못 보여 준 건수는 숨기지 않는다. 대기가 더 있는데 없는 줄 알면 안 된다.</summary>
    [Fact]
    public async Task The_calls_that_did_not_fit_are_counted_out_loud()
    {
        var (vm, _, _, stub) = Build();
        stub.RespondWith(_ => StubHttpHandler.Json(HttpStatusCode.OK, ManyWaitingJson));

        await vm.RefreshWaitingCallsAsync();

        Assert.True(vm.WaitingCallsHidden > 0);
        Assert.Contains("외", vm.WaitingCallsHiddenText);
    }

    /// <summary>조회가 실패했다고 화면에 오류를 띄우면 통화 알림이 묻힌다.</summary>
    [Fact]
    public async Task A_failed_lookup_stays_quiet()
    {
        var (vm, _, _, stub) = Build();
        stub.Enqueue(HttpStatusCode.InternalServerError, """{"success":false,"data":null,"error":{"code":"X","message":"서버 오류"}}""");

        await vm.RefreshWaitingCallsAsync();

        Assert.Null(vm.NoticeMessage);
        Assert.Empty(vm.WaitingCalls);
    }
}
