using System.Collections.ObjectModel;
using KAster.Desktop.App.Services;
using KAster.Desktop.Core.Storage;

namespace KAster.Desktop.App.ViewModels;

/// <summary>화면의 한 줄. 숫자 하나에 걸어 둘 이름·대상·방식이다.</summary>
public sealed class TransferHotkeyRow : ObservableObject
{
    private string _label = string.Empty;
    private string _target = string.Empty;
    private bool _isAttended = true;

    public TransferHotkeyRow(int slot) => Slot = slot;

    public int Slot { get; }

    public string Label
    {
        get => _label;
        set => Set(ref _label, value);
    }

    public string Target
    {
        get => _target;
        set => Set(ref _target, value);
    }

    /// <summary>협의 후 넘기기. 끄면 바로 넘긴다.</summary>
    public bool IsAttended
    {
        get => _isAttended;
        set => Set(ref _isAttended, value);
    }

    public bool IsBlank => Target.Trim().Length == 0;
}

/// <summary>
/// 통화 중 1~9 에 걸어 두는 전환 대상 편집기.
///
/// 9칸이 늘 서 있다. <b>빈 칸은 오류가 아니다</b> — 두 개만 쓰는 상담원이 나머지 일곱을
/// 채우지 못해 저장을 못 하면 안 된다. 채운 칸만 검사하고 채운 칸만 저장한다.
/// </summary>
public sealed class TransferHotkeyEditorViewModel : ObservableObject
{
    private readonly ISettingsStore<TransferHotkeySettings> _store;
    private string? _error;

    public TransferHotkeyEditorViewModel(ISettingsStore<TransferHotkeySettings> store)
    {
        _store = store;

        var saved = store.Load().Sane().Slots.ToDictionary(slot => slot.Slot);

        for (var slot = TransferHotkeys.MinSlot; slot <= TransferHotkeys.MaxSlot; slot++)
        {
            var row = new TransferHotkeyRow(slot);
            if (saved.TryGetValue(slot, out var stored))
            {
                row.Label = stored.Label;
                row.Target = stored.Target;
                row.IsAttended = stored.Mode == TransferHotkeyMode.Attended;
            }

            Rows.Add(row);
        }
    }

    public ObservableCollection<TransferHotkeyRow> Rows { get; } = new();

    /// <summary>상담원에게 말해야 하는 것. 없으면 null 이라 화면에서 접힌다.</summary>
    public string? Error
    {
        get => _error;
        private set => Set(ref _error, value);
    }

    /// <summary>저장한다. 걸러진 칸이 있으면 <see cref="Error"/> 에 적고 아무것도 저장하지 않는다.</summary>
    public void Save()
    {
        var bad = Rows
            .Where(row => !row.IsBlank && !TransferHotkeys.IsDialable(row.Target))
            .Select(row => row.Slot)
            .ToList();

        if (bad.Count > 0)
        {
            Error = $"{string.Join(", ", bad)}번 칸의 대상이 전화번호가 아닙니다. 숫자와 * # + 만 쓸 수 있습니다.";
            return;
        }

        Error = null;
        _store.Save(new TransferHotkeySettings
        {
            Slots = Rows
                .Where(row => !row.IsBlank)
                .Select(row => new TransferHotkeySlot
                {
                    Slot = row.Slot,
                    Label = row.Label.Trim(),
                    Target = row.Target.Trim(),
                    Mode = row.IsAttended ? TransferHotkeyMode.Attended : TransferHotkeyMode.Blind,
                })
                .ToList(),
        }.Sane());
    }
}
