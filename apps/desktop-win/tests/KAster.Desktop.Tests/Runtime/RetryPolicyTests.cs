using KAster.Desktop.Core.Runtime;
using Xunit;

namespace KAster.Desktop.Tests.Runtime;

public class RetryPolicyTests
{
    /// <summary>지터를 가운데(0.5)로 고정하면 계산값이 그대로 나온다.</summary>
    private static RetryPolicy NoJitter() => new(() => 0.5);

    [Fact]
    public void Doubles_the_delay_on_every_failure()
    {
        var policy = NoJitter();

        Assert.Equal(TimeSpan.FromSeconds(1), policy.NextDelay());
        Assert.Equal(TimeSpan.FromSeconds(2), policy.NextDelay());
        Assert.Equal(TimeSpan.FromSeconds(4), policy.NextDelay());
        Assert.Equal(TimeSpan.FromSeconds(8), policy.NextDelay());
    }

    [Fact]
    public void Stops_growing_at_thirty_seconds()
    {
        var policy = NoJitter();
        for (var i = 0; i < 12; i++) policy.NextDelay();

        Assert.Equal(TimeSpan.FromSeconds(30), policy.NextDelay());
    }

    [Fact]
    public void Goes_back_to_one_second_after_a_success()
    {
        var policy = NoJitter();
        policy.NextDelay();
        policy.NextDelay();

        policy.Reset();

        Assert.Equal(TimeSpan.FromSeconds(1), policy.NextDelay());
    }

    [Theory]
    [InlineData(0.0)]
    [InlineData(0.5)]
    [InlineData(1.0)]
    public void Keeps_the_jitter_within_twenty_percent(double random)
    {
        var policy = new RetryPolicy(() => random);
        policy.NextDelay();
        policy.NextDelay();

        // 3회차 계산값은 4초다.
        var delay = policy.NextDelay();

        Assert.InRange(delay.TotalSeconds, 4 * 0.8, 4 * 1.2);
    }

    [Fact]
    public void Jitter_actually_moves_the_delay()
    {
        var low = new RetryPolicy(() => 0.0).NextDelay();
        var high = new RetryPolicy(() => 1.0).NextDelay();

        Assert.True(low < high, "지터가 적용되지 않았다");
        Assert.Equal(0.8, low.TotalSeconds, 3);
        Assert.Equal(1.2, high.TotalSeconds, 3);
    }

    [Fact]
    public void Counts_the_attempts_so_the_ui_can_show_them()
    {
        var policy = NoJitter();

        policy.NextDelay();
        policy.NextDelay();

        Assert.Equal(2, policy.Attempt);
        policy.Reset();
        Assert.Equal(0, policy.Attempt);
    }
}
