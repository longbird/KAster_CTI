using System.Net;
using KAster.Desktop.Core.Contracts;
using KAster.Desktop.Core.Server;
using Xunit;

namespace KAster.Desktop.Tests.Server;

public class CtiServerClientTests
{
    private const string AckJson = """
    {"success":true,"data":{"accepted":true,"requestedAt":"2026-08-20T04:00:00.000Z","correlationId":"corr-1"},
    "error":null}
    """;

    private static CtiServerClient Build(StubHttpHandler stub) =>
        new(new HttpClient(stub) { BaseAddress = new Uri("http://server/api/v1/") });

    private static string PathOf(HttpRequestMessage request) =>
        request.RequestUri!.AbsolutePath["/api/v1/".Length..];

    [Fact]
    public async Task Reads_the_active_calls_out_of_the_envelope()
    {
        var stub = new StubHttpHandler().Enqueue(HttpStatusCode.OK, """
        {"success":true,"data":[{"callId":"c-1","linkedid":"l-1","ani":"01011112222","dnis":"1588",
        "queueName":"main","sessionStatus":"TALKING","startedAt":"2026-08-20T04:00:00.000Z","isMuted":false,
        "customer":{"customerId":"cu-1","customerName":"홍길동","grade":"VIP","phoneNumber":"01011112222"}}],
        "error":null}
        """);

        var calls = await Build(stub).GetActiveCallsAsync(CancellationToken.None);

        Assert.Equal("calls/active", PathOf(stub.Requests[0]));
        var call = Assert.Single(calls);
        Assert.Equal("c-1", call.CallId);
        Assert.Equal(SessionStatus.Talking, call.SessionStatus);
        Assert.Equal("홍길동", call.Customer!.CustomerName);
    }

    /// <summary>
    /// 서버는 <c>calls/originate</c> 를 supervisor/admin 에게만 연다. 상담원 클라이언트는
    /// 전용 명령 경로를 써야 하고, 내선은 본문이 아니라 인증 세션에서 서버가 꺼낸다.
    /// </summary>
    [Fact]
    public async Task Originate_uses_the_client_command_path_not_the_supervisor_one()
    {
        var stub = new StubHttpHandler().Enqueue(HttpStatusCode.OK, AckJson);

        var ack = await Build(stub).OriginateAsync("01011112222", "0215881588", CancellationToken.None);

        Assert.Equal("client/call-commands/originate", PathOf(stub.Requests[0]));
        Assert.Contains("\"phoneNumber\":\"01011112222\"", stub.Bodies[0]);
        Assert.Contains("\"callerId\":\"0215881588\"", stub.Bodies[0]);
        Assert.Contains("\"commandId\":", stub.Bodies[0]);
        Assert.DoesNotContain("agentExtension", stub.Bodies[0]);
        Assert.True(ack.Accepted);
    }

    /// <summary>헤더가 하나라도 빠지면 서버가 통째로 거부한다.</summary>
    [Fact]
    public async Task Originate_carries_every_header_the_command_protocol_requires()
    {
        var stub = new StubHttpHandler().Enqueue(HttpStatusCode.OK, AckJson);

        await Build(stub).OriginateAsync("01011112222", null, CancellationToken.None);

        var headers = stub.Requests[0].Headers;
        Assert.Equal("kaster-desktop-v1", headers.GetValues("x-client-protocol").Single());
        Assert.Single(headers.GetValues("x-correlation-id"));
        Assert.Single(headers.GetValues("idempotency-key"));

        // 서버는 60초를 넘게 어긋난 시각을 거부한다.
        var stamp = long.Parse(headers.GetValues("x-command-timestamp").Single());
        var skew = Math.Abs(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - stamp);
        Assert.True(skew < 10_000, $"명령 시각이 {skew}ms 어긋났다");

        // nonce 는 16~128자에 [A-Za-z0-9._:-] 만 허용된다.
        var nonce = headers.GetValues("x-command-nonce").Single();
        Assert.InRange(nonce.Length, 16, 128);
        Assert.Matches("^[A-Za-z0-9._:-]+$", nonce);
    }

    /// <summary>같은 명령이 두 번 접수되지 않도록 서버가 nonce 를 한 번만 받아 준다.</summary>
    [Fact]
    public async Task Two_calls_never_reuse_a_nonce()
    {
        var stub = new StubHttpHandler().Enqueue(HttpStatusCode.OK, AckJson).Enqueue(HttpStatusCode.OK, AckJson);
        var client = Build(stub);

        await client.OriginateAsync("01011112222", null, CancellationToken.None);
        await client.OriginateAsync("01011112222", null, CancellationToken.None);

        Assert.NotEqual(
            stub.Requests[0].Headers.GetValues("x-command-nonce").Single(),
            stub.Requests[1].Headers.GetValues("x-command-nonce").Single());
    }

