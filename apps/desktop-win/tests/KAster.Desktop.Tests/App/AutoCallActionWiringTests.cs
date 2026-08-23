using System.Net;
using KAster.Desktop.App.Services;
using KAster.Desktop.Core.Contracts;
using KAster.Desktop.Tests.Server;
using Xunit;

namespace KAster.Desktop.Tests.App;

/// <summary>
/// 판정이 맞아도 <b>한 번만</b> 걸려야 한다. 매초 다시 걸면 같은 명령이 쏟아지고,
/// 서버는 그것을 사람이 연타한 것과 구분하지 못한다.
/// </summary>
public class AutoCallActionWiringTests : SoftphoneViewModelTestBase
{
    [Fact]
    public async Task An_auto_hangup_is_sent_once()
    {
        var (vm, store, _, stub) = Build(
            callPreferences: new CallPreferences { AutoRejectSeconds = 3 });
        await Ready(vm, stub);

        store.Apply(new CallCreatedEvent(Call(SessionStatus.RingingAgent)));
        Assert.Equal(WindowMode.Ringing, vm.WindowMode);

        var before = stub.Requests.Count;
        _now = _now.AddSeconds(5);

        for (var i = 0; i < 5; i++)
        {
            stub.Enqueue(HttpStatusCode.OK, AckJson);
            vm.Tick();
        }

        var hangups = stub.Requests
            .Skip(before)
            .Count(r => r.RequestUri!.AbsolutePath.Contains("hangup", StringComparison.Ordinal));

        Assert.Equal(1, hangups);
    }

    /// <summary>안 켜 두면 아무 일도 없어야 한다. 기본값이 오늘 동작과 같아야 한다.</summary>
    [Fact]
    public async Task Nothing_happens_when_it_is_off()
    {
        var (vm, store, _, stub) = Build();
        await Ready(vm, stub);

        store.Apply(new CallCreatedEvent(Call(SessionStatus.RingingAgent)));

        var before = stub.Requests.Count;
        _now = _now.AddMinutes(5);
        vm.Tick();

        Assert.Equal(before, stub.Requests.Count);
    }
}
