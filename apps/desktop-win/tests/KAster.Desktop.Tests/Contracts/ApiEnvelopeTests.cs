using System.Text.Json;
using KAster.Desktop.Core.Contracts;
using KAster.Desktop.Core.Serialization;

namespace KAster.Desktop.Tests.Contracts;

public class ApiEnvelopeTests
{
    [Fact]
    public void Unwraps_a_successful_envelope()
    {
        const string json = """
        {"success":true,"data":{"callId":"c-1","linkedid":"l-1","ani":"01034567890",
        "dnis":"1588","queueName":"main","sessionStatus":"TALKING","startedAt":"2026-08-20T04:00:00.000Z"},
        "error":null}
        """;

        var envelope = JsonSerializer.Deserialize<ApiEnvelope<ActiveCall>>(json, JsonDefaults.Options);

        Assert.NotNull(envelope);
        Assert.True(envelope!.Success);
        Assert.Equal("c-1", envelope.Data!.CallId);
        Assert.Equal(SessionStatus.Talking, envelope.Data.SessionStatus);
    }

    [Fact]
    public void Surfaces_the_error_message_when_success_is_false()
    {
        const string json = """{"success":false,"data":null,"error":{"message":"Forbidden","code":"FORBIDDEN"}}""";

        var envelope = JsonSerializer.Deserialize<ApiEnvelope<ActiveCall>>(json, JsonDefaults.Options);

        Assert.False(envelope!.Success);
        Assert.Equal("Forbidden", envelope.Error!.Message);
    }

    [Fact]
    public void Unknown_session_status_does_not_throw()
    {
        // 서버가 상태값을 추가해도 클라이언트가 예외로 죽으면 안 된다.
        const string json = """
        {"success":true,"data":{"callId":"c-2","linkedid":"l-2","ani":"","dnis":"","queueName":"",
        "sessionStatus":"SOMETHING_NEW","startedAt":"2026-08-20T04:00:00.000Z"},"error":null}
        """;

        var envelope = JsonSerializer.Deserialize<ApiEnvelope<ActiveCall>>(json, JsonDefaults.Options);

        Assert.Equal(SessionStatus.Unknown, envelope!.Data!.SessionStatus);
    }

    [Fact]
    public void Unknown_agent_status_does_not_throw()
    {
        const string json = """{"success":true,"data":{"agentId":"a-1","statusCode":"SOMETHING_NEW"},"error":null}""";

        var envelope = JsonSerializer.Deserialize<ApiEnvelope<AgentStatusChange>>(json, JsonDefaults.Options);

        Assert.Equal(AgentStatusCode.Unknown, envelope!.Data!.StatusCode);
    }

    [Fact]
    public void Reads_the_native_sip_fields_from_the_softphone_config()
    {
        const string json = """
        {"success":true,"data":{"agent":{"agentId":"a-1","agentName":"김상담","extension":"1001","role":"agent"},
        "softphoneConfig":{"enabled":true,"sipUri":"sip:1001@pbx.local","sipServer":"pbx.local:48950",
        "transport":"udp","authorizationUsername":"1001","authorizationPassword":"s3cret","displayName":"김상담"}},
        "error":null}
        """;

        var envelope = JsonSerializer.Deserialize<ApiEnvelope<SessionSummary>>(json, JsonDefaults.Options);

        var config = envelope!.Data!.SoftphoneConfig!;
        Assert.True(config.Enabled);
        Assert.Equal("pbx.local:48950", config.SipServer);
        Assert.Equal("udp", config.Transport);
        Assert.Equal("s3cret", config.AuthorizationPassword);
    }

    [Fact]
    public void Defaults_the_transport_to_udp_when_the_server_omits_it()
    {
        // 서버가 아직 갱신되지 않은 현장에서도 클라이언트가 동작해야 한다.
        const string json = """
        {"success":true,"data":{"enabled":true,"sipUri":"sip:1001@pbx.local","displayName":"김상담"},"error":null}
        """;

        var envelope = JsonSerializer.Deserialize<ApiEnvelope<SoftphoneConfig>>(json, JsonDefaults.Options);

        Assert.Equal("udp", envelope!.Data!.Transport);
        Assert.Null(envelope.Data.SipServer);
    }
}
