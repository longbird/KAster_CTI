using System.Net;
using KAster.Desktop.App.Services;
using KAster.Desktop.App.ViewModels;
using KAster.Desktop.Core.Contracts;
using KAster.Desktop.Tests.Server;
using Xunit;

namespace KAster.Desktop.Tests.App;

/// <summary>
/// 협의 전환. 상대에게 먼저 사정을 말하고 나서 넘긴다.
///
/// 서버는 순서를 강제한다 — <c>/consultation</c> 으로 협의를 열지 않으면 완료도 취소도 400 이다.
/// 그리고 완료는 feature code 를 DTMF 로 넣는 것이라 <b>서버도 성공 여부를 모른다</b>.
/// 그래서 여기서 지켜야 하는 것은 셋이다 — 순서를 화면이 막는 것, "요청을 보냈다" 를
/// "넘어갔다" 로 바꿔 말하지 않는 것, 그리고 답이 안 오면 스스로 풀어 주는 것.
/// </summary>
public class AttendedTransferViewModelTests : SoftphoneViewModelTestBase
{
    /// <summary>대상 목록을 열고 최신 상태까지 받아 둔다. 여기서부터가 모든 시나리오의 출발점이다.</summary>
    private async Task<(SoftphoneViewModel Vm, KAster.Desktop.Core.State.CallStateStore Store, StubHttpHandler Stub)>
        AtTargetList()
    {
        var (vm, store, _, stub) = Build();
        await Ready(vm, stub);
        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, _now)));

        stub.Enqueue(HttpStatusCode.OK, DirectoryJson);
        vm.Transfer.StartTransferCommand.Execute(null);
        await vm.PendingWork;

        return (vm, store, stub);
    }

    /// <summary>협의가 열린 상태. 서버에 candidate 가 생겼고 완료/취소를 받아 준다.</summary>
    private async Task<(SoftphoneViewModel Vm, KAster.Desktop.Core.State.CallStateStore Store, StubHttpHandler Stub)>
        InConsultation()
    {
        var (vm, store, stub) = await AtTargetList();
        stub.Enqueue(HttpStatusCode.OK, AckJson);
        await vm.Transfer.ConsultAsync("1002");
        return (vm, store, stub);
    }

    /// <summary>
    /// 협의를 열지 않고 완료를 누르면 서버가 무조건 400 을 던진다. 눌러 놓고 오류를 보여 주는
    /// 대신 그 순서를 화면이 막는다.
    /// </summary>
    [Fact]
    public async Task Completing_and_cancelling_are_locked_before_a_consultation_starts()
    {
        var (vm, _, _) = await AtTargetList();

        Assert.Equal(TransferStage.ChoosingTarget, vm.Transfer.Stage);
        Assert.False(vm.Transfer.CompleteTransferCommand.CanExecute(null));
        Assert.False(vm.Transfer.CancelConsultationCommand.CanExecute(null));
    }

    /// <summary>화면이 닫혀 있을 때도 마찬가지다. 통화조차 없으면 넘길 것도 없다.</summary>
    [Fact]
    public void Completing_and_cancelling_are_locked_while_the_transfer_screen_is_closed()
    {
        var (vm, _, _, _) = Build();

        Assert.Equal(TransferStage.Closed, vm.Transfer.Stage);
        Assert.False(vm.Transfer.CompleteTransferCommand.CanExecute(null));
        Assert.False(vm.Transfer.CancelConsultationCommand.CanExecute(null));
    }

    /// <summary>순서를 막는 것은 버튼만이 아니다. 직접 불러도 아무것도 나가지 않아야 한다.</summary>
    [Fact]
    public async Task Completing_before_a_consultation_sends_nothing()
    {
        var (vm, _, stub) = await AtTargetList();
        var before = stub.Requests.Count;

        await vm.Transfer.CompleteTransferAsync();
        await vm.Transfer.CancelConsultationAsync();

        Assert.Equal(before, stub.Requests.Count);
    }

    /// <summary>
    /// 못 받는 상대에게는 협의도 걸 수 없다. 아무도 없는 자리로 협의를 걸면 상담원은
    /// 응답을 기다리며 고객을 세워 둔다. blind 와 같은 가드가 여기에도 걸려야 한다.
    /// </summary>
    [Fact]
    public async Task Consulting_someone_who_cannot_answer_is_refused()
    {
        var (vm, _, stub) = await AtTargetList();
        var before = stub.Requests.Count;

        await vm.Transfer.ConsultAsync("1003");

        Assert.Equal(before, stub.Requests.Count);
        Assert.Contains("1003", vm.NoticeMessage);
        Assert.Equal(TransferStage.ChoosingTarget, vm.Transfer.Stage);
    }

    [Fact]
    public async Task Consulting_an_unknown_extension_is_refused()
    {
        var (vm, _, stub) = await AtTargetList();
        var before = stub.Requests.Count;

        await vm.Transfer.ConsultAsync("9999");

        Assert.Equal(before, stub.Requests.Count);
        Assert.Equal(TransferStage.ChoosingTarget, vm.Transfer.Stage);
    }

    [Fact]
    public async Task Starting_a_consultation_asks_the_server_to_call_the_target()
    {
        var (vm, _, stub) = await AtTargetList();
        stub.Enqueue(HttpStatusCode.OK, AckJson);

        await vm.Transfer.ConsultAsync("1002");

        Assert.Equal("/api/v1/calls/c-1/consultation", stub.Requests[^1].RequestUri!.AbsolutePath);
        Assert.Contains("\"target\":\"1002\"", stub.Bodies[^1]);
    }

    /// <summary>협의가 열려야 완료와 취소가 뜻을 가진다. 그 전에는 서버가 받아 주지 않는다.</summary>
    [Fact]
    public async Task A_started_consultation_opens_complete_and_cancel()
    {
        var (vm, _, _) = await InConsultation();

        Assert.Equal(TransferStage.Consulting, vm.Transfer.Stage);
        Assert.True(vm.Transfer.CompleteTransferCommand.CanExecute(null));
        Assert.True(vm.Transfer.CancelConsultationCommand.CanExecute(null));

        // 대상은 이미 골랐다. 목록이 남아 있으면 다른 사람에게 또 협의를 건다.
        Assert.False(vm.Transfer.IsChoosingTransferTarget);
        Assert.True(vm.Transfer.IsTransferScreenOpen);
    }

    /// <summary>
    /// 상대가 받았는지는 <b>알 방법이 없다</b>. 서버는 협의 단계를 DB 에만 적고
    /// 클라이언트에게 보내지 않는다. 모르는 것을 아는 척 적으면 상담원이 빈 자리에 대고 말한다.
    /// </summary>
    [Fact]
    public async Task The_screen_does_not_claim_the_other_side_picked_up()
    {
        var (vm, _, _) = await InConsultation();

        Assert.Contains("알 수 없", vm.Transfer.ConsultStatusText);
    }

    /// <summary>협의를 연 뒤에는 다른 사람에게 바로 넘길 수 없다. 열린 협의가 남는다.</summary>
    [Fact]
    public async Task A_blind_transfer_is_blocked_while_a_consultation_is_open()
    {
        var (vm, _, stub) = await InConsultation();
        var before = stub.Requests.Count;

        await vm.Transfer.TransferToAsync("1002");

        Assert.Equal(before, stub.Requests.Count);
        Assert.Equal(TransferStage.Consulting, vm.Transfer.Stage);
    }

    /// <summary>
    /// 협의를 열어 둔 채 화면을 닫으면 완료도 취소도 누를 자리가 없어진다.
    /// 고객은 보류된 채, 상대는 기다리는 채 남는다.
    /// </summary>
    [Fact]
    public async Task Closing_the_transfer_screen_is_blocked_while_a_consultation_is_open()
    {
        var (vm, _, _) = await InConsultation();

        Assert.False(vm.Transfer.CancelTransferCommand.CanExecute(null));

        vm.Transfer.CancelTransferCommand.Execute(null);

        Assert.Equal(TransferStage.Consulting, vm.Transfer.Stage);
        Assert.True(vm.Transfer.IsTransferScreenOpen);
    }

    /// <summary>서버가 협의를 거부하면 대상 목록으로 돌아간다. 완료 버튼이 열려 있으면 400 을 부른다.</summary>
    [Fact]
    public async Task A_refused_consultation_goes_back_to_choosing()
    {
        var (vm, _, stub) = await AtTargetList();
        stub.Enqueue(
            HttpStatusCode.BadRequest,
            """{"success":false,"data":null,"error":{"code":"X","message":"상담원 제어 채널을 찾을 수 없습니다."}}""");

        await vm.Transfer.ConsultAsync("1002");

        Assert.Equal(TransferStage.ChoosingTarget, vm.Transfer.Stage);
        Assert.False(vm.Transfer.CompleteTransferCommand.CanExecute(null));
        Assert.Contains("상담원 제어 채널", vm.NoticeMessage);
    }

    /// <summary>
    /// 완료는 feature code 를 DTMF 로 넣는 것이라 서버도 먹었는지 모른다. 화면이 먼저
    /// "넘어갔다" 로 바뀌면 상담원은 아직 자기 귀에 붙어 있는 고객을 두고 다음 전화를 받는다.
    /// </summary>
    [Fact]
    public async Task Completing_sends_the_command_but_does_not_claim_the_transfer_happened()
    {
        var (vm, _, stub) = await InConsultation();
        stub.Enqueue(HttpStatusCode.OK, AckJson);

        await vm.Transfer.CompleteTransferAsync();

        Assert.Equal(
            "/api/v1/calls/c-1/transfer/attended/complete",
            stub.Requests[^1].RequestUri!.AbsolutePath);
        Assert.Equal(TransferStage.CompleteRequested, vm.Transfer.Stage);
        Assert.True(vm.Transfer.IsTransferScreenOpen);

        // 답을 기다리는 동안에는 다시 눌리지 않는다. 완료와 취소가 엇갈려 나가면 안 된다.
        Assert.False(vm.Transfer.CompleteTransferCommand.CanExecute(null));
        Assert.False(vm.Transfer.CancelConsultationCommand.CanExecute(null));

        // 요청 중이라는 것과 넘어갔다는 것을 다른 말로 적는다.
        Assert.Contains("요청", vm.Transfer.CompleteButtonText);
    }

    /// <summary>
    /// PBX 가 코드를 안 먹으면 아무 이벤트도 안 온다. 서버는 그것을 모른다.
    /// 화면이 영원히 "연결 요청 중" 으로 남으면 상담원은 무엇을 눌러야 할지 모른다.
    /// </summary>
    [Fact]
    public async Task A_complete_the_pbx_never_confirms_stops_waiting()
    {
        var (vm, _, stub) = await InConsultation();
        stub.Enqueue(HttpStatusCode.OK, AckJson);
        await vm.Transfer.CompleteTransferAsync();

        _now = _now.AddSeconds(6);
        vm.Tick();

        Assert.Equal(TransferStage.Consulting, vm.Transfer.Stage);
        Assert.True(vm.Transfer.CompleteTransferCommand.CanExecute(null));
        Assert.Contains("연결", vm.NoticeMessage);
    }

    /// <summary>접수 자체가 거부되면 기다릴 이유가 없다. 바로 협의 상태로 돌린다.</summary>
    [Fact]
    public async Task A_rejected_complete_stops_waiting_at_once()
    {
        var (vm, _, stub) = await InConsultation();
        stub.Enqueue(
            HttpStatusCode.BadRequest,
            """{"success":false,"data":null,"error":{"code":"X","message":"완료 가능한 상담 전환이 없습니다."}}""");

        await vm.Transfer.CompleteTransferAsync();

        Assert.Equal(TransferStage.Consulting, vm.Transfer.Stage);
        Assert.True(vm.Transfer.CompleteTransferCommand.CanExecute(null));
        Assert.Contains("완료 가능한", vm.NoticeMessage);
    }

    [Fact]
    public async Task Cancelling_a_consultation_asks_the_server_to_put_the_call_back()
    {
        var (vm, _, stub) = await InConsultation();
        stub.Enqueue(HttpStatusCode.OK, AckJson);

        await vm.Transfer.CancelConsultationAsync();

        Assert.Equal(
            "/api/v1/calls/c-1/transfer/attended/cancel",
            stub.Requests[^1].RequestUri!.AbsolutePath);
        Assert.Equal(TransferStage.CancelRequested, vm.Transfer.Stage);
        Assert.False(vm.Transfer.CompleteTransferCommand.CanExecute(null));
    }

    /// <summary>취소도 실제로 됐는지는 PBX 의 atxferabort 설정에 달렸다. 답이 없으면 풀어 준다.</summary>
    [Fact]
    public async Task A_cancel_the_pbx_never_confirms_stops_waiting()
    {
        var (vm, _, stub) = await InConsultation();
        stub.Enqueue(HttpStatusCode.OK, AckJson);
        await vm.Transfer.CancelConsultationAsync();

        _now = _now.AddSeconds(6);
        vm.Tick();

        Assert.Equal(TransferStage.Consulting, vm.Transfer.Stage);
        Assert.True(vm.Transfer.CancelConsultationCommand.CanExecute(null));
        Assert.Contains("취소", vm.NoticeMessage);
    }

    /// <summary>
    /// 협의가 끝났다는 근거는 서버가 보내 준 세션 상태뿐이다. 취소가 실제로 먹으면
    /// 세션이 전환 중에서 통화로 돌아오고, 그때 화면도 원 통화로 돌아간다.
    /// </summary>
    [Fact]
    public async Task The_screen_goes_back_to_the_call_only_when_the_server_leaves_the_transfer()
    {
        var (vm, store, stub) = await InConsultation();
        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Transferring, _now)));
        stub.Enqueue(HttpStatusCode.OK, AckJson);
        await vm.Transfer.CancelConsultationAsync();

        // 아직 전환 중이다. 여기서 화면을 닫으면 취소가 안 먹었을 때 되돌릴 자리가 없다.
        Assert.True(vm.Transfer.IsTransferScreenOpen);

        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, _now)));

        Assert.Equal(TransferStage.Closed, vm.Transfer.Stage);
        Assert.False(vm.Transfer.IsTransferScreenOpen);
        Assert.Equal(WindowMode.Talking, vm.WindowMode);
    }

    /// <summary>넘어갔으면 이 통화는 우리 손을 떠난다. 화면도 같이 비운다.</summary>
    [Fact]
    public async Task A_completed_transfer_closes_the_screen_when_the_call_leaves()
    {
        var (vm, store, stub) = await InConsultation();
        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Transferring, _now)));
        stub.Enqueue(HttpStatusCode.OK, AckJson);
        await vm.Transfer.CompleteTransferAsync();

        store.Apply(new CallEndedEvent(Call(SessionStatus.Ended, _now)));

        Assert.Equal(TransferStage.Closed, vm.Transfer.Stage);
        Assert.False(vm.Transfer.IsTransferScreenOpen);
        Assert.Equal(WindowMode.Idle, vm.WindowMode);
    }

    /// <summary>
    /// 협의를 열기 전에 온 늦은 통화 상태로 화면을 닫으면 안 된다. 서버가 전환 중이라고
    /// 말한 적이 없는데 "전환이 끝났다" 로 읽는 것이기 때문이다.
    ///
    /// 응답 시각을 밀어 두는 이유는 <see cref="KAster.Desktop.Core.State.CallStateStore"/> 가
    /// 값이 같은 갱신을 삼키기 때문이다. 그대로 두면 이벤트 자체가 오지 않아 아무것도 검증하지 못한다.
    /// </summary>
    [Fact]
    public async Task A_stale_talking_update_does_not_close_a_fresh_consultation()
    {
        var (vm, store, _) = await InConsultation();

        store.Apply(new CallUpdatedEvent(Call(SessionStatus.Talking, _now.AddSeconds(1))));

        Assert.Equal(TransferStage.Consulting, vm.Transfer.Stage);
        Assert.True(vm.Transfer.IsTransferScreenOpen);
    }

    /// <summary>통화가 통째로 사라지면 협의도 없다 — 고객이 먼저 끊는 경우다.</summary>
    [Fact]
    public async Task Losing_the_call_closes_the_consultation()
    {
        var (vm, store, _) = await InConsultation();

        store.Apply(new CallEndedEvent(Call(SessionStatus.Ended, _now)));

        Assert.Equal(TransferStage.Closed, vm.Transfer.Stage);
        Assert.False(vm.Transfer.IsTransferScreenOpen);
    }

    /// <summary>누구와 협의 중인지 화면에 남아야 한다. 목록이 사라지면 상대를 잊는다.</summary>
    [Fact]
    public async Task The_screen_keeps_showing_who_the_consultation_is_with()
    {
        var (vm, _, _) = await InConsultation();

        Assert.Contains("1002", vm.Transfer.ConsultTargetLabel);
        Assert.Contains("이상담", vm.Transfer.ConsultTargetLabel);
    }
}
