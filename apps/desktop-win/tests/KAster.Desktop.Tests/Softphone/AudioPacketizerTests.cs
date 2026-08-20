using KAster.Desktop.Softphone.Audio;
using SIPSorcery.Media;
using SIPSorceryMedia.Abstractions;
using Xunit;

namespace KAster.Desktop.Tests.Softphone;

public class AudioPacketizerTests
{
    private const int SamplesPerPacket = 160; // 8kHz 에서 20ms

    [Fact]
    public void Emits_nothing_until_a_whole_packet_has_arrived()
    {
        var packetizer = new AudioPacketizer(SamplesPerPacket);

        Assert.Empty(packetizer.Push(new short[100]));
        Assert.Equal(100, packetizer.PendingSamples);
    }

    [Fact]
    public void Emits_one_packet_and_keeps_the_tail()
    {
        var packetizer = new AudioPacketizer(SamplesPerPacket);

        var packets = packetizer.Push(new short[200]);

        Assert.Single(packets);
        Assert.Equal(SamplesPerPacket, packets[0].Length);
        Assert.Equal(40, packetizer.PendingSamples);
    }

    [Fact]
    public void Joins_the_tail_to_the_next_chunk_instead_of_dropping_it()
    {
        var packetizer = new AudioPacketizer(4);
        packetizer.Push(new short[] { 1, 2, 3 });

        var packets = packetizer.Push(new short[] { 4, 5 });

        Assert.Equal(new short[] { 1, 2, 3, 4 }, Assert.Single(packets));
        Assert.Equal(1, packetizer.PendingSamples);
    }

    [Fact]
    public void Emits_several_packets_from_one_large_chunk()
    {
        var packetizer = new AudioPacketizer(SamplesPerPacket);

        var packets = packetizer.Push(new short[SamplesPerPacket * 3]);

        Assert.Equal(3, packets.Count);
    }

    [Fact]
    public void Sends_silence_of_the_same_length_while_muted()
    {
        var packetizer = new AudioPacketizer(4) { IsMuted = true };

        var packets = packetizer.Push(new short[] { 900, 900, 900, 900 });

        // 길이가 줄면 상대 쪽 재생이 밀린다. 무음도 같은 분량으로 흘려야 한다.
        Assert.Equal(new short[] { 0, 0, 0, 0 }, Assert.Single(packets));
    }

    [Fact]
    public void Reset_drops_the_tail()
    {
        var packetizer = new AudioPacketizer(SamplesPerPacket);
        packetizer.Push(new short[50]);

        packetizer.Reset();

        Assert.Equal(0, packetizer.PendingSamples);
    }

    /// <summary>
    /// 우리가 고른 코덱 형식이 SIPSorcery 인코더를 실제로 통과하는지 본다.
    /// 형식 ID 를 잘못 넣으면 여기서 걸린다.
    /// </summary>
    [Theory]
    [InlineData(AudioCodecsEnum.PCMA, 8)]
    [InlineData(AudioCodecsEnum.PCMU, 0)]
    public void The_telephony_codecs_round_trip_a_twenty_millisecond_frame(AudioCodecsEnum codec, int formatId)
    {
        var format = new AudioFormat(codec, formatId, 8000, 1, null);
        using var encoder = new AudioEncoder();
        var frame = Enumerable.Range(0, SamplesPerPacket)
            .Select(i => (short)(8000 * Math.Sin(2 * Math.PI * 440 * i / 8000)))
            .ToArray();

        var encoded = encoder.EncodeAudio(frame, format);
        var decoded = encoder.DecodeAudio(encoded, format);

        Assert.Equal(SamplesPerPacket, encoded.Length);
        Assert.Equal(SamplesPerPacket, decoded.Length);
        // 알로/뮤로는 손실 압축이라 값이 조금 달라진다. 파형이 살아 있는지만 본다.
        for (var i = 0; i < frame.Length; i++)
        {
            Assert.InRange(Math.Abs(decoded[i] - frame[i]), 0, 400);
        }
    }
}
