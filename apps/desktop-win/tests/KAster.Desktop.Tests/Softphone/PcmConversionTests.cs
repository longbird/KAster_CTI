using KAster.Desktop.Softphone.Audio;
using NAudio.Wave;
using Xunit;

namespace KAster.Desktop.Tests.Softphone;

public class PcmConversionTests
{
    [Fact]
    public void Converts_16_bit_mono_untouched()
    {
        var format = new WaveFormat(48000, 16, 1);
        var bytes = PcmConversion.FromPcm16(new short[] { 100, -100, 32767 });

        var samples = PcmConversion.ToMonoPcm16(bytes, bytes.Length, format);

        Assert.Equal(new short[] { 100, -100, 32767 }, samples);
    }

    [Fact]
    public void Averages_the_channels_of_a_stereo_buffer()
    {
        var format = new WaveFormat(48000, 16, 2);
        var bytes = PcmConversion.FromPcm16(new short[] { 100, 300, -200, 0 });

        var samples = PcmConversion.ToMonoPcm16(bytes, bytes.Length, format);

        Assert.Equal(new short[] { 200, -100 }, samples);
    }

    [Fact]
    public void Converts_32_bit_float_to_16_bit()
    {
        var format = WaveFormat.CreateIeeeFloatWaveFormat(48000, 1);
        var bytes = new byte[3 * sizeof(float)];
        BitConverter.GetBytes(0.5f).CopyTo(bytes, 0);
        BitConverter.GetBytes(-0.5f).CopyTo(bytes, 4);
        BitConverter.GetBytes(0f).CopyTo(bytes, 8);

        var samples = PcmConversion.ToMonoPcm16(bytes, bytes.Length, format);

        Assert.Equal(3, samples.Length);
        Assert.InRange(samples[0], 16000, 16600);
        Assert.InRange(samples[1], -16600, -16000);
        Assert.Equal(0, samples[2]);
    }

    [Fact]
    public void Clips_a_float_sample_that_runs_past_full_scale()
    {
        var format = WaveFormat.CreateIeeeFloatWaveFormat(48000, 1);
        var bytes = new byte[2 * sizeof(float)];
        BitConverter.GetBytes(2.5f).CopyTo(bytes, 0);
        BitConverter.GetBytes(-2.5f).CopyTo(bytes, 4);

        var samples = PcmConversion.ToMonoPcm16(bytes, bytes.Length, format);

        Assert.Equal(short.MaxValue, samples[0]);
        Assert.Equal(short.MinValue, samples[1]);
    }

    [Fact]
    public void Reads_only_the_bytes_the_device_actually_filled()
    {
        var format = new WaveFormat(48000, 16, 1);
        var bytes = new byte[100];
        PcmConversion.FromPcm16(new short[] { 7, 8 }).CopyTo(bytes, 0);

        var samples = PcmConversion.ToMonoPcm16(bytes, 4, format);

        Assert.Equal(new short[] { 7, 8 }, samples);
    }

    [Fact]
    public void An_empty_buffer_yields_no_samples()
    {
        var format = new WaveFormat(48000, 16, 1);

        Assert.Empty(PcmConversion.ToMonoPcm16(Array.Empty<byte>(), 0, format));
    }
}