    /// <summary>
    /// 메모는 통화 하나에 붙는다. 서버는 상담원 id 와 메모 종류를 함께 받는다 —
    /// 후처리 코드와 같은 표를 쓰기 때문이다.
    /// </summary>
    [Fact]
    public async Task A_memo_is_filed_against_the_call_it_belongs_to()
    {
        var stub = new StubHttpHandler().Enqueue(HttpStatusCode.OK, """{"success":true,"data":{},"error":null}""");

        await Build(stub).SaveMemoAsync("c-1", "a-1", "고객이 재통화 요청", CancellationToken.None);

        Assert.Equal("calls/c-1/memo", PathOf(stub.Requests[0]));

        // 한글은 유니코드 이스케이프로 나간다 (유효한 JSON 이다). 문자열이 아니라 값으로 비교한다.
        var body = System.Text.Json.JsonDocument.Parse(stub.Bodies[0]!).RootElement;
        Assert.Equal("a-1", body.GetProperty("agentId").GetString());
        Assert.Equal("고객이 재통화 요청", body.GetProperty("memoText").GetString());
        Assert.Equal("acw", body.GetProperty("memoType").GetString());
    }

    [Fact]
    public async Task Internal_calls_go_to_the_extension_path_with_no_command_headers()
    {
        var stub = new StubHttpHandler().Enqueue(HttpStatusCode.OK, AckJson);

        await Build(stub).OriginateInternalAsync("1002", CancellationToken.None);

        Assert.Equal("calls/originate/internal", PathOf(stub.Requests[0]));
        Assert.Contains("\"targetExtension\":\"1002\"", stub.Bodies[0]);
    }

    [Fact]
    public async Task The_agent_directory_gives_back_the_extensions_in_use()
    {
        var stub = new StubHttpHandler().Enqueue(HttpStatusCode.OK, """
        {"success":true,"data":[
          {"agentId":"a-1","agentName":"김상담","extension":"1001"},
          {"agentId":"a-2","agentName":"이상담","extension":"1002"}
        ],"error":null}
        """);

        var directory = await Build(stub).GetAgentDirectoryAsync(CancellationToken.None);

        Assert.Equal("agents", PathOf(stub.Requests[0]));
        Assert.Equal(new[] { "1001", "1002" }, directory.Select(a => a.Extension));
    }

    [Fact]
    public async Task Originate_leaves_the_caller_id_out_when_it_is_not_chosen()
    {
        var stub = new StubHttpHandler().Enqueue(HttpStatusCode.OK, AckJson);

        await Build(stub).OriginateAsync("01011112222", null, CancellationToken.None);

        Assert.DoesNotContain("callerId", stub.Bodies[0]);
    }

    [Fact]
    public async Task Pickup_hits_the_call_scoped_path()
    {
        var stub = new StubHttpHandler().Enqueue(HttpStatusCode.OK, AckJson);

        await Build(stub).PickupAsync("c-9", CancellationToken.None);

        Assert.Equal("calls/c-9/pickup", PathOf(stub.Requests[0]));
    }

    [Fact]
    public async Task Answer_and_hangup_hit_the_call_scoped_paths()
    {
        var stub = new StubHttpHandler().Enqueue(HttpStatusCode.OK, AckJson).Enqueue(HttpStatusCode.OK, AckJson);
        var client = Build(stub);

        await client.AnswerAsync("c-1", CancellationToken.None);
        await client.HangupAsync("c-1", CancellationToken.None);

        Assert.Equal("calls/c-1/answer", PathOf(stub.Requests[0]));
        Assert.Equal("calls/c-1/hangup", PathOf(stub.Requests[1]));
    }

    [Theory]
    [InlineData(true, "on")]
    [InlineData(false, "off")]
    public async Task Mute_sends_the_state_the_server_expects(bool muted, string expected)
    {
        var stub = new StubHttpHandler().Enqueue(HttpStatusCode.OK, AckJson);

        await Build(stub).MuteAsync("c-1", muted, CancellationToken.None);

        Assert.Equal("calls/c-1/mute", PathOf(stub.Requests[0]));
        Assert.Contains($"\"state\":\"{expected}\"", stub.Bodies[0]);
    }

