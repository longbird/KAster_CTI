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

    /// <summary>
    /// 자동 로그인. <b>비밀번호는 여기에도 없다</b> — 금고의 refresh token 으로 되살린다.
    /// </summary>
    [Fact]
    public async Task Resumes_the_last_session_without_a_password()
    {
        var stub = new StubHttpHandler().Enqueue(HttpStatusCode.OK, SuccessJson);
        var tokens = new FakeTokenStore(new TokenPair("old-at", "old-rt"));
        var saved = new MemoryStore();
        saved.Save(new SavedLogin { Remember = true, LoginId = "agent1001", Extension = "1001", AutoSignIn = true });

        var vm = Build(stub, tokens, saved);
        LoginResult? signedIn = null;
        vm.SignedIn += (_, r) => signedIn = r;

        Assert.True(await vm.TryResumeAsync());

        Assert.NotNull(signedIn);
        Assert.Equal("/api/v1/auth/refresh", stub.Requests[^1].RequestUri!.AbsolutePath);
        Assert.Contains("\"refreshToken\":\"old-rt\"", stub.Bodies[^1]);

        // 회전한 새 토큰을 넣어 둬야 다음에 켤 때도 들어간다.
        Assert.Equal("rt", tokens.Load()!.RefreshToken);
        Assert.False(vm.IsResuming);
    }

    /// <summary>꺼 뒀으면 금고에 토큰이 있어도 묻는다. 상담원이 정한 것이 이긴다.</summary>
    [Fact]
    public async Task Without_the_option_it_still_asks()
    {
        var stub = new StubHttpHandler();
        var vm = Build(stub, new FakeTokenStore(new TokenPair("at", "rt")), new MemoryStore());

        Assert.False(await vm.TryResumeAsync());
        Assert.Empty(stub.Requests);
    }

    /// <summary>
    /// 로그아웃하면 금고가 빈다. 그 상태로 되살리려 들면 자리를 넘긴 뒤 다음 사람이
    /// 앞사람 계정으로 들어간다.
    /// </summary>
    [Fact]
    public async Task With_an_empty_vault_there_is_nothing_to_resume()
    {
        var stub = new StubHttpHandler();
        var saved = new MemoryStore();
        saved.Save(new SavedLogin { Remember = true, LoginId = "agent1001", Extension = "1001", AutoSignIn = true });

        var vm = Build(stub, new FakeTokenStore(null), saved);

        Assert.False(await vm.TryResumeAsync());
        Assert.Empty(stub.Requests);
    }

    /// <summary>
    /// 서버가 토큰을 거절했다. 오류를 띄울 일이 아니라 평소처럼 받으면 된다.
    /// 다만 못 쓰는 토큰은 지운다 — 남기면 켤 때마다 실패하는 요청을 한 번씩 더 보낸다.
    /// </summary>
    [Fact]
    public async Task A_rejected_token_is_dropped_and_the_form_stays_quiet()
    {
        var stub = new StubHttpHandler().Enqueue(HttpStatusCode.Unauthorized, """{"success":false,"data":null,"error":{"message":"expired"}}""");
        var tokens = new FakeTokenStore(new TokenPair("at", "rt"));
        var saved = new MemoryStore();
        saved.Save(new SavedLogin { Remember = true, LoginId = "agent1001", Extension = "1001", AutoSignIn = true });

        var vm = Build(stub, tokens, saved);

        Assert.False(await vm.TryResumeAsync());
        Assert.Null(tokens.Load());
        Assert.False(vm.HasError);
        Assert.False(vm.IsResuming);
    }

    /// <summary>
    /// 서버에 못 닿은 것뿐이면 토큰을 남긴다. 잠깐 끊긴 것 때문에 비밀번호를 다시 치게 하면 안 된다.
    /// </summary>
    [Fact]
    public async Task An_unreachable_server_keeps_the_token_for_next_time()
    {
        var stub = new StubHttpHandler().RespondWith(_ => throw new HttpRequestException("서버 없음"));
        var tokens = new FakeTokenStore(new TokenPair("at", "rt"));
        var saved = new MemoryStore();
        saved.Save(new SavedLogin { Remember = true, LoginId = "agent1001", Extension = "1001", AutoSignIn = true });

        var vm = Build(stub, tokens, saved);

        Assert.False(await vm.TryResumeAsync());
        Assert.Equal("rt", tokens.Load()!.RefreshToken);
    }

    /// <summary>
    /// "아이디·내선 저장" 을 풀면 자동 로그인도 같이 꺼진다. 공용 PC 에서 아이디는 안 남기면서
    /// 세션만 되살아나면 다음 사람이 앞사람 계정으로 그냥 들어간다.
    /// </summary>
    [Fact]
    public async Task Unchecking_remember_turns_auto_sign_in_off_too()
    {
        var stub = new StubHttpHandler().Enqueue(HttpStatusCode.OK, SuccessJson);
        var saved = new MemoryStore();
        var vm = Filled(stub, new FakeTokenStore(null), saved);
        vm.RememberMe = false;
        vm.AutoSignIn = true;

        await vm.SignInAsync();

        Assert.False(saved.Load().AutoSignIn);
    }

    /// <summary>켜 두고 로그인하면 그 선택이 남아 다음에 켤 때 쓰인다.</summary>
    [Fact]
    public async Task The_choice_survives_to_the_next_launch()
    {
        var stub = new StubHttpHandler().Enqueue(HttpStatusCode.OK, SuccessJson);
        var saved = new MemoryStore();
        var vm = Filled(stub, new FakeTokenStore(null), saved);
        vm.RememberMe = true;
        vm.AutoSignIn = true;

        await vm.SignInAsync();

        Assert.True(saved.Load().AutoSignIn);
        Assert.True(Build(stub, new FakeTokenStore(null), saved).AutoSignIn);
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

    /// <summary>
    /// 기본은 실기기 모드다. 대부분의 자리에 책상 전화기가 있고, 소프트폰을 잘못 켜면
    /// 전화기가 울리는데 앱이 같은 내선을 가져가려 든다.
    /// </summary>
    [Fact]
    public void The_desk_phone_is_the_default()
    {
        var vm = Build(new StubHttpHandler(), new FakeTokenStore(null));

        Assert.False(vm.UseSoftphone);
    }

    /// <summary>
    /// 자리에 전화기가 있는지 없는지는 잘 바뀌지 않는다. "아이디 저장" 을 껐어도 모드는 기억한다 —
    /// 매번 체크하게 하면 잊고 실기기 모드로 로그인해 전화를 못 받는다.
    /// </summary>
    [Fact]
    public async Task The_mode_is_remembered_even_without_remembering_the_id()
    {
        var saved = new MemoryStore();
        var stub = new StubHttpHandler().Enqueue(HttpStatusCode.OK, SuccessJson);
        var vm = Filled(stub, new FakeTokenStore(null), saved);
        vm.RememberMe = false;
        vm.UseSoftphone = true;

        await vm.SignInAsync();

        Assert.True(saved.Load().UseSoftphone);
        Assert.False(saved.Load().Remember);
        Assert.Equal(string.Empty, saved.Load().LoginId);
    }

    [Fact]
    public void A_remembered_softphone_desk_comes_back_in_softphone_mode()
    {
        var saved = new MemoryStore();
        saved.Save(new SavedLogin { UseSoftphone = true });

        var vm = Build(new StubHttpHandler(), new FakeTokenStore(null), saved);

        Assert.True(vm.UseSoftphone);
    }
}
