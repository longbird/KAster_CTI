using System.Net;
using KAster.Desktop.App.ViewModels;
using KAster.Desktop.Core.Server;
using KAster.Desktop.Core.Storage;
using KAster.Desktop.Tests.Server;
using Xunit;

namespace KAster.Desktop.Tests.App;

public class LoginViewModelTests
{
    private const string SuccessJson = """
    {"success":true,"data":{"accessToken":"at","refreshToken":"rt","tokenType":"Bearer","expiresIn":900,
    "agent":{"agentId":"a-1","agentName":"김상담","extension":"1001","role":"agent"},
    "softphoneConfig":{"enabled":true,"sipUri":"sip:1001@pbx.local","sipServer":"pbx.local:48950",
    "transport":"udp","authorizationUsername":"1001","authorizationPassword":"s3cret","displayName":"김상담"}},
    "error":null}
    """;

    private static LoginViewModel Build(StubHttpHandler stub, ITokenStore tokens)
        => new(new AuthClient(new HttpClient(stub) { BaseAddress = new Uri("http://server/api/v1/") }), tokens);

    private static LoginViewModel Filled(StubHttpHandler stub, ITokenStore tokens)
    {
        var vm = Build(stub, tokens);
        vm.LoginId = "agent1001";
        vm.Password = "Password123!";
        vm.Extension = "1001";
        return vm;
    }

    [Fact]
    public void Cannot_sign_in_until_every_field_is_filled()
    {
        var vm = Build(new StubHttpHandler(), new FakeTokenStore(null));

        Assert.False(vm.CanSignIn);

        vm.LoginId = "agent1001";
        Assert.False(vm.CanSignIn);

        vm.Password = "Password123!";
        Assert.False(vm.CanSignIn);

        vm.Extension = "1001";
        Assert.True(vm.CanSignIn);
    }

    [Fact]
    public void Whitespace_does_not_count_as_a_filled_field()
    {
        var vm = Build(new StubHttpHandler(), new FakeTokenStore(null));
        vm.LoginId = "   ";
        vm.Password = "   ";
        vm.Extension = "   ";

        Assert.False(vm.CanSignIn);
    }

    [Fact]
    public async Task Stores_the_tokens_in_the_vault_on_success()
    {
        var tokens = new FakeTokenStore(null);
        var vm = Filled(new StubHttpHandler().Enqueue(HttpStatusCode.OK, SuccessJson), tokens);

        await vm.SignInAsync();

        Assert.Equal("at", tokens.Load()!.AccessToken);
        Assert.Equal("rt", tokens.Load()!.RefreshToken);
    }

    [Fact]
    public async Task Announces_the_session_on_success()
    {
        LoginResult? signedIn = null;
        var vm = Filled(new StubHttpHandler().Enqueue(HttpStatusCode.OK, SuccessJson), new FakeTokenStore(null));
        vm.SignedIn += (_, result) => signedIn = result;

        await vm.SignInAsync();

        Assert.Equal("a-1", signedIn!.Session.Agent.AgentId);
        Assert.Equal("pbx.local:48950", signedIn.Session.SoftphoneConfig!.SipServer);
        Assert.Null(vm.ErrorMessage);
    }

    [Fact]
    public async Task Shows_the_server_message_and_clears_the_password_on_failure()
    {
        var stub = new StubHttpHandler().Enqueue(
            HttpStatusCode.Unauthorized,
            """{"success":false,"data":null,"error":{"code":"UNAUTHORIZED","message":"Invalid credentials"}}""");
        var tokens = new FakeTokenStore(null);
        var vm = Filled(stub, tokens);

        await vm.SignInAsync();

        Assert.Contains("Invalid credentials", vm.ErrorMessage);
        Assert.Equal(string.Empty, vm.Password);
        Assert.Null(tokens.Load());
    }

    [Fact]
    public async Task Keeps_the_login_id_and_the_extension_after_a_failure()
    {
        var stub = new StubHttpHandler().Enqueue(
            HttpStatusCode.Unauthorized,
            """{"success":false,"data":null,"error":{"code":"UNAUTHORIZED","message":"Invalid credentials"}}""");
        var vm = Filled(stub, new FakeTokenStore(null));

        await vm.SignInAsync();

        // 비밀번호만 지운다. 아이디와 내선까지 지우면 매번 다시 타야 한다.
        Assert.Equal("agent1001", vm.LoginId);
        Assert.Equal("1001", vm.Extension);
    }

    [Fact]
    public async Task Reports_a_network_failure_without_throwing()
    {
        var vm = Filled(new StubHttpHandler(), new FakeTokenStore(null));

        await vm.SignInAsync();

        Assert.NotNull(vm.ErrorMessage);
        Assert.False(vm.IsBusy);
    }

    [Fact]
    public async Task Clears_the_busy_flag_when_it_is_done()
    {
        var vm = Filled(new StubHttpHandler().Enqueue(HttpStatusCode.OK, SuccessJson), new FakeTokenStore(null));

        await vm.SignInAsync();

        Assert.False(vm.IsBusy);
    }
}
