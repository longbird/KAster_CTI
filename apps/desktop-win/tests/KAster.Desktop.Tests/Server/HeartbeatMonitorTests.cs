using KAster.Desktop.Core.Server;
using Xunit;

namespace KAster.Desktop.Tests.Server;

public class HeartbeatMonitorTests
{
    private static readonly DateTimeOffset T0 = new(2026, 8, 21, 6, 0, 0, TimeSpan.Zero);

    [Fact]
    public void A_fresh_monitor_is_not_stale()
    {
        var monitor = new HeartbeatMonitor(TimeSpan.FromSeconds(45));
        monitor.Beat(T0);

        Assert.False(monitor.IsStale(T0.AddSeconds(44)));
    }

    [Fact]
    public void Goes_stale_once_the_timeout_passes_without_a_beat()
    {
        var monitor = new HeartbeatMonitor(TimeSpan.FromSeconds(45));
        monitor.Beat(T0);

        Assert.True(monitor.IsStale(T0.AddSeconds(46)));
    }

    [Fact]
    public void A_beat_pushes_the_deadline_out()
    {
        var monitor = new HeartbeatMonitor(TimeSpan.FromSeconds(45));
        monitor.Beat(T0);
        monitor.Beat(T0.AddSeconds(40));

        Assert.False(monitor.IsStale(T0.AddSeconds(80)));
        Assert.True(monitor.IsStale(T0.AddSeconds(86)));
    }

    [Fact]
    public void A_monitor_that_never_beat_is_not_stale_yet()
    {
        // 아직 붙지도 않았는데 끊겼다고 보고하면 안 된다.
        var monitor = new HeartbeatMonitor(TimeSpan.FromSeconds(45));

        Assert.False(monitor.IsStale(T0.AddYears(1)));
    }

    [Fact]
    public void Stopping_clears_the_deadline()
    {
        var monitor = new HeartbeatMonitor(TimeSpan.FromSeconds(45));
        monitor.Beat(T0);

        monitor.Stop();

        Assert.False(monitor.IsStale(T0.AddSeconds(600)));
    }
}
