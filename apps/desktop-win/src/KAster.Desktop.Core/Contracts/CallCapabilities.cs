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

/// <summary>
/// 통화 중에 이 PBX 가 실제로 받아 주는 제어. 보류는 표준 AMI 액션이 아니라 feature code 를
/// DTMF 로 흘려보내는 방식이라, 관리자가 코드를 넣어 두지 않은 현장에서는 서버가 400 을 던진다.
/// 그런 곳에서는 버튼을 눌러 보고 실패하는 대신 <b>버튼 자체를 만들지 않는다</b>.
///
/// 원천은 <c>GET /me/session</c> 의 <c>callControlCapabilities</c> 다. 발신 권한을 주는
/// <c>me/call-capabilities</c> 에는 이 블록이 없다.
/// </summary>
public sealed record CallControlCapabilities
{
    /// <summary>hold 와 resume feature code 가 <b>둘 다</b> 있을 때만 서버가 켠다.</summary>
    public bool HoldEnabled { get; init; }

    /// <summary><c>feature_code</c> 또는 <c>disabled</c>.</summary>
    public string HoldMode { get; init; } = "disabled";
}
