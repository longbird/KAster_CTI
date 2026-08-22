namespace KAster.Desktop.App.Services;

/// <summary>
/// 현장마다 다른 통화 동작. 지금까지 코드 상수였던 값들이라 <b>기본값이 옛 동작과 같다</b> —
/// 설정을 만들었다고 현장 동작이 조용히 달라지면 안 된다.
/// </summary>
public sealed record CallPreferences
{
    /// <summary>
    /// 걸기를 누른 뒤 걸려 오는 전화를 "우리가 건 것" 으로 보고 자동으로 받는 기간.
    ///
    /// PBX 가 이 단말을 먼저 부르는 방식이라 되걸어 오기까지 걸리는 시간이 트렁크마다 다르다.
    /// 짧으면 자기가 건 전화가 수신 전화로 뜨고 자동 응답이 안 되며,
    /// <b>길면 그 사이에 걸려 온 고객 전화를 말없이 받는다.</b>
    /// </summary>
    public int SelfAnswerWindowSeconds { get; init; } = 45;

    /// <summary>
    /// 보류·협의 완료·협의 취소의 답을 기다리는 한도.
    ///
    /// 서버는 feature code 를 DTMF 로 흘려보낼 뿐이고 PBX 가 그것을 먹었는지 모른다.
    /// 짧으면 멀쩡히 먹은 보류에 "응답하지 않았다" 가 뜨고, 길면 안 먹은 보류를 하염없이 기다린다.
    /// </summary>
    public int PbxResponseWaitSeconds { get; init; } = 5;

    public const int MinSelfAnswerWindowSeconds = 5;
    public const int MaxSelfAnswerWindowSeconds = 180;
    public const int MinPbxResponseWaitSeconds = 2;
    public const int MaxPbxResponseWaitSeconds = 30;

    /// <summary>
    /// 쓸 수 있는 값으로 좁힌다. 이 파일은 손으로 고칠 수 있고, 0 이나 3600 이 들어오면
    /// 통화 동작이 통째로 망가진다 — 그것을 화면이 아니라 <b>읽는 자리</b>에서 막는다.
    /// </summary>
    public CallPreferences Sane() => new()
    {
        SelfAnswerWindowSeconds = Math.Clamp(
            SelfAnswerWindowSeconds, MinSelfAnswerWindowSeconds, MaxSelfAnswerWindowSeconds),
        PbxResponseWaitSeconds = Math.Clamp(
            PbxResponseWaitSeconds, MinPbxResponseWaitSeconds, MaxPbxResponseWaitSeconds),
    };
}
