using System.IO;

namespace KAster.Desktop.App.Services;

/// <summary>사용자별 설정과 토큰이 놓이는 자리.</summary>
public static class AppPaths
{
    public static string Root { get; } = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "KAsterCti");

    public static string Settings => Path.Combine(Root, "settings.json");

    public static string TokenVault => Path.Combine(Root, "tokens.bin");

    public static string AudioDevices => Path.Combine(Root, "audio-devices.json");
}

/// <summary>앱이 붙을 서버. 현장마다 다르므로 파일로 뺀다.</summary>
public sealed record AppSettings
{
    public string ServerBaseUrl { get; init; } = "http://localhost:3000/api/v1/";

    /// <summary>끝에 슬래시가 없으면 상대 경로가 한 단계 잘려 나간다.</summary>
    public Uri BaseUri => new(ServerBaseUrl.EndsWith('/') ? ServerBaseUrl : ServerBaseUrl + "/");
}
