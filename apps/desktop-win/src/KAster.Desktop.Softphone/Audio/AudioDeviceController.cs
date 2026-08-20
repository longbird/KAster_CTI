namespace KAster.Desktop.Softphone.Audio;

/// <summary>
/// 저장해 둔 장치를 실제 장치로 되돌린다. 저장한 장치가 사라졌으면(헤드셋을 뽑았거나 USB 포트를 바꿨거나)
/// 조용히 기본 장치로 내려가되, 사용자에게 그 사실을 알린다. 말없이 바뀌면 통화 중에 마이크가 안 잡히는
/// 이유를 아무도 모른다.
/// </summary>
public sealed class AudioDeviceController
{
    private readonly IAudioDeviceEnumerator _devices;

    public AudioDeviceController(IAudioDeviceEnumerator devices) => _devices = devices;

    /// <summary>저장된 장치를 못 찾아 기본 장치로 내려갔을 때 오른다.</summary>
    public event EventHandler<string>? FellBackToDefault;

    public ResolvedAudioDevices Resolve(AudioDeviceSelection selection)
    {
        var capture = Pick(AudioDeviceKind.Capture, selection.CaptureDeviceId, "마이크");
        var callRender = Pick(AudioDeviceKind.Render, selection.CallRenderDeviceId, "통화 스피커");

        // 벨소리 장치를 따로 고르지 않았으면 통화 출력을 따라간다.
        var ringRender = selection.RingRenderDeviceId is null
            ? callRender
            : Pick(AudioDeviceKind.Render, selection.RingRenderDeviceId, "벨소리 스피커");

        return new ResolvedAudioDevices(capture, callRender, ringRender);
    }

    private AudioDeviceInfo? Pick(AudioDeviceKind kind, string? savedId, string label)
    {
        var available = _devices.List(kind);

        if (!string.IsNullOrEmpty(savedId))
        {
            var saved = available.FirstOrDefault(d => d.Id == savedId);
            if (saved is not null) return saved;
        }

        var fallback = _devices.Default(kind) ?? available.FirstOrDefault();

        if (!string.IsNullOrEmpty(savedId) && fallback is not null)
        {
            FellBackToDefault?.Invoke(
                this,
                $"저장된 {label} 장치를 찾을 수 없어 '{fallback.Name}' 로 바꿨다");
        }

        return fallback;
    }
}
