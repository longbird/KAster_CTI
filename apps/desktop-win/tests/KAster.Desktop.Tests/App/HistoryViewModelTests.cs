using System.Net;
using KAster.Desktop.App.Services;
using Xunit;

namespace KAster.Desktop.Tests.App;

public class HistoryViewModelTests : SoftphoneViewModelTestBase
{
    private const string HistoryJson = """
    {"success":true,"data":[
      {"callId":"c-9","startedAt":"2026-08-22T01:00:00Z","direction":"inbound",
       "ani":"01034623453","dnis":"07052346380","talkSeconds":42,"missedReason":null},
      {"callId":"c-8","startedAt":"2026-08-22T00:50:00Z","direction":"inbound",
       "ani":"01055556666","dnis":"07052346380","talkSeconds":0,"missedReason":"ABANDONED"}
    ],"error":null}
    """;

    [Fact]
    public async Task History_opens_with_the_newest_calls()
    {
        var (vm, _, _, stub) = Build();
        await Ready(vm, stub);
        stub.Enqueue(HttpStatusCode.OK, HistoryJson);

        await vm.History.OpenHistoryAsync();

        Assert.True(vm.History.IsViewingHistory);
        Assert.Equal(2, vm.History.Rows.Count);
        Assert.Equal("010-3462-3453", vm.History.Rows[0].PhoneNumber);
    }

    /// <summary>못 받은 통화는 한눈에 구분돼야 한다. 다시 걸어야 하는 것들이다.</summary>
    [Fact]
    public async Task A_missed_call_is_marked_as_missed()
    {
        var (vm, _, _, stub) = Build();
        await Ready(vm, stub);
        stub.Enqueue(HttpStatusCode.OK, HistoryJson);

        await vm.History.OpenHistoryAsync();

        Assert.False(vm.History.Rows[0].WasMissed);
        Assert.True(vm.History.Rows[1].WasMissed);
    }

    [Fact]
    public async Task Closing_history_goes_back_to_waiting()
    {
        var (vm, _, _, stub) = Build();
        await Ready(vm, stub);
        stub.Enqueue(HttpStatusCode.OK, HistoryJson);
        await vm.History.OpenHistoryAsync();

        vm.History.CloseHistoryCommand.Execute(null);

        Assert.False(vm.History.IsViewingHistory);
        Assert.Equal(WindowMode.Idle, vm.WindowMode);
    }

    /// <summary>이력에서 바로 다시 걸 수 있어야 한다. 번호를 옮겨 적게 하면 안 된다.</summary>
    [Fact]
    public async Task Calling_back_from_history_fills_the_dial_box()
    {
        var (vm, _, _, stub) = Build();
        await Ready(vm, stub);
        stub.Enqueue(HttpStatusCode.OK, HistoryJson);
        await vm.History.OpenHistoryAsync();

        vm.History.CallBackCommand.Execute(vm.History.Rows[1]);

        Assert.Equal("01055556666", vm.Dial.DialNumber);
        Assert.False(vm.History.IsViewingHistory);
    }
}
