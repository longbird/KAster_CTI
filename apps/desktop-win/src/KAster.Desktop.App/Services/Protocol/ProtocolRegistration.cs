using System.IO;
using System.Runtime.Versioning;
using KAster.Desktop.Core.Protocol;
using Microsoft.Win32;

namespace KAster.Desktop.App.Services;

/// <summary>
/// <c>kastercti://</c> 와 <c>kaster-agent://</c> 를 이 실행 파일에 잇는다.
///
/// <b>HKEY_CURRENT_USER 에만 쓴다.</b> HKLM 은 관리자 권한이 필요한데 상담원 PC 에는 그 권한이 없다 —
/// 거기에 쓰려 들면 설치가 통째로 실패하거나, 더 나쁘게는 조용히 실패하고 링크가 안 먹는다.
///
/// 판정할 것이 없는 얇은 결합부다. 실패는 삼키지 않고 <see cref="Register"/> 의 반환값으로 올린다 —
/// 등록이 안 됐는데 화면이 "등록됨" 이라고 하면 웹에서 눌러도 아무 일이 없는 이유를 알 수 없다.
/// </summary>
[SupportedOSPlatform("windows")]
public static class ProtocolRegistration
{
    /// <summary>이 스킴들이 모두 이 실행 파일을 가리키고 있는가.</summary>
    public static bool IsRegistered(string executablePath)
        => ProtocolRequest.Schemes.All(scheme => PointsHere(scheme, executablePath));

    /// <summary>
    /// 두 스킴을 모두 건다. 설계 문서는 <c>kastercti</c> 를 적고 있고 웹앱이 실제로 내보내는 것은
    /// <c>kaster-agent</c> 다 — 한쪽만 걸면 웹에서 넘긴 세션이 이 클라이언트에 도착하지 않는다.
    /// </summary>
    /// <returns>실패 사유. null 이면 전부 걸렸다.</returns>
    public static string? Register(string executablePath)
    {
        try
        {
            foreach (var scheme in ProtocolRequest.Schemes) Write(scheme, executablePath);
            return null;
        }
        catch (Exception ex) when (ex is UnauthorizedAccessException or System.Security.SecurityException or IOException)
        {
            App.LogError(ex);
            return "웹에서 넘기는 로그인 링크를 이 PC 에 등록하지 못했다";
        }
    }

    private static void Write(string scheme, string executablePath)
    {
        using var key = Registry.CurrentUser.CreateSubKey($@"Software\Classes\{scheme}");
        key.SetValue(string.Empty, $"URL:{scheme}");

        // 이 값이 있어야 윈도우가 이 키를 프로토콜 처리기로 본다. 이름이 아니라 존재가 뜻이다.
        key.SetValue("URL Protocol", string.Empty);

        using var command = key.CreateSubKey(@"shell\open\command");

        // 경로에 공백이 있고 (%LOCALAPPDATA%\Program Files\...) 주소도 따옴표로 감싸야 한다.
        // 안 감싸면 공백에서 잘려 엉뚱한 인자가 들어온다.
        command.SetValue(string.Empty, $"\"{executablePath}\" \"%1\"");
    }

    private static bool PointsHere(string scheme, string executablePath)
    {
        try
        {
            using var command = Registry.CurrentUser.OpenSubKey(
                $@"Software\Classes\{scheme}\shell\open\command");

            return command?.GetValue(string.Empty) is string value
                && value.Contains(executablePath, StringComparison.OrdinalIgnoreCase);
        }
        catch (Exception ex) when (ex is UnauthorizedAccessException or System.Security.SecurityException or IOException)
        {
            App.LogError(ex);
            return false;
        }
    }
}
