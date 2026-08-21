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

    /// <summary>디스크를 쓰지 않는 저장소. 테스트가 실제 사용자 설정 파일을 건드리면 안 된다.</summary>
    private sealed class MemoryStore : ISavedLoginStore
    {
        private SavedLogin _value = new();
        public SavedLogin Load() => _value;
        public void Save(SavedLogin value) => _value = value;
    }

    private static LoginViewModel Build(StubHttpHandler stub, ITokenStore tokens, ISavedLoginStore? saved = null)
        => new(
            new AuthClient(new HttpClient(stub) { BaseAddress = new Uri("http://server/api/v1/") }),
            tokens,
            saved ?? new MemoryStore());

    private static LoginViewModel Filled(StubHttpHandler stub, ITokenStore tokens, ISavedLoginStore? saved = null)
    {
        var vm = Build(stub, tokens, saved);
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

    [Fact]
    public async Task Checking_remember_keeps_the_id_and_the_extension_for_next_time()
    {
        var saved = new MemoryStore();
        var stub = new StubHttpHandler().Enqueue(HttpStatusCode.OK, SuccessJson);
        var vm = Filled(stub, new FakeTokenStore(null), saved);
        vm.RememberMe = true;

        await vm.SignInAsync();

        Assert.True(saved.Load().Remember);
        Assert.Equal("agent1001", saved.Load().LoginId);
        Assert.Equal("1001", saved.Load().Extension);
    }

    /// <summary>비밀번호는 어디에도 남기지 않는다. 저장하는 것은 아이디와 내선뿐이다.</summary>
    [Fact]
    public async Task The_password_is_never_written_down()
    {
        var saved = new MemoryStore();
        var stub = new StubHttpHandler().Enqueue(HttpStatusCode.OK, SuccessJson);
        var vm = Filled(stub, new FakeTokenStore(null), saved);
        vm.RememberMe = true;

        await vm.SignInAsync();

        var json = System.Text.Json.JsonSerializer.Serialize(saved.Load());
        Assert.DoesNotContain("Password123!", json);
    }

    [Fact]
    public void A_remembered_agent_comes_back_with_only_the_password_left_to_type()
    {
        var saved = new MemoryStore();
        saved.Save(new SavedLogin { Remember = true, LoginId = "agent1001", Extension = "1001" });

        var vm = Build(new StubHttpHandler(), new FakeTokenStore(null), saved);

        Assert.Equal("agent1001", vm.LoginId);
        Assert.Equal("1001", vm.Extension);
        Assert.True(vm.RememberMe);
        Assert.True(vm.NeedsPasswordOnly);

        vm.Password = "Password123!";
        Assert.True(vm.CanSignIn);
    }

    [Fact]
    public void Nothing_remembered_means_an_empty_form()
    {
        var vm = Build(new StubHttpHandler(), new FakeTokenStore(null));

        Assert.Equal(string.Empty, vm.LoginId);
        Assert.Equal(string.Empty, vm.Extension);
        Assert.False(vm.RememberMe);
        Assert.False(vm.NeedsPasswordOnly);
    }

    /// <summary>체크를 풀고 로그인하면 남아 있던 것도 지워져야 한다. 공용 PC 에서 중요하다.</summary>
    [Fact]
    public async Task Unchecking_remember_wipes_what_was_stored()
    {
        var saved = new MemoryStore();
        saved.Save(new SavedLogin { Remember = true, LoginId = "agent1001", Extension = "1001" });
        var stub = new StubHttpHandler().Enqueue(HttpStatusCode.OK, SuccessJson);
        var vm = Build(stub, new FakeTokenStore(null), saved);
        vm.Password = "Password123!";
        vm.RememberMe = false;

        await vm.SignInAsync();

        Assert.False(saved.Load().Remember);
        Assert.Equal(string.Empty, saved.Load().LoginId);
        Assert.Equal(string.Empty, saved.Load().Extension);
    }

    /// <summary>로그인에 실패했으면 저장하지 않는다. 틀린 아이디가 굳어 버린다.</summary>
    [Fact]
    public async Task A_failed_sign_in_saves_nothing()
    {
        var saved = new MemoryStore();
        var stub = new StubHttpHandler().Enqueue(
            HttpStatusCode.Unauthorized,
            """{"success":false,"data":null,"error":{"code":"BAD","message":"아이디 또는 비밀번호가 다르다"}}""");
        var vm = Filled(stub, new FakeTokenStore(null), saved);
        vm.RememberMe = true;

        await vm.SignInAsync();

        Assert.False(saved.Load().Remember);
        Assert.Equal(string.Empty, saved.Load().LoginId);
    }
}
