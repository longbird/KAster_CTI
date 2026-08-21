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
    public bool IsMuted { get; set; }
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

    private (SoftphoneViewModel Vm, CallStateStore Store, FakeSoftphone Phone, StubHttpHandler Stub) Build()
    {
        var stub = new StubHttpHandler();
        var store = new CallStateStore(Agent.AgentId, () => _now);
        var phone = new FakeSoftphone();
        var server = new CtiServerClient(new HttpClient(stub) { BaseAddress = new Uri("http://server/api/v1/") });
        return (new SoftphoneViewModel(store, server, phone, Agent, () => _now), store, phone, stub);
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

    [Fact]
    public void A_queued_call_is_shown_as_ringing()
    {
        var (vm, store, _, _) = Build();

        store.Apply(new CallCreatedEvent(Call(SessionStatus.Queued)));

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

    [Fact]
    public void Falls_back_to_the_number_when_the_customer_is_unknown()
    {
        var (vm, store, _, _) = Build();
        var unknown = Call(SessionStatus.RingingAgent) with { Customer = null };

        store.Apply(new CallCreatedEvent(unknown));

        Assert.Equal("알 수 없음", vm.CustomerName);
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

    [Fact]
    public void The_realtime_connection_state_is_shown()
    {
        var (vm, _, _, _) = Build();

        vm.OnConnectionStateChanged(CtiConnectionState.Connected);
        Assert.True(vm.IsConnected);

        vm.OnConnectionStateChanged(CtiConnectionState.Disconnected);
        Assert.False(vm.IsConnected);
    }
}
