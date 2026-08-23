using System.IO;
using System.Runtime.Versioning;
using Microsoft.Win32;

namespace KAster.Desktop.App.Services;

/// <summary>
/// 윈도우 로그인 항목 등록. 사용자 자신의 자리(HKCU)만 건드린다 — 시스템 전체 설정이 아니다.
///
/// <b>실패해도 앱은 그대로 돈다.</b> 정책으로 막힌 PC 가 있고, 자동 시작이 안 된다고
/// 상담원이 전화를 못 받으면 안 된다. 실패는 되돌려 주고 화면이 알린다.
/// </summary>
[SupportedOSPlatform("windows")]
public static class AutoStartRegistration
{
    private const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";

    /// <summary>지금 등록돼 있는가. 못 읽으면 "아니오" 로 본다.</summary>
    public static bool IsRegistered(string? profile)
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(RunKey);
            return key?.GetValue(AutoStartEntry.NameFor(profile)) is not null;
        }
        catch (Exception)
        {
            return false;
        }
    }

    /// <summary>켜거나 끈다. 실패 사유를 돌려주고, 잘 됐으면 null 이다.</summary>
    public static string? Apply(bool enabled, string executablePath, string? profile)
    {
        try
        {
            using var key = Registry.CurrentUser.CreateSubKey(RunKey, writable: true);
            if (key is null) return "윈도우 시작 프로그램 목록을 열지 못했습니다.";

            var name = AutoStartEntry.NameFor(profile);
            if (enabled) key.SetValue(name, AutoStartEntry.CommandFor(executablePath, profile));
            else key.DeleteValue(name, throwOnMissingValue: false);

            return null;
        }
        catch (Exception ex) when (ex is UnauthorizedAccessException or System.Security.SecurityException or IOException)
        {
            return $"윈도우 시작 프로그램에 등록하지 못했습니다: {ex.Message}";
        }
    }
}
