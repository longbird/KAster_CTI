namespace KAster.Desktop.App.Services;

/// <summary>
/// 윈도우 로그인 항목에 적을 이름과 명령. <b>순수 계산이다</b> — 레지스트리를 건드리지 않는다.
/// 갈라 두지 않으면 테스트가 상담원 PC 의 시작 프로그램을 고친다.
/// </summary>
public static class AutoStartEntry
{
    /// <summary>따옴표와 역슬래시. 명령을 갈라 놓거나 경로로 새는 글자다.</summary>
    private const char Chr34 = (char)34;
    private const char Chr92 = (char)92;

    private const string BaseName = "KAsterCtiAgent";

    /// <summary>
    /// 자리마다 다른 이름으로 등록한다. 한 PC 에 두 상담원을 띄우는 현장이 있고,
    /// 이름이 같으면 나중에 켠 쪽이 앞 자리의 등록을 지운다.
    /// </summary>
    public static string NameFor(string? profile)
    {
        var name = Clean(profile);
        return name.Length == 0 ? BaseName : $"{BaseName}.{name}";
    }

    /// <summary>
    /// 경로는 반드시 따옴표로 감싼다. 기본 설치 경로에 공백이 들어 있어(Program Files)
    /// 안 감싸면 윈도우가 잘라 읽고 앱이 안 뜬다.
    /// </summary>
    public static string CommandFor(string executablePath, string? profile = null)
    {
        var command = $"\"{executablePath}\"";
        var name = Clean(profile);

        return name.Length == 0 ? command : $"{command} --profile \"{name}\"";
    }

    /// <summary>
    /// 프로필은 사람이 명령줄에 적는 값이라 따옴표가 섞여 들어올 수 있다. 그대로 이으면
    /// 명령이 갈라져 엉뚱한 인자가 붙는다. 미심쩍으면 아예 안 붙인다.
    /// </summary>
    private static string Clean(string? profile)
    {
        var name = profile?.Trim() ?? string.Empty;
        return name.IndexOfAny(new[] { Chr34, Chr92 }) >= 0 ? string.Empty : name;
    }
}
