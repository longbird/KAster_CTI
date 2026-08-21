using System.Text.RegularExpressions;

namespace KAster.Desktop.Core.Contracts;

/// <summary>
/// 화면에 보여 줄 전화번호 모양.
///
/// 상담원은 통화 중에 번호를 눈으로 읽고 받아 적는다. <c>01034623453</c> 처럼 붙어 있으면
/// 자리를 세어야 하지만 <c>010-3462-3453</c> 은 한눈에 들어온다.
///
/// <b>표시에만 쓴다.</b> 서버로 보낼 때는 숫자만 남긴 원문을 그대로 쓴다.
/// 모양을 못 알아보면 원문을 그대로 돌려준다 — 잘못 나누느니 안 나누는 것이 낫다.
/// </summary>
public static class PhoneNumberFormat
{
    // 010-1234-5678 / 070-5234-6380 / 080-1234-5678 — 세 자리 접두 뒤로 3~4자리씩.
    private static readonly Regex PrefixedMobile = new(@"^(01[016789]|070|080)(\d{3,4})(\d{4})$");

    // 서울만 지역번호가 두 자리다.
    private static readonly Regex Seoul = new(@"^(02)(\d{3,4})(\d{4})$");

    private static readonly Regex OtherArea = new(@"^(0[3-6][1-5])(\d{3,4})(\d{4})$");

    // 1588-1234 같은 대표번호. 지역번호가 없다.
    private static readonly Regex Representative = new(@"^(1[5-9]\d{2})(\d{4})$");

    public static string ForDisplay(string? value)
    {
        var trimmed = value?.Trim() ?? string.Empty;
        if (trimmed.Length == 0) return string.Empty;

        var digits = new string(trimmed.Where(char.IsAsciiDigit).ToArray());

        // 내선과 119·112 는 나누지 않는다. 나누면 오히려 못 알아본다.
        if (digits.Length <= 4 && !Representative.IsMatch(digits)) return trimmed;

        foreach (var pattern in new[] { PrefixedMobile, Seoul, OtherArea, Representative })
        {
            var match = pattern.Match(digits);
            if (!match.Success) continue;

            return string.Join('-', match.Groups.Values.Skip(1).Select(g => g.Value));
        }

        return trimmed;
    }
}
