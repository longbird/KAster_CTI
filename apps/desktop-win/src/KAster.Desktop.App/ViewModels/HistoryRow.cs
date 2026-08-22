using KAster.Desktop.Core.Contracts;

namespace KAster.Desktop.App.ViewModels;

/// <summary>
/// 이력 한 줄. 상담원이 읽는 것은 넷이다 — 언제, 어느 번호와, 얼마나, 받았는지.
/// </summary>
public sealed record HistoryRow(
    string CallId,
    string PhoneNumber,
    string RawNumber,
    string When,
    string Duration,
    bool WasMissed)
{
    public static HistoryRow From(CallHistoryEntry entry, Func<DateTimeOffset> now)
    {
        // 상담원 입장에서 "상대 번호" 는 방향에 따라 반대쪽이다.
        var outbound = entry.Direction?.Equals("outbound", StringComparison.OrdinalIgnoreCase) == true;
        var raw = (outbound ? entry.Dnis : entry.Ani)?.Trim() ?? string.Empty;

        return new HistoryRow(
            entry.CallId,
            PhoneNumberFormatOrBlank(raw),
            raw,
            FormatWhen(entry.StartedAt, now),
            FormatDuration(entry.TalkSeconds),
            !string.IsNullOrWhiteSpace(entry.MissedReason));
    }

    private static string PhoneNumberFormatOrBlank(string raw)
    {
        var shown = PhoneNumberFormat.ForDisplay(raw);
        return shown.Length > 0 ? shown : "번호 없음";
    }

    /// <summary>오늘 것은 시각만, 그 전은 날짜까지. 같은 날 통화가 대부분이다.</summary>
    private static string FormatWhen(DateTimeOffset? startedAt, Func<DateTimeOffset> now)
    {
        if (startedAt is not { } at) return string.Empty;

        var local = at.ToLocalTime();
        return local.Date == now().ToLocalTime().Date
            ? local.ToString("HH:mm")
            : local.ToString("MM-dd HH:mm");
    }

    private static string FormatDuration(int? talkSeconds)
    {
        if (talkSeconds is not { } seconds || seconds <= 0) return string.Empty;

        var span = TimeSpan.FromSeconds(seconds);
        return span.TotalHours >= 1
            ? $"{(int)span.TotalHours}:{span.Minutes:D2}:{span.Seconds:D2}"
            : $"{span.Minutes}:{span.Seconds:D2}";
    }
}
