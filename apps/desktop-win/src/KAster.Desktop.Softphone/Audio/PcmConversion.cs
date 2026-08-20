using NAudio.Wave;

namespace KAster.Desktop.Softphone.Audio;

/// <summary>
/// 장치가 주는 버퍼를 전화에 쓰는 모양(모노 16비트 PCM)으로 바꾼다.
/// WASAPI 공유 모드는 보통 32비트 부동소수 스테레오 48kHz 를 주는데, SIP 는 8kHz 모노 알로/뮤로를 쓴다.
/// </summary>
public static class PcmConversion
{
    public static short[] ToMonoPcm16(byte[] buffer, int bytesRecorded, WaveFormat format)
    {
        if (bytesRecorded <= 0) return Array.Empty<short>();

        var channels = Math.Max(1, format.Channels);

        return format.Encoding switch
        {
            WaveFormatEncoding.IeeeFloat when format.BitsPerSample == 32 =>
                FromFloat(buffer, bytesRecorded, channels),
            WaveFormatEncoding.Pcm when format.BitsPerSample == 16 =>
                FromPcm16Buffer(buffer, bytesRecorded, channels),
            WaveFormatEncoding.Extensible when format.BitsPerSample == 32 =>
                FromFloat(buffer, bytesRecorded, channels),
            WaveFormatEncoding.Extensible when format.BitsPerSample == 16 =>
                FromPcm16Buffer(buffer, bytesRecorded, channels),
            _ => throw new NotSupportedException(
                $"지원하지 않는 캡처 형식이다: {format.Encoding} {format.BitsPerSample}bit"),
        };
    }

    public static byte[] FromPcm16(short[] samples)
    {
        var bytes = new byte[samples.Length * sizeof(short)];
        Buffer.BlockCopy(samples, 0, bytes, 0, bytes.Length);
        return bytes;
    }

    private static short[] FromFloat(byte[] buffer, int bytesRecorded, int channels)
    {
        var frames = bytesRecorded / (sizeof(float) * channels);
        var samples = new short[frames];

        for (var frame = 0; frame < frames; frame++)
        {
            double sum = 0;
            for (var channel = 0; channel < channels; channel++)
            {
                sum += BitConverter.ToSingle(buffer, (frame * channels + channel) * sizeof(float));
            }

            samples[frame] = Clamp(sum / channels * short.MaxValue);
        }

        return samples;
    }

    private static short[] FromPcm16Buffer(byte[] buffer, int bytesRecorded, int channels)
    {
        var frames = bytesRecorded / (sizeof(short) * channels);
        var samples = new short[frames];

        for (var frame = 0; frame < frames; frame++)
        {
            var sum = 0;
            for (var channel = 0; channel < channels; channel++)
            {
                sum += BitConverter.ToInt16(buffer, (frame * channels + channel) * sizeof(short));
            }

            samples[frame] = Clamp((double)sum / channels);
        }

        return samples;
    }

    private static short Clamp(double value)
        => value >= short.MaxValue ? short.MaxValue
            : value <= short.MinValue ? short.MinValue
            : (short)Math.Round(value);
}
