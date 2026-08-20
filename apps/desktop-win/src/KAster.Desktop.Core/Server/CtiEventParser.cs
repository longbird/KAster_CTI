using System.Text.Json;
using KAster.Desktop.Core.Contracts;
using KAster.Desktop.Core.Serialization;

namespace KAster.Desktop.Core.Server;

/// <summary>
/// 이벤트 이름 + JSON 본문을 타입 있는 이벤트로 바꾼다. 순수 함수라 소켓 없이 테스트한다.
/// 모르는 이름이나 깨진 본문은 예외 대신 <c>null</c> 이다 — 서버가 이벤트를 추가해도 클라이언트가 죽으면 안 된다.
/// </summary>
public static class CtiEventParser
{
    public static CtiEvent? Parse(string name, string json)
    {
        try
        {
            return name switch
            {
                CtiEventNames.CallCreated => new CallCreatedEvent(Require<ActiveCall>(json)),
                CtiEventNames.CallUpdated => new CallUpdatedEvent(Require<ActiveCall>(json)),
                CtiEventNames.CallEnded => new CallEndedEvent(Require<ActiveCall>(json)),
                CtiEventNames.ScreenPopCustomer => ToScreenPop(Require<ScreenPopPayload>(json)),
                CtiEventNames.AgentStatusChanged => new AgentStatusChangedEvent(Require<AgentStatusChange>(json)),
                CtiEventNames.QueueSummaryUpdated =>
                    new QueueSummaryUpdatedEvent(Require<List<QueueSummaryItem>>(json)),
                CtiEventNames.AnnouncementPushed => ToAnnouncement(Require<AnnouncementPayload>(json)),
                _ => null,
            };
        }
        catch (Exception ex) when (ex is JsonException or InvalidOperationException)
        {
            return null;
        }
    }

    private static T Require<T>(string json)
        => JsonSerializer.Deserialize<T>(json, JsonDefaults.Options)
           ?? throw new InvalidOperationException($"{typeof(T).Name} 본문이 비어 있다");

    private static CtiEvent ToScreenPop(ScreenPopPayload payload)
        => new ScreenPopEvent(payload.CallId, payload.Customer);

    private static CtiEvent ToAnnouncement(AnnouncementPayload payload)
        => new AnnouncementPushedEvent(payload.AnnouncementId, payload.Title, payload.Body, payload.Action);

    private sealed record ScreenPopPayload
    {
        public string CallId { get; init; } = string.Empty;
        public CustomerInfo? Customer { get; init; }
    }

    private sealed record AnnouncementPayload
    {
        public string AnnouncementId { get; init; } = string.Empty;
        public string Title { get; init; } = string.Empty;
        public string Body { get; init; } = string.Empty;
        public string? Action { get; init; }
    }
}
