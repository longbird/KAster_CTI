namespace KAster.Desktop.App.Services;

public enum TransferHotkeyMode
{
    /// <summary>협의 없이 바로 넘긴다.</summary>
    Blind,

    /// <summary>상대에게 먼저 사정을 말하고 넘긴다.</summary>
    Attended,
}

/// <summary>통화 중 숫자 키 하나에 걸어 둔 전환 대상.</summary>
public sealed record TransferHotkeySlot
{
    /// <summary>1~9. 통화 중 이 숫자를 누르면 걸린다.</summary>
    public int Slot { get; init; }

    /// <summary>화면에 보여 줄 이름. 비어 있으면 대상 번호를 그대로 보여 준다.</summary>
    public string Label { get; init; } = string.Empty;

    /// <summary>넘길 내선 또는 번호.</summary>
    public string Target { get; init; } = string.Empty;

    public TransferHotkeyMode Mode { get; init; } = TransferHotkeyMode.Attended;

    public string DisplayName => Label.Trim().Length > 0 ? Label.Trim() : Target.Trim();
}

public sealed record TransferHotkeySettings
{
    public IReadOnlyList<TransferHotkeySlot> Slots { get; init; } = Array.Empty<TransferHotkeySlot>();

    /// <summary>
    /// 저장된 값을 믿지 않고 걸러 낸다. 이 파일은 사람이 열어 고칠 수 있는 자리에 있고,
    /// 여기서 나온 값이 그대로 PBX 전환 대상이 된다.
    /// </summary>
    public TransferHotkeySettings Sane()
    {
        var kept = new List<TransferHotkeySlot>();
        var taken = new HashSet<int>();

        foreach (var slot in Slots ?? Array.Empty<TransferHotkeySlot>())
        {
            if (slot is null) continue;
            if (slot.Slot < TransferHotkeys.MinSlot || slot.Slot > TransferHotkeys.MaxSlot) continue;

            var target = slot.Target?.Trim() ?? string.Empty;
            if (!TransferHotkeys.IsDialable(target)) continue;

            // 같은 숫자가 둘이면 어느 것이 걸릴지 사람이 알 수 없다. 처음 것만 남긴다.
            if (!taken.Add(slot.Slot)) continue;

            kept.Add(slot with { Target = target, Label = slot.Label?.Trim() ?? string.Empty });
        }

        return new TransferHotkeySettings { Slots = kept };
    }
}

/// <summary>
/// 통화 중 숫자 키를 전환 지시로 읽을지 정한다. <b>순수 판정이다</b> — 창도 서버도 건드리지 않는다.
/// </summary>
public static class TransferHotkeys
{
    public const int MinSlot = 1;
    public const int MaxSlot = 9;

    /// <summary>대상은 전화번호 자리다. 아무 문자열이나 그대로 PBX 로 보내지 않는다.</summary>
    public static bool IsDialable(string? target)
    {
        var value = target?.Trim();
        if (string.IsNullOrEmpty(value) || value.Length > 32) return false;

        return value.All(c => char.IsAsciiDigit(c) || c is '*' or '#' or '+');
    }

    /// <summary>
    /// 이 키 입력이 전환 지시인가.
    ///
    /// 통화 중일 때만이고, 글자를 치고 있는 칸에서는 가로채지 않으며, 조합키가 눌려 있으면
    /// 다른 뜻이다. 걸어 두지 않은 숫자는 아무 일도 하지 않는다 — 여기서 목록을 열거나
    /// 하면 상담원이 누른 적 없는 화면이 통화 중에 튀어나온다.
    /// </summary>
    public static TransferHotkeySlot? Resolve(
        IReadOnlyList<TransferHotkeySlot> slots,
        int digit,
        WindowMode mode,
        bool typingInATextBox,
        bool modifierHeld)
    {
        if (mode is not (WindowMode.Talking or WindowMode.Transferring)) return null;
        if (typingInATextBox || modifierHeld) return null;
        if (digit < MinSlot || digit > MaxSlot) return null;

        return slots.FirstOrDefault(slot => slot.Slot == digit);
    }
}
