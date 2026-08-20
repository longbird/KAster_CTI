namespace KAster.Desktop.Softphone.Audio;

public enum AudioDeviceKind
{
    Capture,
    Render,
}

public sealed record AudioDeviceInfo(string Id, string Name, AudioDeviceKind Kind, bool IsDefault);

/// <summary>장치 열거. 실제 구현은 WASAPI 이고 테스트는 가짜 목록을 끼운다.</summary>
public interface IAudioDeviceEnumerator
{
    IReadOnlyList<AudioDeviceInfo> List(AudioDeviceKind kind);
    AudioDeviceInfo? Default(AudioDeviceKind kind);
}

/// <summary>사용자가 고른 장치. 비어 있으면 기본 장치를 쓴다.</summary>
public sealed record AudioDeviceSelection
{
    public string? CaptureDeviceId { get; init; }
    public string? CallRenderDeviceId { get; init; }

    /// <summary>벨소리 출력. 통화 출력과 따로 고를 수 있다.</summary>
    public string? RingRenderDeviceId { get; init; }
}

public sealed record ResolvedAudioDevices(
    AudioDeviceInfo? Capture,
    AudioDeviceInfo? CallRender,
    AudioDeviceInfo? RingRender);
