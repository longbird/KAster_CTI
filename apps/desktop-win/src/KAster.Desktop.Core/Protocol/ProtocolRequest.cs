namespace KAster.Desktop.Core.Protocol;

/// <summary>
/// 웹에서 넘어온 <c>kastercti://connect?...</c> 한 건. <b>순수 파싱이다</b> — 서버도 창도 건드리지 않는다.
///
/// <para>
/// <b>이 주소는 외부 입력이다.</b> 브라우저 주소창에 아무나 칠 수 있고, 악성 웹페이지가 링크나
/// 숨은 iframe 으로 걸 수도 있다. 그래서 "거를 것" 이 아니라 <b>"통과시킬 것"</b> 을 적는다 —
/// 스킴 두 개, 길 하나, 토큰 모양 하나, http/https 주소 하나.
/// </para>
/// </summary>
public sealed record ProtocolRequest
{
    /// <summary>
    /// 설계 문서가 적은 스킴은 <c>kastercti</c> 인데, 지금 웹앱이 실제로 내보내는 것은
    /// <c>kaster-agent</c> 다 (<c>apps/web/src/utils/desktopBridge.ts</c>).
    /// 한쪽만 받으면 웹에서 넘긴 세션이 이 클라이언트에 영영 도착하지 않는다.
    /// </summary>
    public static readonly IReadOnlyList<string> Schemes = new[] { "kastercti", "kaster-agent" };

    /// <summary>서버가 만드는 토큰은 16진수 48자다. 넉넉히 잡되 무한정 받지는 않는다.</summary>
    private const int MaxTokenLength = 256;

    /// <summary>
    /// 페이로드가 적어 보낸 서버. <b>이 값으로 접속하지 않는다</b> —
    /// <see cref="TargetsSameServer"/> 로 이 PC 에 설정된 서버와 같은지 확인하는 데만 쓴다.
    /// </summary>
    public string? ServerUrl { get; init; }

    /// <summary>60초 1회용. 로그에 남기지 않는다.</summary>
    public required string HandoffToken { get; init; }

    public string? Channel { get; init; }

    /// <summary>
    /// <b>이 검사가 이 파일의 핵심이다.</b> 페이로드의 주소를 그대로 믿고 접속하면,
    /// 악성 페이지가 자기 서버를 적어 보내 우리 앱이 그쪽에 핸드오프 토큰을 넘기고,
    /// 그쪽이 준 SIP 설정으로 전화기를 등록하게 된다. 그때부터 모든 통화가 남의 센터를 지난다.
    ///
    /// 주소를 안 적어 보냈으면 이 PC 의 서버를 쓰겠다는 뜻이므로 통과다.
    /// </summary>
    public bool TargetsSameServer(Uri configured)
    {
        if (string.IsNullOrEmpty(ServerUrl)) return true;
        if (!Uri.TryCreate(ServerUrl, UriKind.Absolute, out var named)) return false;

        return string.Equals(named.Scheme, configured.Scheme, StringComparison.OrdinalIgnoreCase)
            && string.Equals(named.Host, configured.Host, StringComparison.OrdinalIgnoreCase)
            && named.Port == configured.Port;
    }

    public static bool TryParse(string? raw, out ProtocolRequest? request, out string? error)
    {
        request = null;
        error = null;

        var trimmed = raw?.Trim();
        if (string.IsNullOrEmpty(trimmed))
        {
            error = "빈 요청이다";
            return false;
        }

        if (!Uri.TryCreate(trimmed, UriKind.Absolute, out var url))
        {
            error = "주소 형식이 아니다";
            return false;
        }

        if (!Schemes.Contains(url.Scheme, StringComparer.OrdinalIgnoreCase))
        {
            error = $"이 앱이 받는 요청이 아니다 ({url.Scheme})";
            return false;
        }

        // 스킴 뒤가 host 로 잡힐 때도 path 로 잡힐 때도 있다. 둘 다 같은 길로 읽는다.
        var route = (string.IsNullOrEmpty(url.Host) ? url.AbsolutePath.TrimStart('/') : url.Host).Trim();
        if (!string.Equals(route, "connect", StringComparison.OrdinalIgnoreCase))
        {
            error = route.Length == 0 ? "무엇을 하라는 요청인지 없다" : $"모르는 요청이다 ({route})";
            return false;
        }

        var query = System.Web.HttpUtility.ParseQueryString(url.Query);

        var token = query["handoffToken"]?.Trim();
        if (string.IsNullOrEmpty(token))
        {
            error = "로그인 토큰이 없다";
            return false;
        }

        if (!IsTokenShaped(token))
        {
            error = "로그인 토큰의 모양이 아니다";
            return false;
        }

        var server = query["serverUrl"]?.Trim();
        if (!string.IsNullOrEmpty(server) && !TryReadServer(server, out server))
        {
            error = "서버 주소가 http 또는 https 가 아니다";
            return false;
        }

        var channel = query["channel"]?.Trim();

        request = new ProtocolRequest
        {
            ServerUrl = string.IsNullOrEmpty(server) ? null : server,
            HandoffToken = token,
            Channel = string.IsNullOrEmpty(channel) ? null : channel,
        };

        return true;
    }

    /// <summary>
    /// 서버가 만든 토큰은 16진수다. 그 모양이 아닌 것을 그대로 서버로 넘기면 우리가 남의 입력을
    /// 전달하는 통로가 된다. 뒷날 토큰 형식이 바뀔 것을 대비해 URL 에 안전한 글자까지만 열어 둔다.
    /// </summary>
    private static bool IsTokenShaped(string token)
        => token.Length <= MaxTokenLength
            && token.All(c => char.IsAsciiLetterOrDigit(c) || c is '-' or '_' or '.' or '~');

    /// <summary>끝 슬래시를 떼어 뒀다 비교에 쓴다. 붙어 있고 없고로 다른 서버가 되면 안 된다.</summary>
    private static bool TryReadServer(string given, out string? normalized)
    {
        normalized = null;

        if (!Uri.TryCreate(given, UriKind.Absolute, out var url)) return false;
        if (url.Scheme is not ("http" or "https")) return false;

        normalized = given.TrimEnd('/');
        return true;
    }
}
