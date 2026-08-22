namespace KAster.Desktop.Core.Updates;

/// <summary>
/// 업데이트 경로에서 난 실패. 서버가 준 봉투 오류(<see cref="Server.CtiServerException"/>)와 달리
/// <b>우리가 판정한</b> 실패다 — 지문 불일치, 엉뚱한 곳을 가리키는 다운로드 주소.
/// </summary>
public sealed class UpdateException : Exception
{
    public UpdateException(string message) : base(message)
    {
    }
}

/// <summary>서버 감사 로그에 남길 사건 이름. 자유 문자열이라 우리가 정한다.</summary>
public static class UpdateEvents
{
    /// <summary>지금 버전보다 새 릴리스가 승인돼 있는 것을 확인했다.</summary>
    public const string UpdateAvailable = "update-available";

    /// <summary>상담원이 받기를 눌렀다.</summary>
    public const string DownloadStarted = "download-started";

    /// <summary>파일을 받아 지문까지 맞췄다. <b>설치했다는 뜻이 아니다.</b></summary>
    public const string DownloadVerified = "download-verified";

    /// <summary>
    /// <b>우리가 받기를 거부했다</b> — 지문이 다르거나, 받을 수 없는 주소였다.
    /// 파일은 남기지 않았다. 서버가 거부한 <see cref="DownloadFailed"/> 와 구분한다:
    /// 이쪽이 나면 배포된 파일 자체를 의심해야 한다.
    /// </summary>
    public const string DownloadRejected = "download-rejected";

    /// <summary>받는 도중 끊겼거나 서버가 거부했다.</summary>
    public const string DownloadFailed = "download-failed";
}

public sealed record UpdateArtifact
{
    public string ArtifactId { get; init; } = string.Empty;
    public string Version { get; init; } = string.Empty;
    public string FileName { get; init; } = string.Empty;
    public long Size { get; init; }

    /// <summary>받은 파일이 우리가 요청한 그 파일인지 가르는 유일한 근거다.</summary>
    public string Sha256 { get; init; } = string.Empty;
}

public sealed record ServerCompatibility
{
    public string? MinimumServerVersion { get; init; }
    public string? MaximumServerVersion { get; init; }
}

public sealed record UpdateManifest
{
    public string? CenterId { get; init; }
    public string Channel { get; init; } = "stable";
    public string? CurrentVersion { get; init; }
    public string LatestVersion { get; init; } = string.Empty;

    /// <summary>센터가 이 릴리스를 강제로 표시했다. <b>문구만 바꾼다</b> — 아래 주석 참조.</summary>
    public bool Mandatory { get; init; }

    public string? MinimumRequiredVersion { get; init; }
    public ServerCompatibility? ServerCompatibility { get; init; }

    /// <summary>서버는 항상 정확히 하나를 싣지만, 비어 온 경우에 터지지 않아야 한다.</summary>
    public IReadOnlyList<UpdateArtifact> Artifacts { get; init; } = Array.Empty<UpdateArtifact>();

    public string? Notes { get; init; }
}

/// <summary>다운로드 1회분. <see cref="DownloadToken"/> 은 120초 <b>1회용</b>이다.</summary>
public sealed record DownloadTicket
{
    public string ArtifactId { get; init; } = string.Empty;
    public string Version { get; init; } = string.Empty;

    /// <summary>서버가 <c>api/v1</c> 없이 준다. 그대로 쓰면 안 된다.</summary>
    public string? DownloadUrl { get; init; }

    public string DownloadToken { get; init; } = string.Empty;
    public string Sha256 { get; init; } = string.Empty;
}

/// <summary>서버 감사 로그에 남길 한 건.</summary>
public sealed record UpdateReport
{
    public required string EventType { get; init; }
    public string? CurrentAppVersion { get; init; }
    public string? TargetVersion { get; init; }
    public string? ArtifactId { get; init; }
    public IReadOnlyDictionary<string, object>? Metadata { get; init; }
}