    [Fact]
    public async Task Status_change_sends_the_wire_spelling_of_the_code()
    {
        var stub = new StubHttpHandler().Enqueue(HttpStatusCode.OK, """
        {"success":true,"data":{"agentId":"a-1","statusCode":"AFTER_CALL_WORK","reasonCode":null},"error":null}
        """);

        var change = await Build(stub).ChangeAgentStatusAsync(
            "a-1", AgentStatusCode.AfterCallWork, null, CancellationToken.None);

        Assert.Equal("agents/a-1/status", PathOf(stub.Requests[0]));
        Assert.Contains("\"statusCode\":\"AFTER_CALL_WORK\"", stub.Bodies[0]);
        Assert.Equal(AgentStatusCode.AfterCallWork, change.StatusCode);
    }

    /// <summary>보류와 해제는 서로 다른 경로다. 본문은 없다 — 파라미터가 통화 하나뿐이다.</summary>
    [Fact]
    public async Task Hold_and_resume_are_two_paths_with_no_body()
    {
        var stub = new StubHttpHandler()
            .Enqueue(HttpStatusCode.OK, AckJson)
            .Enqueue(HttpStatusCode.OK, AckJson);
        var client = Build(stub);

        var held = await client.HoldAsync("c-1", CancellationToken.None);
        await client.ResumeAsync("c-1", CancellationToken.None);

        Assert.Equal("calls/c-1/hold", PathOf(stub.Requests[0]));
        Assert.Equal("calls/c-1/resume", PathOf(stub.Requests[1]));
        Assert.True(held.Accepted);
    }

    [Fact]
    public async Task Dtmf_carries_the_digits_the_agent_pressed()
    {
        var stub = new StubHttpHandler().Enqueue(HttpStatusCode.OK, AckJson);

        var ack = await Build(stub).SendDtmfAsync("c-1", "5#", CancellationToken.None);

        Assert.Equal("calls/c-1/dtmf", PathOf(stub.Requests[0]));
        Assert.Contains("\"digits\":\"5#\"", stub.Bodies[0]);
        Assert.True(ack.Accepted);
    }

    /// <summary>
    /// 보류 가능 여부는 <c>me/call-capabilities</c> 가 아니라 <c>me/session</c> 이 내려준다.
    /// 발신 권한 쪽에는 이 필드가 없다.
    /// </summary>
    [Fact]
    public async Task Call_control_capabilities_come_from_the_session()
    {
        var stub = new StubHttpHandler().Enqueue(HttpStatusCode.OK, """
        {"success":true,"data":{
          "agent":{"agentId":"a-1","agentName":"김상담","extension":"1001","role":"agent"},
          "callControlCapabilities":{"muteEnabled":true,"holdEnabled":true,"holdMode":"feature_code"}},
        "error":null}
        """);

        var control = await Build(stub).GetCallControlCapabilitiesAsync(CancellationToken.None);

        Assert.Equal("me/session", PathOf(stub.Requests[0]));
        Assert.True(control.HoldEnabled);
        Assert.Equal("feature_code", control.HoldMode);
    }

    /// <summary>
    /// 현장 서버가 이 블록을 아직 안 내려줄 수 있다. 그때는 못 하는 쪽으로 읽어야 한다 —
    /// 없는 기능의 버튼을 열어 두면 눌렀을 때 400 이 돌아온다.
    /// </summary>
    [Fact]
    public async Task A_session_without_the_control_block_reads_as_no_hold()
    {
        var stub = new StubHttpHandler().Enqueue(HttpStatusCode.OK, """
        {"success":true,"data":{"agent":{"agentId":"a-1","extension":"1001"}},"error":null}
        """);

        var control = await Build(stub).GetCallControlCapabilitiesAsync(CancellationToken.None);

        Assert.False(control.HoldEnabled);
    }

    [Fact]
    public async Task A_failed_envelope_becomes_an_exception_carrying_the_server_message()
    {
        var stub = new StubHttpHandler().Enqueue(
            HttpStatusCode.BadRequest,
            """{"success":false,"data":null,"error":{"code":"NO_AGENT_LEG","message":"상담원 leg 를 찾을 수 없다"}}""");

        var ex = await Assert.ThrowsAsync<CtiServerException>(
            () => Build(stub).HangupAsync("c-1", CancellationToken.None));

        Assert.Equal("NO_AGENT_LEG", ex.Code);
        Assert.Contains("상담원 leg", ex.Message);
    }
}
