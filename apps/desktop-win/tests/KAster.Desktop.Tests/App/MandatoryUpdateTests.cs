using System.Net;
using KAster.Desktop.App.ViewModels;
using KAster.Desktop.Core.Contracts;
using KAster.Desktop.Core.Updates;
using KAster.Desktop.Tests.Server;

namespace KAster.Desktop.Tests.App;

public class MandatoryUpdateTests : SoftphoneViewModelTestBase
{
    private StubHttpHandler PrepareUpdate(bool mandatory)
    {
        var stub = new StubHttpHandler();
        stub.Enqueue(HttpStatusCode.OK, """{"success":true,"data":{"updateSessionToken":"session","expiresIn":600}}""")
            .Enqueue(HttpStatusCode.OK, $$$"""
                {"success":true,"data":{"latestVersion":"1.0.2","mandatory":{{{mandatory.ToString().ToLowerInvariant()}}},
                "artifacts":[{"artifactId":"test","version":"1.0.2","fileName":"setup.exe","sha256":"abc","size":1}]}}
                """)
            .Enqueue(HttpStatusCode.OK, """{"success":true,"data":{"recorded":true}}""");
        TestUpdate = new UpdateViewModel(
            new UpdateClient(new HttpClient(stub) { BaseAddress = new Uri("http://server/api/v1/") }, () => "access", "test"),
            "1.0.1", "stable", Path.GetTempPath(), () => _now, () => true, _ => { }, _ => { });
        return stub;
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task Only_mandatory_updates_block_new_calls_and_available_status(bool mandatory)
    {
        PrepareUpdate(mandatory);
        var (vm, _, _, stub) = Build();
        await TestUpdate!.CheckAsync();
        vm.Dial.DialNumber = "1002";
        Assert.Equal(!mandatory, vm.Dial.DialCommand.CanExecute(null));
        Assert.True(vm.OpenSettingsCommand.CanExecute(null));
        Assert.True(vm.SignOutCommand.CanExecute(null));
        if (!mandatory) return;
        await vm.Dial.DialAsync();
        await vm.ChangeStatusAsync(AgentStatusCode.Available);
        Assert.Empty(stub.Requests);
    }

    [Fact]
    public async Task Current_ringing_call_can_finish_but_a_subsequent_call_cannot_be_answered()
    {
        PrepareUpdate(true);
        var (vm, store, phone, stub) = Build();
        stub.Enqueue(HttpStatusCode.OK, """{"success":true,"data":{"statusCode":"BREAK"}}""");
        store.Apply(new CallCreatedEvent(Call(SessionStatus.RingingAgent)));
        Assert.True(TestUpdate!.IsRequired); // Call event ticks the automatic check.
        await vm.AnswerAsync();
        Assert.Equal(1, phone.AnswerCalls);
        Assert.True(vm.HangupCommand.CanExecute(null));
        store.Apply(new CallEndedEvent(Call(SessionStatus.Ended)));
        store.Apply(new CallCreatedEvent(Call(SessionStatus.RingingAgent) with { CallId = "c-2", Linkedid = "l-2" }));
        await vm.AnswerAsync();
        Assert.Equal(1, phone.AnswerCalls);
        Assert.False(vm.AnswerCommand.CanExecute(null));
    }

    [Fact]
    public async Task Failed_refresh_does_not_remove_a_known_mandatory_update()
    {
        var stub = PrepareUpdate(true);
        var (vm, _, _, _) = Build();
        await TestUpdate!.CheckAsync();
        stub.Enqueue(HttpStatusCode.ServiceUnavailable, "{}");
        await TestUpdate.CheckAsync();
        vm.Dial.DialNumber = "1002";
        Assert.False(vm.Dial.DialCommand.CanExecute(null));
    }

    [Theory]
    [InlineData("1.0.1", true)]
    [InlineData("1.0.2", false)]
    public void Saved_requirement_survives_restart_until_the_new_version_is_installed(string version, bool required)
    {
        var cache = new KAster.Desktop.Core.Storage.JsonSettingsStore<UpdateAvailability>(
            Path.Combine(Path.GetTempPath(), Guid.NewGuid() + ".json"),
            new UpdateAvailability { HasUpdate = true, IsRequired = true, LatestVersion = "1.0.2" });
        var vm = new UpdateViewModel(
            new UpdateClient(new HttpClient { BaseAddress = new Uri("http://server/api/v1/") }, () => "access", "test"),
            version, "stable", Path.GetTempPath(), () => _now, () => true, _ => { }, _ => { }, cache);
        Assert.Equal(required, vm.IsRequired);
    }

    [Fact]
    public async Task Required_update_blocks_offer_acceptance_but_allows_rejection()
    {
        PrepareUpdate(true);
        var (vm, store, _, stub) = Build();
        await TestUpdate!.CheckAsync();
        store.Apply(new CallOfferedEvent(new CallOffer
        {
            OfferId = "lk:1001", Linkedid = "lk", Extension = "1001", TimeoutSeconds = 10,
        }));
        Assert.False(vm.Offer.AcceptOfferCommand.CanExecute(null));
        Assert.True(vm.Offer.RejectOfferCommand.CanExecute(null));
        await vm.Offer.RespondToOfferAsync(true);
        Assert.Empty(stub.Requests);
        stub.Enqueue(HttpStatusCode.OK, AckJson);
        await vm.Offer.RespondToOfferAsync(false);
        Assert.Single(stub.Requests);
    }

    [Fact]
    public async Task Pause_waits_for_call_end_and_does_not_lock_update_access_in_after_call_work()
    {
        PrepareUpdate(true);
        var (vm, store, phone, stub) = Build();
        store.Apply(new CallCreatedEvent(Call(SessionStatus.Talking, _now)));
        Assert.True(TestUpdate!.IsRequired);
        vm.Tick();
        Assert.Empty(stub.Requests);
        Assert.False(vm.CanManageUpdate);
        stub.Enqueue(HttpStatusCode.OK, """{"success":true,"data":{"statusCode":"BREAK"}}""");
        store.Apply(new CallUpdatedEvent(Call(SessionStatus.AfterCallWork, _now)));
        await vm.PendingWork;
        Assert.Equal(AgentStatusCode.Break, vm.AgentStatus);
        Assert.Equal(0, phone.HangupCalls);
        Assert.True(vm.CanManageUpdate);
        Assert.True(vm.OpenSettingsCommand.CanExecute(null));
        vm.Tick();
        Assert.Single(stub.Requests);
    }
}
