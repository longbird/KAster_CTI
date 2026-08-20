namespace KAster.Desktop.Core.Contracts;

public sealed record AgentProfile
{
    public required string AgentId { get; init; }
    public string AgentName { get; init; } = string.Empty;
    public string Extension { get; init; } = string.Empty;
    public string Role { get; init; } = "agent";
}

/// <summary>
/// 서버가 내려주는 SIP 설정. <c>sipServer</c> / <c>transport</c> 는 네이티브 클라이언트용으로 추가된 필드이고,
/// <c>wsServer</c> 는 웹 경로가 계속 쓰므로 여기서는 읽지 않는다.
/// </summary>
public sealed record SoftphoneConfig
{
    public bool Enabled { get; init; }
    public string? SipUri { get; init; }
    public string? SipServer { get; init; }

    /// <summary>서버가 아직 이 필드를 안 내려주는 현장이 있으므로 기본값은 udp 다.</summary>
    public string Transport { get; init; } = "udp";

    public string? AuthorizationUsername { get; init; }
    public string? AuthorizationPassword { get; init; }
    public string DisplayName { get; init; } = string.Empty;
}

public sealed record SessionSummary
{
    public required AgentProfile Agent { get; init; }
    public SoftphoneConfig? SoftphoneConfig { get; init; }
}
