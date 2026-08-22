namespace KAster.Desktop.Core.Updates;

/// <summary>
/// 버전 두 개를 자릿수로 비교한다. <b>순수 함수다.</b>
///
/// 글자로 비교하면 <c>1.10.0</c> 이 <c>1.4.0</c> 보다 낮다고 나온다 — 현장에서 마이너가
/// 두 자리로 넘어가는 순간 전 상담원이 업데이트를 못 받는다.
/// </summary>
public static class AppVersion
{
    /// <summary>
    /// -1 / 0 / 1. <b>한쪽이라도 읽을 수 없으면 0</b> — 읽지 못한 값으로 "새 버전이 있다" 고
    /// 말하면 있지도 않은 업데이트를 매번 확인하게 되고, 반대로 필수라고 재촉하게도 된다.
    /// </summary>
    public static int Compare(string? left, string? right)
    {
        if (!TryParse(left, out var a) || !TryParse(right, out var b)) return 0;

        var places = Math.Max(a.Length, b.Length);
        for (var i = 0; i < places; i++)
        {
            // 자리가 모자라면 0 이다. 1.4 와 1.4.0 은 같은 버전이다.
            var diff = At(a, i).CompareTo(At(b, i));
            if (diff != 0) return diff < 0 ? -1 : 1;
        }

        return 0;
    }

    public static bool IsNewer(string? candidate, string? baseline) => Compare(candidate, baseline) > 0;

    private static long At(long[] parts, int index) => index < parts.Length ? parts[index] : 0;

    /// <summary>
    /// 점으로 나눠 각 자리의 <b>앞쪽 숫자만</b> 읽는다. <c>1.4.0-beta.2</c> 는 1.4.0 과 같은 자리로 읽힌다 —
    /// 꼬리표의 순서를 우리가 정할 근거가 없고, 배포 채널이 그것을 이미 가르고 있다.
    /// </summary>
    private static bool TryParse(string? text, out long[] parts)
    {
        parts = Array.Empty<long>();

        var trimmed = text?.Trim();
        if (string.IsNullOrEmpty(trimmed)) return false;

        var read = new List<long>();

        foreach (var segment in trimmed.Split('.'))
        {
            var digits = 0;
            while (digits < segment.Length && char.IsAsciiDigit(segment[digits])) digits++;

            if (digits > 0 && long.TryParse(segment[..digits], out var value)) read.Add(value);

            // 자리 뒤에 숫자가 아닌 것이 붙어 있으면 거기서부터는 배포 꼬리표다. 더 읽지 않는다.
            if (digits < segment.Length) break;
        }

        if (read.Count == 0) return false;

        parts = read.ToArray();
        return true;
    }
}
