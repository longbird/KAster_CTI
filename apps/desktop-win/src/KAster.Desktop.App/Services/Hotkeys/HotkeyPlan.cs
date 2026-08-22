namespace KAster.Desktop.App.Services;

/// <summary>
/// 수식키. 값은 Win32 <c>RegisterHotKey</c> 의 <c>MOD_*</c> 그대로다 — 우리가 따로 번호를 매기면
/// 등록은 성공하는데 엉뚱한 조합이 잡힌다.
/// </summary>
[Flags]
public enum HotkeyModifiers
{
    None = 0,
    Alt = 0x0001,
    Control = 0x0002,
    Shift = 0x0004,
    Win = 0x0008,
}

/// <summary>등록할 조합 하나.</summary>
public sealed record HotkeyBinding(HotkeyModifiers Modifiers, uint VirtualKey);

/// <summary>
/// 동작 하나에 대한 판정. <see cref="Binding"/> 이 null 이면 등록하지 않는다 —
/// <see cref="Error"/> 가 있으면 상담원에게 말해야 하는 실패고, 없으면 상담원이 비워 둔 것이다.
/// </summary>
public sealed record HotkeyAssignment(
    HotkeyAction Action,
    string Label,
    string Text,
    HotkeyBinding? Binding,
    string? Error);

/// <summary>
/// 핫키 실패를 상담원이 읽는 한 줄로 바꾼다.
///
/// <b>조용히 실패하면 안 된다.</b> 등록이 거부된 핫키는 눌러도 아무 일이 없는데, 상담원은
/// 되는 줄 알고 계속 누르고 전화는 그동안 울린다.
/// </summary>
public static class HotkeyNotice
{
    /// <summary>윈도우가 등록을 거부했다. 거의 언제나 다른 프로그램이 먼저 잡은 경우다.</summary>
    public static string Refused(HotkeyAssignment assignment)
        => $"{assignment.Label} 핫키 {assignment.Text} 를 등록하지 못했다 (다른 프로그램이 쓰고 있다)";

    /// <summary>알릴 것이 없으면 null. 화면 알림 자리는 하나뿐이라 여러 건은 한 줄로 모은다.</summary>
    public static string? For(IReadOnlyList<string> failures)
        => failures.Count == 0 ? null : string.Join(" · ", failures);
}

/// <summary>
/// 설정에 적힌 글자를 등록할 수 있는 조합으로 바꾼다. <b>순수 함수다</b> —
/// 실제 등록은 <see cref="GlobalHotkeyService"/> 가 이 계획을 그대로 실행한다.
/// </summary>
public static class HotkeyPlan
{
    public static IReadOnlyList<HotkeyAssignment> For(HotkeySettings settings)
    {
        var wanted = new (HotkeyAction Action, string Label, string Text)[]
        {
            (HotkeyAction.Answer, "받기", settings.Answer),
            (HotkeyAction.Hangup, "끊기", settings.Hangup),
            (HotkeyAction.ToggleMute, "마이크", settings.ToggleMute),
        };

        // 같은 조합을 둘째로 등록하면 윈도우가 거부한다. 그 실패를 여기서 먼저 잡아 두면
        // "끊기가 왜 안 먹지" 를 OS 오류 코드가 아니라 우리 말로 설명할 수 있다.
        var taken = new Dictionary<HotkeyBinding, string>();
        var plan = new List<HotkeyAssignment>(wanted.Length);

        foreach (var (action, label, text) in wanted)
        {
            plan.Add(Resolve(action, label, text, taken));
        }

        return plan;
    }

    private static HotkeyAssignment Resolve(
        HotkeyAction action,
        string label,
        string text,
        Dictionary<HotkeyBinding, string> taken)
    {
        var trimmed = text?.Trim() ?? string.Empty;

        // 비워 둔 것은 "이 동작에는 핫키를 안 쓴다" 는 뜻이다. 실패가 아니다.
        if (trimmed.Length == 0) return new HotkeyAssignment(action, label, string.Empty, null, null);

        if (!TryParse(trimmed, out var binding, out var reason))
        {
            return new HotkeyAssignment(action, label, trimmed, null, reason);
        }

        if (taken.TryGetValue(binding!, out var owner))
        {
            return new HotkeyAssignment(
                action, label, trimmed, null, $"{trimmed} 는 이미 {owner} 에 쓰고 있다");
        }

        taken[binding!] = label;
        return new HotkeyAssignment(action, label, trimmed, binding, null);
    }

    private static bool TryParse(string text, out HotkeyBinding? binding, out string? reason)
    {
        binding = null;
        reason = null;

        var parts = text.Split('+', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        var modifiers = HotkeyModifiers.None;
        string? keyName = null;

        foreach (var part in parts)
        {
            var modifier = ModifierOf(part);
            if (modifier != HotkeyModifiers.None)
            {
                modifiers |= modifier;
                continue;
            }

            if (keyName is not null)
            {
                reason = $"{text} 에 키가 둘 이상 들어 있다";
                return false;
            }

            keyName = part;
        }

        if (keyName is null)
        {
            reason = $"{text} 에 누를 키가 없다";
            return false;
        }

        if (VirtualKeyOf(keyName) is not { } virtualKey)
        {
            reason = $"{text} 의 {keyName} 을 읽을 수 없다";
            return false;
        }

        // 수식키가 없으면 그 키는 이 앱이 통째로 가져간다. 상담원이 다른 프로그램에서
        // 영영 못 쓰게 되므로, 전화 앱이 그렇게까지 할 이유가 없다.
        if (modifiers == HotkeyModifiers.None)
        {
            reason = $"{text} 에는 Ctrl·Shift·Alt 중 하나가 있어야 한다";
            return false;
        }

        binding = new HotkeyBinding(modifiers, virtualKey);
        return true;
    }

    private static HotkeyModifiers ModifierOf(string part) => part.ToUpperInvariant() switch
    {
        "CTRL" or "CONTROL" => HotkeyModifiers.Control,
        "SHIFT" => HotkeyModifiers.Shift,
        "ALT" => HotkeyModifiers.Alt,
        "WIN" => HotkeyModifiers.Win,
        _ => HotkeyModifiers.None,
    };

    /// <summary>
    /// 받아 주는 키. 글자·숫자·기능키와 이름이 붙은 몇 개뿐이다 — 목록을 넓히면 설정 파일에
    /// 적을 수 있는 값이 늘지만, 읽을 수 없는 값이 조용히 무시되는 자리도 같이 는다.
    /// </summary>
    private static uint? VirtualKeyOf(string name)
    {
        var key = name.ToUpperInvariant();

        if (key.Length == 1 && key[0] is >= 'A' and <= 'Z') return key[0];
        if (key.Length == 1 && key[0] is >= '0' and <= '9') return key[0];

        if (key.Length >= 2 && key[0] == 'F' && int.TryParse(key[1..], out var number)
            && number is >= 1 and <= 24)
        {
            // VK_F1 = 0x70 부터 이어진다.
            return (uint)(0x70 + number - 1);
        }

        return key switch
        {
            "SPACE" => 0x20,
            "PAUSE" => 0x13,
            "INSERT" => 0x2D,
            "DELETE" => 0x2E,
            "HOME" => 0x24,
            "END" => 0x23,
            "PAGEUP" => 0x21,
            "PAGEDOWN" => 0x22,
            _ => null,
        };
    }
}
