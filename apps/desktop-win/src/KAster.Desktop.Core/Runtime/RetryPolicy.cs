namespace KAster.Desktop.Core.Runtime;

/// <summary>
/// 재연결 대기 시간. 1초에서 시작해 실패할 때마다 두 배로 늘리고 30초에서 멈춘다.
///
/// 지터를 섞는 이유는, 상담원 50명이 같은 순간에 연결이 끊기면 전원이 정확히 같은 시각에
/// 다시 붙으려 해서 서버가 두 번째 타격을 받기 때문이다. ±20% 로 흩뿌린다.
/// </summary>
public sealed class RetryPolicy
{
    private static readonly TimeSpan BaseDelay = TimeSpan.FromSeconds(1);
    private static readonly TimeSpan MaxDelay = TimeSpan.FromSeconds(30);
    private const double JitterRatio = 0.2;

    private readonly Func<double> _random;
    private int _attempt;

    /// <param name="random">0 이상 1 이하를 돌려주는 난수원. 테스트에서 고정할 수 있게 주입받는다.</param>
    public RetryPolicy(Func<double> random) => _random = random;

    public RetryPolicy() : this(Random.Shared.NextDouble)
    {
    }

    public int Attempt => _attempt;

    public TimeSpan NextDelay()
    {
        var exponent = Math.Min(_attempt, 30);
        var seconds = Math.Min(BaseDelay.TotalSeconds * Math.Pow(2, exponent), MaxDelay.TotalSeconds);
        _attempt++;

        // _random 이 0 이면 -20%, 1 이면 +20%.
        var factor = 1 - JitterRatio + (2 * JitterRatio * Math.Clamp(_random(), 0, 1));
        return TimeSpan.FromSeconds(seconds * factor);
    }

    public void Reset() => _attempt = 0;
}
