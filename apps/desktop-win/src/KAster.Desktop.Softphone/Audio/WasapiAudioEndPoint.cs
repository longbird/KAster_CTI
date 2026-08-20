using System.Runtime.Versioning;
using NAudio.CoreAudioApi;
using NAudio.Wave;
using SIPSorcery.Media;
using SIPSorceryMedia.Abstractions;

namespace KAster.Desktop.Softphone.Audio;

/// <summary>
/// 통화 오디오의 입출력. SIPSorceryMedia.Windows 의 WindowsAudioEndPoint 를 쓰지 않는 이유는
/// 그쪽 캡처가 NAudio WaveInEvent(winmm) 라 <b>에코 제거가 없고 WASAPI 장치 선택도 안 되기 때문</b>이다.
///
/// 여기서는 캡처를 <b>통신용 역할의 WASAPI 장치</b>로 직접 연다. 그래야 OS 의 통화용 오디오 처리
/// (에코 제거·잡음 억제)를 타고, 헤드셋과 스피커를 장치 단위로 고를 수 있다.
///
/// 전화선에 비유하면 이 클래스가 수화기다. 마이크에서 받은 소리를 전화가 알아듣는 8kHz 알로/뮤로로 줄여 보내고,
/// 상대에게서 온 것을 다시 스피커가 아는 형식으로 되돌려 재생한다.
/// </summary>
[SupportedOSPlatform("windows")]
public sealed class WasapiAudioEndPoint : IAudioSource, IAudioSink, IDisposable
{
    /// <summary>전화망 표준 샘플링. PBX 가 alaw/ulaw 만 허용한다.</summary>
    private const int TelephonyRate = 8000;

    /// <summary>패킷 하나가 담는 시간. 20ms 는 SIP 에서 사실상의 표준이다.</summary>
    private const int PacketMilliseconds = 20;

    private const int SamplesPerPacket = TelephonyRate * PacketMilliseconds / 1000;

    private static List<AudioFormat> TelephonyFormats() => new()
    {
        new AudioFormat(AudioCodecsEnum.PCMA, 8, TelephonyRate, 1, null),
        new AudioFormat(AudioCodecsEnum.PCMU, 0, TelephonyRate, 1, null),
    };

    private readonly AudioEncoder _encoder = new();
    private readonly object _gate = new();
    private readonly AudioPacketizer _packetizer = new(SamplesPerPacket);

    private readonly MMDevice? _captureDevice;
    private readonly MMDevice? _renderDevice;

    private WasapiCapture? _capture;
    private WasapiOut? _render;
    private BufferedWaveProvider? _playback;

    private AudioFormat _sourceFormat = TelephonyFormats()[0];
    private AudioFormat _sinkFormat = TelephonyFormats()[0];
    private Func<AudioFormat, bool>? _restriction;
    private bool _sourcePaused;
    private bool _sinkPaused;

    public WasapiAudioEndPoint(MMDevice? captureDevice, MMDevice? renderDevice)
    {
        _captureDevice = captureDevice;
        _renderDevice = renderDevice;
    }

    public event EncodedSampleDelegate? OnAudioSourceEncodedSample;
    public event SourceErrorDelegate? OnAudioSourceError;
    public event SourceErrorDelegate? OnAudioSinkError;

    // 인터페이스가 요구하지만 이 엔드포인트는 인코딩된 샘플만 올린다.
    // 원시 샘플 경로와 프레임 경로는 쓰는 쪽이 없다.
#pragma warning disable CS0067
    public event RawAudioSampleDelegate? OnAudioSourceRawSample;
    public event Action<EncodedAudioFrame>? OnAudioSourceEncodedFrameReady;
#pragma warning restore CS0067

    /// <summary>마이크 끄기. 라인을 닫는 대신 무음을 보낸다 — 통화 자체는 그대로 살아 있어야 한다.</summary>
    public bool IsMuted
    {
        get { lock (_gate) return _packetizer.IsMuted; }
        set { lock (_gate) _packetizer.IsMuted = value; }
    }

    public MediaEndPoints ToMediaEndPoints() => new() { AudioSource = this, AudioSink = this };

    // ---- IAudioSource ----

    public List<AudioFormat> GetAudioSourceFormats() => Filtered();

    public void SetAudioSourceFormat(AudioFormat audioFormat) => _sourceFormat = audioFormat;

    public void RestrictFormats(Func<AudioFormat, bool> filter) => _restriction = filter;

    public bool HasEncodedAudioSubscribers() => OnAudioSourceEncodedSample is not null;

    public bool IsAudioSourcePaused() => _sourcePaused;

    public Task StartAudio()
    {
        lock (_gate)
        {
            if (_capture is not null || _captureDevice is null) return Task.CompletedTask;

            var capture = new WasapiCapture(_captureDevice, useEventSync: true, PacketMilliseconds);
            capture.DataAvailable += OnCaptured;
            capture.RecordingStopped += (_, e) =>
            {
                if (e.Exception is not null) OnAudioSourceError?.Invoke(e.Exception.Message);
            };

            _capture = capture;
            capture.StartRecording();
        }

        return Task.CompletedTask;
    }

