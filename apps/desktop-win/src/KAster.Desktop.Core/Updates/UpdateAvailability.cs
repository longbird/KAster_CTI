namespace KAster.Desktop.Core.Updates;

/// <summary>
/// 지금 이 PC 가 무엇을 들어야 하는지. <b>순수 함수의 결과다</b> — 화면도 파일도 건드리지 않는다.
///
/// <para>
/// <b><see cref="IsRequired"/> 는 문구와 되풀이 여부만 바꾼다.</b> 강제 릴리스라고 앱을 끄거나
/// 설치를 밀어붙이지 않는다 — 통화 중에 앱이 사라지면 고객 통화가 끊긴다. 낡은 클라이언트로
/// 한 통 더 받는 것보다 끊긴 통화 한 통이 나쁘다. 언제 설치할지는 상담원이 정한다.
/// </para>
/// </summary>
public sealed record UpdateAvailability
{
    public static readonly UpdateAvailability None = new();

    public bool HasUpdate { get; init; }

    /// <summary>센터가 강제로 표시했거나, 센터가 정한 하한보다 낮다.</summary>
    public bool IsRequired { get; init; }

    public string LatestVersion { get; init; } = string.Empty;

    public UpdateArtifact? Artifact { get; init; }

    public string? Notes { get; init; }

    /// <summary>상담원이 읽는 한 줄.</summary>
    public string Headline { get; init; } = string.Empty;

    public static UpdateAvailability For(UpdateManifest? manifest, string? currentVersion)
    {
        if (manifest is null) return None;

        // 서버는 언제나 하나를 싣는다고 하지만, 비어 있으면 받을 파일이 없다 —
        // 없는 파일을 두고 "새 버전이 있다" 고 하면 받기를 눌러도 아무 일이 없다.
        var artifact = manifest.Artifacts.Count > 0 ? manifest.Artifacts[0] : null;
        if (artifact is null) return None;

        if (!AppVersion.IsNewer(manifest.LatestVersion, currentVersion)) return None;

        // 하한을 읽을 수 없으면 필수로 올리지 않는다. 읽지 못한 값으로 상담원을 재촉하면 안 된다.
        var belowMinimum = AppVersion.IsNewer(manifest.MinimumRequiredVersion, currentVersion);
        var required = manifest.Mandatory || belowMinimum;

        return new UpdateAvailability
        {
            HasUpdate = true,
            IsRequired = required,
            LatestVersion = manifest.LatestVersion,
            Artifact = artifact,
            Notes = string.IsNullOrWhiteSpace(manifest.Notes) ? null : manifest.Notes!.Trim(),
            Headline = required
                ? $"필수 업데이트 {manifest.LatestVersion} 이 있습니다"
                : $"새 버전 {manifest.LatestVersion} 이 있습니다",
        };
    }
}
