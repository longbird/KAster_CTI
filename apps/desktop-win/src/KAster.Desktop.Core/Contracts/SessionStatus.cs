using System.Text.Json;
using System.Text.Json.Serialization;

namespace KAster.Desktop.Core.Contracts;

/// <summary>
/// 통화 세션 상태. 원전은 <c>apps/desktop/src/shared/cti.ts</c> 의 <c>SessionStatus</c>.
/// 서버가 값을 추가해도 클라이언트가 죽지 않도록 모르는 값은 <see cref="Unknown"/> 으로 떨어진다.
/// </summary>
[JsonConverter(typeof(SessionStatusConverter))]
public enum SessionStatus
{
    Unknown = 0,
    New,
    Ivr,
    Queued,
    RingingAgent,
    Talking,
    Hold,
    Transferring,
    AfterCallWork,
    Ended,
}

public sealed class SessionStatusConverter : JsonConverter<SessionStatus>
{
    public override SessionStatus Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        => reader.GetString() switch
        {
            "NEW" => SessionStatus.New,
            "IVR" => SessionStatus.Ivr,
            "QUEUED" => SessionStatus.Queued,
            "RINGING_AGENT" => SessionStatus.RingingAgent,
            "TALKING" => SessionStatus.Talking,
            "HOLD" => SessionStatus.Hold,
            "TRANSFERRING" => SessionStatus.Transferring,
            "AFTER_CALL_WORK" => SessionStatus.AfterCallWork,
            "ENDED" => SessionStatus.Ended,
            _ => SessionStatus.Unknown,
        };

    public override void Write(Utf8JsonWriter writer, SessionStatus value, JsonSerializerOptions options)
        => writer.WriteStringValue(value switch
        {
            SessionStatus.New => "NEW",
            SessionStatus.Ivr => "IVR",
            SessionStatus.Queued => "QUEUED",
            SessionStatus.RingingAgent => "RINGING_AGENT",
            SessionStatus.Talking => "TALKING",
            SessionStatus.Hold => "HOLD",
            SessionStatus.Transferring => "TRANSFERRING",
            SessionStatus.AfterCallWork => "AFTER_CALL_WORK",
            SessionStatus.Ended => "ENDED",
            _ => "UNKNOWN",
        });
}
