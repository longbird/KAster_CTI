using System.Text.Json;
using System.Text.Json.Serialization;

namespace KAster.Desktop.Core.Contracts;

/// <summary>
/// 상담원 상태. 원전은 <c>apps/desktop/src/shared/cti.ts</c> 의 <c>AgentStatusCode</c>.
/// </summary>
[JsonConverter(typeof(AgentStatusCodeConverter))]
public enum AgentStatusCode
{
    Unknown = 0,
    Available,
    Ringing,
    Talking,
    AfterCallWork,
    Break,
    Meal,
    Training,
    ManualPaused,
}

public sealed class AgentStatusCodeConverter : JsonConverter<AgentStatusCode>
{
    public override AgentStatusCode Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        => reader.GetString() switch
        {
            "AVAILABLE" => AgentStatusCode.Available,
            "RINGING" => AgentStatusCode.Ringing,
            "TALKING" => AgentStatusCode.Talking,
            "AFTER_CALL_WORK" => AgentStatusCode.AfterCallWork,
            "BREAK" => AgentStatusCode.Break,
            "MEAL" => AgentStatusCode.Meal,
            "TRAINING" => AgentStatusCode.Training,
            "MANUAL_PAUSED" => AgentStatusCode.ManualPaused,
            _ => AgentStatusCode.Unknown,
        };

    public override void Write(Utf8JsonWriter writer, AgentStatusCode value, JsonSerializerOptions options)
        => writer.WriteStringValue(ToWire(value));

    /// <summary>서버로 보낼 때 쓰는 문자열. 모르는 값은 보내지 않는다.</summary>
    public static string ToWire(AgentStatusCode value) => value switch
    {
        AgentStatusCode.Available => "AVAILABLE",
        AgentStatusCode.Ringing => "RINGING",
        AgentStatusCode.Talking => "TALKING",
        AgentStatusCode.AfterCallWork => "AFTER_CALL_WORK",
        AgentStatusCode.Break => "BREAK",
        AgentStatusCode.Meal => "MEAL",
        AgentStatusCode.Training => "TRAINING",
        AgentStatusCode.ManualPaused => "MANUAL_PAUSED",
        _ => "UNKNOWN",
    };
}

/// <summary>상태 변경 응답과 <c>agent.status.changed</c> 이벤트가 공유하는 모양.</summary>
public sealed record AgentStatusChange
{
    public string AgentId { get; init; } = string.Empty;
    public AgentStatusCode StatusCode { get; init; }
    public string? ReasonCode { get; init; }
}