    public Task PauseAudio()
    {
        _sourcePaused = true;
        return Task.CompletedTask;
    }

    public Task ResumeAudio()
    {
        _sourcePaused = false;
        return Task.CompletedTask;
    }

    public Task CloseAudio()
    {
        lock (_gate)
        {
            _capture?.StopRecording();
            _capture?.Dispose();
            _capture = null;
            _packetizer.Reset();
        }

        return Task.CompletedTask;
    }

    public void ExternalAudioSourceRawSample(
        AudioSamplingRatesEnum samplingRate,
        uint durationMilliseconds,
        short[] sample)
    {
        // 이 엔드포인트는 마이크에서만 소리를 얻는다. 외부 주입 경로는 쓰지 않는다.
    }

    // ---- IAudioSink ----

    public List<AudioFormat> GetAudioSinkFormats() => Filtered();

    public void SetAudioSinkFormat(AudioFormat audioFormat) => _sinkFormat = audioFormat;

    public Task StartAudioSink()
    {
        lock (_gate)
        {
            if (_render is not null || _renderDevice is null) return Task.CompletedTask;

            var playback = new BufferedWaveProvider(new WaveFormat(TelephonyRate, 16, 1))
            {
                BufferDuration = TimeSpan.FromMilliseconds(500),
                // 네트워크가 튀어 밀린 오디오는 버린다. 쌓아두면 지연만 커진다.
                DiscardOnBufferOverflow = true,
            };

            var render = new WasapiOut(_renderDevice, AudioClientShareMode.Shared, useEventSync: true, 60);
            render.Init(playback);
            render.Play();

            _playback = playback;
            _render = render;
        }

        return Task.CompletedTask;
    }

    public Task PauseAudioSink()
    {
        _sinkPaused = true;
        return Task.CompletedTask;
    }

    public Task ResumeAudioSink()
    {
        _sinkPaused = false;
        return Task.CompletedTask;
    }

    public Task CloseAudioSink()
    {
        lock (_gate)
        {
            _render?.Stop();
            _render?.Dispose();
            _render = null;
            _playback = null;
        }

        return Task.CompletedTask;
    }

    public void GotAudioRtp(
        System.Net.IPEndPoint remoteEndPoint,
        uint ssrc,
        uint seqnum,
        uint timestamp,
        int payloadID,
        bool marker,
        byte[] payload)
        => Play(payload, _sinkFormat);

    public void GotEncodedMediaFrame(EncodedAudioFrame frame)
        => Play(frame.EncodedAudio, frame.AudioFormat);

    // ---- 내부 ----

    private List<AudioFormat> Filtered()
    {
        var formats = TelephonyFormats();
        return _restriction is null ? formats : formats.Where(_restriction).ToList();
    }

    private void OnCaptured(object? sender, WaveInEventArgs args)
    {
        if (_sourcePaused || OnAudioSourceEncodedSample is null) return;

        try
        {
            var capture = _capture;
            if (capture is null) return;

            var mono = PcmConversion.ToMonoPcm16(args.Buffer, args.BytesRecorded, capture.WaveFormat);
            var narrow = capture.WaveFormat.SampleRate == TelephonyRate
                ? mono
                : PcmResampler.Resample(mono, capture.WaveFormat.SampleRate, TelephonyRate);

            EmitPackets(narrow);
        }
        catch (Exception ex)
        {
            OnAudioSourceError?.Invoke(ex.Message);
        }
    }

    /// <summary>장치가 주는 덩어리 크기와 RTP 패킷 크기가 다르므로 20ms 씩 잘라 보낸다.</summary>
    private void EmitPackets(short[] samples)
    {
        List<byte[]> packets;

        lock (_gate)
        {
            packets = _packetizer.Push(samples)
                .Select(frame => _encoder.EncodeAudio(frame, _sourceFormat))
                .ToList();
        }

        foreach (var packet in packets)
        {
            OnAudioSourceEncodedSample?.Invoke(SamplesPerPacket, packet);
        }
    }

    private void Play(byte[] payload, AudioFormat format)
    {
        if (_sinkPaused) return;

        try
        {
            var decoded = _encoder.DecodeAudio(payload, format);
            if (decoded.Length == 0) return;

            var bytes = PcmConversion.FromPcm16(decoded);

            lock (_gate)
            {
                _playback?.AddSamples(bytes, 0, bytes.Length);
            }
        }
        catch (Exception ex)
        {
            OnAudioSinkError?.Invoke(ex.Message);
        }
    }

    public void Dispose()
    {
        CloseAudio().GetAwaiter().GetResult();
        CloseAudioSink().GetAwaiter().GetResult();
        _encoder.Dispose();
        _captureDevice?.Dispose();
        _renderDevice?.Dispose();
    }
}
