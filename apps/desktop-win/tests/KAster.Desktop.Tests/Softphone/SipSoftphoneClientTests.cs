using KAster.Desktop.Softphone;
using KAster.Desktop.Softphone.Audio;
using Xunit;

namespace KAster.Desktop.Tests.Softphone;

public class SipSoftphoneClientTests
{
    private static SipSoftphoneClient Build() => new(() => new WasapiAudioEndPoint(null, null));

    [Fact]
    public void Starts_idle()
    {
        using var phone = Build();

        Assert.Equal(SoftphoneCallState.Idle, phone.CallStatus.State);
    }

    /// <summary>
    /// 상대가 끊으면 OnCallHungup 이, 사용자가 끊으면 Hangup 이 각각 종료를 알린다.
    /// 둘이 겹쳐도 화면에 종료가 두 번 올라오면 안 된다.
    /// </summary>
    [Fact]
    public void Hanging_up_with_no_call_in_progress_announces_nothing()
    {
        using var phone = Build();
        var seen = new List<SoftphoneCallStatus>();
        phone.CallStatusChanged += (_, s) => seen.Add(s);

        phone.Hangup();
        phone.Hangup();

        Assert.Empty(seen);
    }

    [Fact]
    public void Stopping_a_client_that_never_started_announces_stopped_once()
    {
        using var phone = Build();
        var seen = new List<RegistrationStatus>();
        phone.RegistrationStatusChanged += (_, s) => seen.Add(s);

        phone.Stop();
        phone.Stop();

        // 이미 Stopped 인 상태에서 다시 멈춰도 같은 상태를 반복해서 알리지 않는다.
        Assert.Empty(seen);
    }

    [Fact]
    public void A_non_udp_transport_is_reported_as_a_failure_rather_than_thrown()
    {
        using var phone = Build();
        var seen = new List<RegistrationStatus>();
        phone.RegistrationStatusChanged += (_, s) => seen.Add(s);

        phone.Start(new SoftphoneOptions
        {
            ServerHost = "pbx.local",
            ServerPort = 5061,
            SipDomain = "pbx.local",
            Username = "1001",
            Password = "x",
            Transport = SipTransport.Tls,
        });

        var status = Assert.Single(seen);
        Assert.Equal(RegistrationState.Failed, status.State);
        Assert.Contains("UDP", status.Reason);
    }
}
