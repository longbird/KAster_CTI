namespace KAster.Desktop.Softphone.Audio;

/// <summary>
/// 벨소리 종류. 음원 파일이 아니라 만들어 내는 패턴이라 배포에 얹을 것이 없다.
/// </summary>
public enum RingTonePreset
{
    Classic,
    Soft,
    Urgent,

    /// <summary>울리지 않는다. 화면과 트레이 알림만 남는다.</summary>
    Silent,
}

/// <summary>
/// 벨 한 주기. 울리는 구간과 쉬는 구간을 합친 것이며, 이 주기를 이어 붙이면 계속 울린다.
///
/// 쉬는 구간이 없으면 소리가 끊기지 않아 벨이 아니라 경보음이 된다.
/// </summary>
public sealed record RingTonePattern(
    IReadOnlyList<int> Frequencies,
    int OnMilliseconds,
    int OffMilliseconds,
    double Amplitude)
{
    public bool IsSilent => Frequencies.Count == 0 || Amplitude <= 0;

    /// <summary>
    /// 음은 전화 벨 대역(300~2000Hz)에 둔다. 너무 낮으면 작은 스피커에서 안 들리고
    /// 너무 높으면 귀에 거슬린다. 두 음을 겹쳐야 전자음이 아니라 벨처럼 들린다.
    /// </summary>
    public static RingTonePattern For(RingTonePreset preset) => preset switch
    {
        RingTonePreset.Soft => new(new[] { 440, 554 }, OnMilliseconds: 800, OffMilliseconds: 2400, Amplitude: 0.18),
        RingTonePreset.Urgent => new(new[] { 660, 880 }, OnMilliseconds: 400, OffMilliseconds: 300, Amplitude: 0.35),
        RingTonePreset.Silent => new(Array.Empty<int>(), OnMilliseconds: 0, OffMilliseconds: 1000, Amplitude: 0),
        _ => new(new[] { 440, 480 }, OnMilliseconds: 1000, OffMilliseconds: 2000, Amplitude: 0.25),
    };
}

public static class RingToneGenerator
{
    /// <summary>
    /// 한 주기를 만든다. 이어 붙이면 끊김 없이 계속 울린다 — 매번 처음부터 만들면
    /// 이음매에서 딱 소리가 난다.
    /// </summary>
    public static float[] Cycle(RingTonePattern pattern, int sampleRate)
    {
        var onSamples = sampleRate * pattern.OnMilliseconds / 1000;
        var offSamples = sampleRate * pattern.OffMilliseconds / 1000;
        var buffer = new float[onSamples + offSamples];

        if (pattern.IsSilent) return buffer;

        // 여러 음을 겹치므로 개수로 나눠 둔다. 안 나누면 합이 1 을 넘어 잘린 소리가 난다.
        var perTone = pattern.Amplitude / pattern.Frequencies.Count;

        for (var i = 0; i < onSamples; i++)
        {
            var seconds = (double)i / sampleRate;
            double sum = 0;
            foreach (var hz in pattern.Frequencies)
            {
                sum += Math.Sin(2 * Math.PI * hz * seconds) * perTone;
            }

            buffer[i] = (float)(sum * Fade(i, onSamples, sampleRate));
        }

        return buffer;
    }

    /// <summary>
    /// 시작과 끝을 짧게 눕힌다. 갑자기 켜고 끄면 스피커에서 딱 소리가 난다.
    /// </summary>
    private static double Fade(int index, int total, int sampleRate)
    {
        var edge = Math.Max(1, sampleRate / 200); // 5ms
        if (index < edge) return (double)index / edge;
        if (index > total - edge) return Math.Max(0, (double)(total - index) / edge);
        return 1;
    }
}
