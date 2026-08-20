namespace KAster.Desktop.Softphone.Audio;

/// <summary>
/// 장치가 주는 덩어리와 RTP 패킷의 크기가 다르므로 정해진 샘플 수만큼 잘라 낸다.
/// 남는 꼬리는 다음 덩어리 앞에 붙인다 — 버리면 매 20ms 마다 소리에 구멍이 난다.
/// </summary>
public sealed class AudioPacketizer
{
    private readonly int _samplesPerPacket;
    private readonly List<short> _pending = new();

    public AudioPacketizer(int samplesPerPacket) => _samplesPerPacket = samplesPerPacket;

    /// <summary>마이크 끄기. 회선을 닫는 대신 같은 길이의 무음을 흘린다.</summary>
    public bool IsMuted { get; set; }

    public int PendingSamples => _pending.Count;

    public IReadOnlyList<short[]> Push(short[] samples)
    {
        _pending.AddRange(IsMuted ? new short[samples.Length] : samples);

        var packets = new List<short[]>();
        while (_pending.Count >= _samplesPerPacket)
        {
            packets.Add(_pending.GetRange(0, _samplesPerPacket).ToArray());
            _pending.RemoveRange(0, _samplesPerPacket);
        }

        return packets;
    }

    public void Reset() => _pending.Clear();
}
