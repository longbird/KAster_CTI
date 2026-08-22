using System.Reflection;

namespace KAster.Desktop.App.Services;

/// <summary>
/// 지금 돌고 있는 이 앱이 무엇인지. 자동 업데이트가 "새 것인지" 를 가르는 기준값이 여기서 나온다.
/// </summary>
public static class AppRelease
{
    /// <summary>
    /// 승인된 릴리스 채널. 아직 현장에서 나눠 쓰지 않으므로 하나뿐이다 —
    /// 나눌 일이 생기면 설정으로 올린다. 없는 갈래를 미리 만들지 않는다.
    /// </summary>
    public const string Channel = "stable";

    /// <summary>
    /// 빌드에 박힌 버전. 읽을 수 없으면 빈 값이고, 그때
    /// <see cref="Core.Updates.AppVersion"/> 은 <b>비교 자체를 하지 않는다</b> —
    /// 우리 버전을 모른 채 "새 버전이 있다" 고 말하지 않기 위해서다.
    /// </summary>
    public static string Version { get; } = ReadVersion();

    /// <summary>
    /// 이 실행 파일. 프로토콜 등록이 가리켜야 하는 곳이다.
    /// </summary>
    public static string ExecutablePath { get; } =
        Environment.ProcessPath ?? Assembly.GetEntryAssembly()?.Location ?? string.Empty;

    /// <summary>
    /// 감사 로그에서 자리를 가르는 이름. 한 PC 에 상담원이 둘 앉는 자리가 있어
    /// 프로필까지 함께 적는다 — 안 그러면 두 자리의 기록이 한 이름으로 섞인다.
    /// </summary>
    public static string DeviceId { get; } = BuildDeviceId();

    private static string ReadVersion()
    {
        var assembly = Assembly.GetEntryAssembly() ?? Assembly.GetExecutingAssembly();

        var informational = assembly
            .GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion;

        // InformationalVersion 에는 빌드 해시가 붙어 온다 ("1.4.0+abc1234"). 자릿수만 쓴다.
        if (!string.IsNullOrWhiteSpace(informational))
        {
            var plus = informational.IndexOf('+');
            return (plus < 0 ? informational : informational[..plus]).Trim();
        }

        return assembly.GetName().Version?.ToString() ?? string.Empty;
    }

    private static string BuildDeviceId()
    {
        var profile = Environment.GetEnvironmentVariable(AppPaths.ProfileVariable)?.Trim();
        return string.IsNullOrEmpty(profile)
            ? Environment.MachineName
            : $"{Environment.MachineName}/{profile}";
    }
}
