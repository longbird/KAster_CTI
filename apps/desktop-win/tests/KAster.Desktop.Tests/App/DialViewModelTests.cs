using System.Net;
using KAster.Desktop.Core.Contracts;
using KAster.Desktop.Softphone;
using KAster.Desktop.Tests.Server;
using Xunit;

namespace KAster.Desktop.Tests.App;

public class DialViewModelTests : SoftphoneViewModelTestBase
{
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
        vm.Dial.DialNumber = "1002";
        await vm.Dial.DialAsync();

        vm.Dial.OnSoftphoneCallStatusChanged(new SoftphoneCallStatus(SoftphoneCallState.Ringing));

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
            vm.Dial.OnSoftphoneCallStatusChanged(new SoftphoneCallStatus(SoftphoneCallState.Ringing));
            return StubHttpHandler.Json(HttpStatusCode.OK, AckJson);
        });
        vm.Dial.DialNumber = "01011112222";

        await vm.Dial.DialAsync();

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
        vm.Dial.DialNumber = "060123456";

        await vm.Dial.DialAsync();
        vm.Dial.OnSoftphoneCallStatusChanged(new SoftphoneCallStatus(SoftphoneCallState.Ringing));

        Assert.Equal(0, phone.AnswerCalls);
    }

    /// <summary>걸기를 눌렀는데 화면이 그대로면 눌린 건지 알 수 없다. 바로 발신 중으로 바뀌어야 한다.</summary>
    [Fact]
    public async Task Pressing_dial_shows_that_a_call_is_going_out()
    {
        var (vm, _, _, stub) = Build();
        await Ready(vm, stub);
        stub.Enqueue(HttpStatusCode.OK, AckJson);
        vm.Dial.DialNumber = "1002";

        await vm.Dial.DialAsync();

        Assert.True(vm.Dial.IsDialing);
        Assert.Equal("1002", vm.Dial.DialingNumber);   // 내선은 나누지 않는다
    }

    [Fact]
    public async Task A_refused_call_never_shows_as_going_out()
    {
        var (vm, _, _, stub) = Build();
        await Ready(vm, stub);
        stub.Enqueue(
            HttpStatusCode.BadRequest,
            """{"success":false,"data":null,"error":{"code":"BLOCKED","message":"발신이 차단된 번호"}}""");
        vm.Dial.DialNumber = "060123456";

        await vm.Dial.DialAsync();

        Assert.False(vm.Dial.IsDialing);
    }

    [Fact]
    public async Task The_call_arriving_ends_the_going_out_state()
    {
        var (vm, _, _, stub) = Build();
        await Ready(vm, stub);
        stub.Enqueue(HttpStatusCode.OK, AckJson);
        vm.Dial.DialNumber = "1002";
        await vm.Dial.DialAsync();

        vm.Dial.OnSoftphoneCallStatusChanged(new SoftphoneCallStatus(SoftphoneCallState.Ringing));

        Assert.False(vm.Dial.IsDialing);
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
        vm.Dial.DialNumber = "1002";
        await vm.Dial.DialAsync();

        _now = _now.AddSeconds(46);
        vm.Tick();

        Assert.False(vm.Dial.IsDialing);
        Assert.Contains("전화가 오지 않았다", vm.NoticeMessage);
    }

    [Fact]
    public void A_call_we_did_not_place_still_waits_for_the_agent()
    {
        var (vm, _, phone, _) = Build();

        vm.Dial.OnSoftphoneCallStatusChanged(new SoftphoneCallStatus(SoftphoneCallState.Ringing));

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
        vm.Dial.DialNumber = "1002";
        await vm.Dial.DialAsync();

        _now = _now.AddMinutes(5);
        vm.Dial.OnSoftphoneCallStatusChanged(new SoftphoneCallStatus(SoftphoneCallState.Ringing));

        Assert.Equal(0, phone.AnswerCalls);
    }

    [Fact]
    public async Task Dialing_an_external_number_goes_through_the_client_command_path()
    {
        var (vm, _, _, stub) = Build();
        await Ready(vm, stub);
        stub.Enqueue(HttpStatusCode.OK, AckJson);
        vm.Dial.DialNumber = "01011112222";

        await vm.Dial.DialAsync();

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
        vm.Dial.DialNumber = "1002";

        await vm.Dial.DialAsync();

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
        vm.Dial.DialNumber = number;

        await vm.Dial.DialAsync();

        Assert.Equal("/api/v1/client/call-commands/originate", stub.Requests[2].RequestUri!.AbsolutePath);
    }

    [Fact]
    public async Task The_allowed_caller_ids_arrive_with_the_default_already_chosen()
    {
        var (vm, _, _, stub) = Build();
        await Ready(vm, stub);

        Assert.Equal(new[] { "0215881588", "07052346380" }, vm.Dial.CallerIds);
        Assert.Equal("07052346380", vm.Dial.SelectedCallerId);
    }

    [Fact]
    public async Task An_external_call_carries_the_chosen_caller_id()
    {
        var (vm, _, _, stub) = Build();
        await Ready(vm, stub);
        stub.Enqueue(HttpStatusCode.OK, AckJson);
        vm.Dial.SelectedCallerId = "0215881588";
        vm.Dial.DialNumber = "01011112222";

        await vm.Dial.DialAsync();

        Assert.Contains("\"callerId\":\"0215881588\"", stub.Bodies[2]);
    }

    /// <summary>발신번호는 외부 발신에만 쓴다. 내선 통화에 실어 보내면 서버가 모르는 필드가 된다.</summary>
    [Fact]
    public async Task An_internal_call_carries_no_caller_id()
    {
        var (vm, _, _, stub) = Build();
        await Ready(vm, stub);
        stub.Enqueue(HttpStatusCode.OK, AckJson);
        vm.Dial.DialNumber = "1002";

        await vm.Dial.DialAsync();

        Assert.DoesNotContain("callerId", stub.Bodies[2]);
    }

    /// <summary>내선을 누르는 동안 발신번호 칸이 떠 있으면 헷갈린다. 외부 번호일 때만 보인다.</summary>
    [Fact]
    public async Task The_caller_id_picker_only_shows_for_an_outside_number()
    {
        var (vm, _, _, stub) = Build();
        await Ready(vm, stub);

        vm.Dial.DialNumber = "1002";
        Assert.False(vm.Dial.ShowsCallerIdPicker);

        vm.Dial.DialNumber = "01011112222";
        Assert.True(vm.Dial.ShowsCallerIdPicker);
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

        vm.Dial.DialNumber = "01011112222";

        Assert.Empty(vm.Dial.CallerIds);
        Assert.False(vm.Dial.ShowsCallerIdPicker);
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

        Assert.Empty(vm.Dial.CallerIds);
        Assert.Contains("서버 오류", vm.NoticeMessage);
    }

    [Fact]
    public async Task Dialing_clears_the_number_so_the_next_call_starts_empty()
    {
        var (vm, _, _, stub) = Build();
        await Ready(vm, stub);
        stub.Enqueue(HttpStatusCode.OK, AckJson);
        vm.Dial.DialNumber = "1002";

        await vm.Dial.DialAsync();

        Assert.Equal(string.Empty, vm.Dial.DialNumber);
    }

    /// <summary>전화번호에는 숫자와 몇 개의 기호만 온다. 실수로 붙은 공백·하이픈은 서버가 거부한다.</summary>
    [Fact]
    public async Task Dialing_strips_the_separators_people_type()
    {
        var (vm, _, _, stub) = Build();
        await Ready(vm, stub);
        stub.Enqueue(HttpStatusCode.OK, AckJson);
        vm.Dial.DialNumber = " 010-1234-5678 ";

        await vm.Dial.DialAsync();

        Assert.Contains("\"phoneNumber\":\"01012345678\"", stub.Bodies[2]);
    }

    [Fact]
    public async Task Dialing_nothing_sends_nothing()
    {
        var (vm, _, _, stub) = Build();
        vm.Dial.DialNumber = "   ";

        await vm.Dial.DialAsync();

        Assert.Empty(stub.Requests);
    }

    [Fact]
    public void Dialing_is_only_offered_while_no_call_is_in_progress()
    {
        var (vm, store, _, _) = Build();
        vm.Dial.DialNumber = "1002";
        Assert.True(vm.Dial.DialCommand.CanExecute(null));

        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, _now)));
        Assert.False(vm.Dial.DialCommand.CanExecute(null));
    }

    [Fact]
    public void An_empty_number_leaves_the_dial_button_off()
    {
        var (vm, _, _, _) = Build();

        Assert.False(vm.Dial.DialCommand.CanExecute(null));

        vm.Dial.DialNumber = "1002";
        Assert.True(vm.Dial.DialCommand.CanExecute(null));
    }

    [Fact]
    public async Task A_refused_call_says_why_instead_of_throwing()
    {
        var (vm, _, _, stub) = Build();
        await Ready(vm, stub);
        stub.Enqueue(
            HttpStatusCode.BadRequest,
            """{"success":false,"data":null,"error":{"code":"BLOCKED","message":"발신이 차단된 번호"}}""");
        vm.Dial.DialNumber = "060123456";

        await vm.Dial.DialAsync();

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
        vm.Dial.DialNumber = "060123456";

        await vm.Dial.DialAsync();

        Assert.Equal("060123456", vm.Dial.DialNumber);
    }
}
