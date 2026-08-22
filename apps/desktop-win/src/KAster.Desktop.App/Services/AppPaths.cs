using System;
using System.IO;

namespace KAster.Desktop.App.Services;

/// <summary>사용자별 설정과 토큰이 놓이는 자리.</summary>
public static class AppPaths
{
    /// <summary>
    /// 한 PC 에서 상담원을 둘 이상 띄울 때 자리를 나누는 이름.
    ///
    /// 나누지 않으면 두 앱이 같은 <c>tokens.bin</c> 을 쓴다. 토큰은 요청마다 파일에서
    /// 읽으므로, 뒤에 로그인한 쪽이 앞선 토큰을 덮어쓰면 앞의 앱이 남의 계정으로
    /// 요청을 보내기 시작한다. 로그인 화면에 채워 두는 아이디·내선도 같은 파일이라
    /// 서로 지운다.
    /// </summary>
    public const string ProfileVariable = "KASTER_DESKTOP_PROFILE";

    public static string Root { get; } = ResolveRoot(
        Environment.GetEnvironmentVariable(ProfileVariable),
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData));

    /// <summary>
    /// 프로필 이름은 사람이 명령줄에 적는 값이라 경로 조각이 섞여 들어올 수 있다.
    /// 그대로 이으면 설정과 토큰이 엉뚱한 디렉터리에 놓인다.
    /// </summary>
    public static string ResolveRoot(string? profile, string localAppData)
    {
        var baseRoot = Path.Combine(localAppData, "KAsterCti");
        var name = profile?.Trim();
        if (string.IsNullOrEmpty(name)) return baseRoot;

        if (name != Path.GetFileName(name) || name is "." or "..")
        {
            throw new ArgumentException(
                $"프로필 이름에는 경로를 쓸 수 없다: {profile}", nameof(profile));
        }

        return Path.Combine(baseRoot, "profiles", name);
    }

    public static string Settings => Path.Combine(Root, "settings.json");

    public static string TokenVault => Path.Combine(Root, "tokens.bin");

    public static string AudioDevices => Path.Combine(Root, "audio-devices.json");

    /// <summary>다음 로그인 때 채워 둘 아이디·내선. 비밀번호는 들어가지 않는다.</summary>
    public static string SavedLogin => Path.Combine(Root, "login.json");
}

/// <summary>앱이 붙을 서버. 현장마다 다르므로 파일로 뺀다.</summary>
public sealed record AppSettings
{
    public string ServerBaseUrl { get; init; } = "http://localhost:3000/api/v1/";

    /// <summary>끝에 슬래시가 없으면 상대 경로가 한 단계 잘려 나간다.</summary>
    public Uri BaseUri => new(ServerBaseUrl.EndsWith('/') ? ServerBaseUrl : ServerBaseUrl + "/");
}
