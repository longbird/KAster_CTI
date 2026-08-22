using KAster.Desktop.Core.Updates;

namespace KAster.Desktop.Tests.Updates;

public class UpdateAvailabilityTests
{
    private static UpdateManifest Manifest(
        string latest = "1.4.0",
        bool mandatory = false,
        string? minimumRequired = null,
        string? notes = "고객 정보 표시 수정")
        => new()
        {
            LatestVersion = latest,
            Mandatory = mandatory,
            MinimumRequiredVersion = minimumRequired,
            Notes = notes,
            Artifacts = new[]
            {
                new UpdateArtifact
                {
                    ArtifactId = "agent-win-x64-1.4.0",
                    Version = latest,
                    FileName = "KAsterAgent-1.4.0.exe",
                    Size = 40_000_000,
                    Sha256 = "abc",
                },
            },
        };

    [Fact]
    public void Nothing_to_say_when_the_server_has_no_approved_release()
    {
        Assert.False(UpdateAvailability.For(null, "1.3.0").HasUpdate);
    }

    [Fact]
    public void Nothing_to_say_when_we_already_run_the_latest()
    {
        Assert.False(UpdateAvailability.For(Manifest("1.4.0"), "1.4.0").HasUpdate);
    }

    /// <summary>운영에서 되돌린 릴리스를 우리가 앞질러 있을 수 있다. 내려가라고 하지 않는다.</summary>
    [Fact]
    public void Nothing_to_say_when_we_are_ahead()
    {
        Assert.False(UpdateAvailability.For(Manifest("1.3.0"), "1.4.0").HasUpdate);
    }

    /// <summary>파일이 안 실려 온 manifest 로 다운로드를 시작하면 받을 것이 없다.</summary>
    [Fact]
    public void Nothing_to_say_when_the_release_carries_no_file()
    {
        var empty = Manifest() with { Artifacts = Array.Empty<UpdateArtifact>() };

        Assert.False(UpdateAvailability.For(empty, "1.3.0").HasUpdate);
    }

    [Fact]
    public void A_newer_release_is_offered_with_its_file()
    {
        var found = UpdateAvailability.For(Manifest("1.4.0"), "1.3.0");

        Assert.True(found.HasUpdate);
        Assert.False(found.IsRequired);
        Assert.Equal("1.4.0", found.LatestVersion);
        Assert.Equal("agent-win-x64-1.4.0", found.Artifact!.ArtifactId);
        Assert.Contains("1.4.0", found.Headline);
    }

    /// <summary>
    /// 강제 표시는 <b>문구와 되풀이 여부만</b> 바꾼다. 통화 중인 앱을 끄는 근거가 아니다 —
    /// 고객 통화가 끊기는 것이 낡은 클라이언트로 한 통 더 받는 것보다 나쁘다.
    /// </summary>
    [Fact]
    public void A_mandatory_release_is_marked_required_but_still_only_a_message()
    {
        var found = UpdateAvailability.For(Manifest(mandatory: true), "1.3.0");

        Assert.True(found.IsRequired);
        Assert.Contains("필수", found.Headline);
    }

    /// <summary>센터가 정한 하한보다 낮으면 강제 표시가 없어도 필수다.</summary>
    [Fact]
    public void Falling_below_the_minimum_is_required_too()
    {
        var found = UpdateAvailability.For(Manifest(minimumRequired: "1.3.5"), "1.3.0");

        Assert.True(found.IsRequired);
    }

    /// <summary>하한을 이미 넘겼으면 새 버전이 있어도 필수가 아니다.</summary>
    [Fact]
    public void Meeting_the_minimum_leaves_it_optional()
    {
        var found = UpdateAvailability.For(Manifest(minimumRequired: "1.3.0"), "1.3.5");

        Assert.True(found.HasUpdate);
        Assert.False(found.IsRequired);
    }

    /// <summary>하한을 읽을 수 없으면 필수로 올리지 않는다. 읽지 못한 값으로 상담원을 재촉하면 안 된다.</summary>
    [Fact]
    public void An_unreadable_minimum_does_not_force_anything()
    {
        var found = UpdateAvailability.For(Manifest(minimumRequired: "알수없음"), "1.3.0");

        Assert.True(found.HasUpdate);
        Assert.False(found.IsRequired);
    }
}
