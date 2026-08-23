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
    /// <summary>통화를 제어하는 요청만 센다. 주기 조회는 여기서 볼 것이 아니다.</summary>
    private static int Commands(StubHttpHandler stub) => stub.Requests
        .Count(r => r.RequestUri!.AbsolutePath.Contains("call-commands", StringComparison.Ordinal));

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

        // 대기 목록 조회는 통화 중에도 돈다. 그건 자동 동작이 아니므로 세지 않는다.
        var before = Commands(stub);
        _now = _now.AddMinutes(5);
        stub.Enqueue(HttpStatusCode.OK, """{"success":true,"data":[],"error":null}""");
        vm.Tick();

        Assert.Equal(before, Commands(stub));
    }
}
