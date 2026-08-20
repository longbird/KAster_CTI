using KAster.Desktop.Core.Contracts;
using KAster.Desktop.Softphone;
using Xunit;

namespace KAster.Desktop.Tests.Softphone;

public class SoftphoneOptionsTests
{
    private static SoftphoneConfig Config(
        bool enabled = true,
        string? sipUri = "sip:1001@pbx.local",
        string? sipServer = "pbx.local:48950",
        string transport = "udp") => new()
        {
            Enabled = enabled,
            SipUri = sipUri,
            SipServer = sipServer,
            Transport = transport,
            AuthorizationUsername = "1001",
            AuthorizationPassword = "s3cret",
            DisplayName = "김상담",
        };

    [Fact]
    public void Builds_options_from_the_server_softphone_config()
    {
        Assert.True(SoftphoneOptions.TryCreate(Config(), out var options, out var reason));

        Assert.Null(reason);
        Assert.Equal("pbx.local", options!.ServerHost);
        Assert.Equal(48950, options.ServerPort);
        Assert.Equal("pbx.local", options.SipDomain);
        Assert.Equal("1001", options.Username);
        Assert.Equal("s3cret", options.Password);
        Assert.Equal("김상담", options.DisplayName);
        Assert.Equal(SipTransport.Udp, options.Transport);
    }

    [Fact]
    public void Rejects_a_config_with_no_sip_server()
    {
        Assert.False(SoftphoneOptions.TryCreate(Config(sipServer: null), out var options, out var reason));

        Assert.Null(options);
        Assert.Contains("주소", reason);
    }

    [Fact]
    public void Defaults_the_port_to_5060_when_the_server_omits_it()
    {
        Assert.True(SoftphoneOptions.TryCreate(Config(sipServer: "pbx.local"), out var options, out _));

        Assert.Equal(5060, options!.ServerPort);
    }

    [Fact]
    public void Reports_disabled_when_the_server_says_softphone_is_off()
    {
        Assert.False(SoftphoneOptions.TryCreate(Config(enabled: false), out var options, out var reason));

        Assert.Null(options);
        Assert.Contains("사용 안 함", reason);
    }

    [Fact]
    public void Reports_disabled_when_there_is_no_config_at_all()
    {
        Assert.False(SoftphoneOptions.TryCreate(null, out _, out var reason));

        Assert.NotNull(reason);
    }

    [Fact]
    public void Rejects_a_config_with_no_credential()
    {
        var config = Config() with { AuthorizationPassword = null };

        Assert.False(SoftphoneOptions.TryCreate(config, out _, out var reason));

        Assert.Contains("비밀번호", reason);
    }

    [Fact]
    public void Falls_back_to_the_server_host_when_the_sip_uri_has_no_domain()
    {
        Assert.True(SoftphoneOptions.TryCreate(Config(sipUri: null), out var options, out _));

        Assert.Equal("pbx.local", options!.SipDomain);
        Assert.Equal("1001", options.Username);
    }

    [Fact]
    public void Reads_the_tls_transport_when_the_server_asks_for_it()
    {
        Assert.True(SoftphoneOptions.TryCreate(Config(transport: "tls"), out var options, out _));

        Assert.Equal(SipTransport.Tls, options!.Transport);
    }

    [Fact]
    public void Ignores_a_bracketed_ipv6_host_port_that_is_not_a_number()
    {
        Assert.True(SoftphoneOptions.TryCreate(Config(sipServer: "pbx.local:not-a-port"), out var options, out _));

        Assert.Equal("pbx.local", options!.ServerHost);
        Assert.Equal(5060, options.ServerPort);
    }
}
