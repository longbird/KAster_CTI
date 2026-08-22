namespace KAster.Desktop.Core.Updates;

/// <summary>
/// 받은 파일을 어떤 이름으로 놓을지. <b>순수 함수다.</b>
///
/// 이름은 <b>서버가 주는 값</b>이다. 경로 조각이 섞여 있으면 우리가 시키는 대로
/// 엉뚱한 폴더 — 시작 프로그램 폴더 같은 — 에 실행 파일을 쓰게 된다.
/// </summary>
public static class UpdateFileName
{
    public static string SafeFor(string? given, string version)
    {
        var fallback = $"KAsterAgent-{version}.exe";

        var trimmed = given?.Trim();
        if (string.IsNullOrEmpty(trimmed)) return fallback;

        // 경로 부분을 통째로 버린다. 남은 이름만 쓴다.
        var name = trimmed;
        var cut = name.LastIndexOfAny(new[] { '/', '\\', ':' });
        if (cut >= 0) name = name[(cut + 1)..];

        var cleaned = new string(name.Where(c => !Path.GetInvalidFileNameChars().Contains(c)).ToArray()).Trim();

        // 경로만 있고 이름이 없었거나 (".." 같은) 지우고 나니 아무것도 안 남았다.
        return cleaned.Length == 0 || cleaned.All(c => c == '.') ? fallback : cleaned;
    }
}
