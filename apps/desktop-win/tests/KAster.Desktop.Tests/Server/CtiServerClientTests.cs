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

    [Fact]
    public async Task Originate_sends_the_agent_extension_the_server_requires()
    {
        var stub = new StubHttpHandler().Enqueue(HttpStatusCode.OK, AckJson);

        var ack = await Build(stub).OriginateAsync("1001", "01011112222", "0215881588", CancellationToken.None);

        Assert.Equal("calls/originate", PathOf(stub.Requests[0]));
        Assert.Contains("\"agentExtension\":\"1001\"", stub.Bodies[0]);
        Assert.Contains("\"phoneNumber\":\"01011112222\"", stub.Bodies[0]);
        Assert.Contains("\"callerId\":\"0215881588\"", stub.Bodies[0]);
        Assert.True(ack.Accepted);
    }

    [Fact]
    public async Task Originate_leaves_the_caller_id_out_when_it_is_not_chosen()
    {
        var stub = new StubHttpHandler().Enqueue(HttpStatusCode.OK, AckJson);

        await Build(stub).OriginateAsync("1001", "01011112222", null, CancellationToken.None);

        Assert.DoesNotContain("callerId", stub.Bodies[0]);
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
