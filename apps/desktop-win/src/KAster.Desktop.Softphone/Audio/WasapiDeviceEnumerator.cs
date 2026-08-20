using System.Runtime.Versioning;
using NAudio.CoreAudioApi;

namespace KAster.Desktop.Softphone.Audio;

/// <summary>WASAPI 장치 목록. 통화용 기본 장치는 멀티미디어가 아니라 <b>통신용</b> 역할을 본다.</summary>
[SupportedOSPlatform("windows")]
public sealed class WasapiDeviceEnumerator : IAudioDeviceEnumerator, IDisposable
{
    private readonly MMDeviceEnumerator _enumerator = new();

    public IReadOnlyList<AudioDeviceInfo> List(AudioDeviceKind kind)
    {
        var flow = ToFlow(kind);
        var defaultId = DefaultId(flow);

        return _enumerator.EnumerateAudioEndPoints(flow, DeviceState.Active)
            .Select(device => new AudioDeviceInfo(device.ID, device.FriendlyName, kind, device.ID == defaultId))
            .ToArray();
    }

    public AudioDeviceInfo? Default(AudioDeviceKind kind)
        => List(kind).FirstOrDefault(device => device.IsDefault);

    public MMDevice? Open(string deviceId)
    {
        try
        {
            return _enumerator.GetDevice(deviceId);
        }
        catch (Exception)
        {
            // 방금 뽑힌 장치일 수 있다. 호출한 쪽이 기본 장치로 내려간다.
            return null;
        }
    }

    private string? DefaultId(DataFlow flow)
    {
        try
        {
            // 통신용 역할로 열어야 OS 의 통화용 오디오 처리(에코 제거 포함)를 탄다.
            return _enumerator.HasDefaultAudioEndpoint(flow, Role.Communications)
                ? _enumerator.GetDefaultAudioEndpoint(flow, Role.Communications).ID
                : null;
        }
        catch (Exception)
        {
            return null;
        }
    }

    private static DataFlow ToFlow(AudioDeviceKind kind)
        => kind == AudioDeviceKind.Capture ? DataFlow.Capture : DataFlow.Render;

    public void Dispose() => _enumerator.Dispose();
}
