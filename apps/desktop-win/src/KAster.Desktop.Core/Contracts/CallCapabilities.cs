namespace KAster.Desktop.Core.Contracts;

/// <summary>같은 테넌트의 상담원 내선. 건 번호가 내선인지 외부인지 가르는 데 쓴다.</summary>
public sealed record AgentDirectoryEntry
{
    public string AgentId { get; init; } = string.Empty;
    public string AgentName { get; init; } = string.Empty;
    public string Extension { get; init; } = string.Empty;

    /// <summary>이 내선의 전화기가 PBX 에 등록돼 있는지. 실기기 모드에서 이 값이 곧 통화 가능 여부다.</summary>
    public SipRegistrationInfo? SipRegistration { get; init; }

    /// <summary>지금 근무 상태. 통화를 돌려줄 때 상대가 받을 수 있는지 판단하는 근거다.</summary>
    public AgentCurrentStatus? CurrentStatus { get; init; }

    /// <summary><c>LOGGED_IN</c> / <c>LOGGED_OUT</c>. 로그아웃한 사람에게 돌려주면 아무도 받지 않는다.</summary>
    public string? LoginStatus { get; init; }
}

/// <summary>상담원의 지금 상태. 서버 <c>GET /agents</c> 가 진행 중인 상태 이력에서 뽑아 준다.</summary>
public sealed record AgentCurrentStatus
{
    public AgentStatusCode StatusCode { get; init; } = AgentStatusCode.Unknown;

    public string? ReasonCode { get; init; }
}

/// <summary>서버가 PBX 에 직접 물어본 단말 등록 상태.</summary>
public sealed record SipRegistrationInfo
{
    public bool Registered { get; init; }
    public string RegistrationStatus { get; init; } = "UNREGISTERED";
    public string? ContactUri { get; init; }
    public string? UserAgent { get; init; }
}

/// <summary>관리자가 등록해 둔 발신번호. 여기 없는 번호로는 서버가 발신을 거부한다.</summary>
public sealed record OutboundDialOptions
{
    public IReadOnlyList<string> AllowedCallerIds { get; init; } = Array.Empty<string>();
    public string? DefaultCallerId { get; init; }
}

/// <summary>
/// 이 상담원이 무엇을 걸 수 있는지. 화면은 이 값으로 버튼을 열고 닫는다 —
/// 못 걸 전화를 걸어 보고 나서 거부당하는 것보다, 아예 안 보이는 편이 낫다.
/// </summary>
public sealed record CallCapabilities
{
    public bool CanOriginateExternal { get; init; }
    public bool CanOriginateInternal { get; init; }
    public OutboundDialOptions OutboundDialOptions { get; init; } = new();

    /// <summary>못 거는 이유. 상담원에게 그대로 보여 준다.</summary>
    public IReadOnlyList<string> DisabledReasons { get; init; } = Array.Empty<string>();
}
