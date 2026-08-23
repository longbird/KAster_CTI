using System.Runtime.Versioning;
using NAudio.CoreAudioApi;
using NAudio.Wave;

namespace KAster.Desktop.Softphone.Audio;

/// <summary>
/// 전화가 왔을 때 울린다. 지금까지 이 앱은 <b>소리를 내지 않았다</b> — 화면과 트레이 풍선만
/// 있었고, 상담원이 다른 창을 보고 있으면 전화가 온 것을 몰랐다.
///
/// 벨소리 장치를 따로 고를 수 있게 이미 화면에 만들어 두었는데(설정 · 오디오 탭)
/// 그 값을 쓰는 곳이 없었다. 여기가 그 자리다.
/// </summary>
[SupportedOSPlatform("windows")]
public sealed class RingTonePlayer : IDisposable
{
    /// <summary>벨은 통화가 아니라 스피커로 나가는 소리다. 전화망 대역에 맞출 이유가 없다.</summary>
    private const int SampleRate = 44100;

    private readonly object _gate = new();
    private WasapiOut? _output;

    /// <summary>
    /// 울리기 시작한다. 이미 울리고 있으면 아무 일도 하지 않는다 —
    /// 다시 시작하면 소리가 처음으로 되돌아가 뚝뚝 끊긴다.
    /// </summary>
    public void Start(MMDevice? device, RingTonePattern pattern)
    {
        if (pattern.IsSilent) return;

        lock (_gate)
        {
            if (_output is not null) return;

            try
            {
                var output = new WasapiOut(device, AudioClientShareMode.Shared, useEventSync: true, 100);
                output.Init(new RingToneWaveProvider(pattern, SampleRate));
                output.Play();
                _output = output;
            }
            catch (Exception)
            {
                // 벨이 안 울려도 전화는 받아야 한다. 장치가 빠졌거나 잡혀 있을 수 있다.
                Stop();
            }
        }
    }

    public void Stop()
    {
        lock (_gate)
        {
            var output = _output;
            _output = null;
            if (output is null) return;

            try { output.Stop(); } catch (Exception) { /* 이미 멈췄다 */ }
            output.Dispose();
        }
    }

    public void Dispose() => Stop();
}

/// <summary>
/// 한 주기를 미리 만들어 두고 끝없이 되돌린다. 매번 새로 계산하면 이음매에서 딱 소리가 난다.
/// </summary>
internal sealed class RingToneWaveProvider : IWaveProvider
{
    private readonly float[] _cycle;
    private int _position;

    public RingToneWaveProvider(RingTonePattern pattern, int sampleRate)
    {
        _cycle = RingToneGenerator.Cycle(pattern, sampleRate);
        WaveFormat = WaveFormat.CreateIeeeFloatWaveFormat(sampleRate, 1);
    }

    public WaveFormat WaveFormat { get; }

    public int Read(byte[] buffer, int offset, int count)
    {
        if (_cycle.Length == 0) return 0;

        var samples = count / sizeof(float);
        for (var i = 0; i < samples; i++)
        {
            BitConverter.TryWriteBytes(
                buffer.AsSpan(offset + (i * sizeof(float)), sizeof(float)),
                _cycle[_position]);

            _position = (_position + 1) % _cycle.Length;
        }

        return samples * sizeof(float);
    }
}
