namespace KAster.Desktop.Softphone;

public enum SoftphoneCallState
{
    Idle,
    Ringing,
    Answered,
    Ended,
}

/// <summary>수신 INVITE 로 알게 된 것. 통화의 정체(고객·callId)는 서버가 알려준다.</summary>
public sealed record IncomingCallInfo(string DialogId, string RemoteNumber, string RemoteDisplayName);

public sealed record SoftphoneCallStatus(SoftphoneCallState State, IncomingCallInfo? Call = null, string? Reason = null);
