using KAster.Desktop.Core.Contracts;

namespace KAster.Desktop.Softphone;

public enum SipTransport
{
    Udp,
    Tls,
}

/// <summary>
/// 서버가 내려준 설정에서 뽑아낸 SIP 등록 정보. 순수 값이라 라이브러리 없이 테스트한다.
/// </summary>
public sealed record SoftphoneOptions
{
    public required string ServerHost { get; init; }
    public required int ServerPort { get; init; }
    public required string SipDomain { get; init; }
    public required string Username { get; init; }
    public required string Password { get; init; }
    public string DisplayName { get; init; } = string.Empty;
    public SipTransport Transport { get; init; } = SipTransport.Udp;

    /// <summary>등록 갱신 주기(초). PBX 기본값과 맞춘다.</summary>
    public int ExpirySeconds { get; init; } = 120;

    private const int DefaultSipPort = 5060;

    /// <summary>
    /// 설정을 검사해 등록에 필요한 값이 다 있으면 옵션을 만든다.
    /// 못 만들면 예외 대신 이유를 돌려준다 — 소프트폰이 안 뜬다고 앱이 죽으면 안 된다.
    /// </summary>
    public static bool TryCreate(SoftphoneConfig? config, out SoftphoneOptions? options, out string? reason)
    {
        options = null;
        reason = null;

        if (config is null || !config.Enabled)
        {
            reason = "서버 설정이 소프트폰을 사용 안 함으로 두었다";
            return false;
        }

        var (host, port) = SplitHostPort(config.SipServer);
        if (host is null)
        {
            reason = "서버가 SIP 주소(sipServer)를 내려주지 않았다";
            return false;
        }

        var username = config.AuthorizationUsername?.Trim() ?? UserOf(config.SipUri);
        if (string.IsNullOrEmpty(username))
        {
            reason = "SIP 계정(내선)을 알 수 없다";
            return false;
        }

        var password = config.AuthorizationPassword?.Trim();
        if (string.IsNullOrEmpty(password))
        {
            reason = "SIP 비밀번호가 없다";
            return false;
        }

        options = new SoftphoneOptions
        {
            ServerHost = host,
            ServerPort = port,
            SipDomain = DomainOf(config.SipUri) ?? host,
            Username = username,
            Password = password,
            DisplayName = config.DisplayName,
            Transport = string.Equals(config.Transport, "tls", StringComparison.OrdinalIgnoreCase)
                ? SipTransport.Tls
                : SipTransport.Udp,
        };
        return true;
    }

    private static (string? Host, int Port) SplitHostPort(string? value)
    {
        var trimmed = value?.Trim();
        if (string.IsNullOrEmpty(trimmed)) return (null, DefaultSipPort);

        var separator = trimmed.LastIndexOf(':');
        if (separator <= 0) return (trimmed, DefaultSipPort);

        var host = trimmed[..separator];
        // 포트 자리에 숫자가 아닌 게 오면 기본 포트로 간다. 잘못된 설정 하나로 등록이 막히면 안 된다.
        return int.TryParse(trimmed[(separator + 1)..], out var port) && port is > 0 and <= 65535
            ? (host, port)
            : (host, DefaultSipPort);
    }

    private static string? UserOf(string? sipUri) => SplitSipUri(sipUri).User;

    private static string? DomainOf(string? sipUri) => SplitSipUri(sipUri).Domain;

    /// <summary><c>sip:1001@pbx.local</c> 을 계정과 도메인으로 쪼갠다.</summary>
    private static (string? User, string? Domain) SplitSipUri(string? sipUri)
    {
        if (string.IsNullOrWhiteSpace(sipUri)) return (null, null);

        var withoutScheme = sipUri.Contains(':') ? sipUri[(sipUri.IndexOf(':') + 1)..] : sipUri;
        var at = withoutScheme.IndexOf('@');
        if (at <= 0) return (null, null);

        var domain = withoutScheme[(at + 1)..];
        var portAt = domain.IndexOf(':');
        if (portAt > 0) domain = domain[..portAt];

        return (withoutScheme[..at], domain);
    }
}
