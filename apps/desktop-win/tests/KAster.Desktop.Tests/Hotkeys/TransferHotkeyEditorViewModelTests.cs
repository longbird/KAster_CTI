using KAster.Desktop.App.Services;
using KAster.Desktop.App.ViewModels;
using KAster.Desktop.Core.Storage;
using KAster.Desktop.Tests.App;
using Xunit;

/// <summary>
/// 9칸을 화면에서 고친다. 빈 칸은 "안 걸어 둔 것" 이라 오류가 아니다 —
/// 9칸을 다 채우라고 하면 두 개만 쓰는 상담원이 저장을 못 한다.
/// </summary>
public class TransferHotkeyEditorViewModelTests
{
    private static (TransferHotkeyEditorViewModel Vm, MemoryStore<TransferHotkeySettings> Store) Build(
        params TransferHotkeySlot[] saved)
    {
        var store = new MemoryStore<TransferHotkeySettings>(new TransferHotkeySettings { Slots = saved });
        return (new TransferHotkeyEditorViewModel(store), store);
    }

    [Fact]
    public void Nine_rows_always_stand()
    {
        var (vm, _) = Build();

        Assert.Equal(9, vm.Rows.Count);
        Assert.Equal(1, vm.Rows[0].Slot);
        Assert.Equal(9, vm.Rows[8].Slot);
    }

    [Fact]
    public void Saved_slots_fill_their_rows()
    {
        var (vm, _) = Build(new TransferHotkeySlot
        {
            Slot = 3, Label = "팀장", Target = "2001", Mode = TransferHotkeyMode.Blind,
        });

        Assert.Equal("팀장", vm.Rows[2].Label);
        Assert.Equal("2001", vm.Rows[2].Target);
        Assert.False(vm.Rows[2].IsAttended);
        Assert.Equal(string.Empty, vm.Rows[0].Target);
    }

    [Fact]
    public void Filled_rows_are_saved_and_blank_rows_are_not()
    {
        var (vm, store) = Build();

        vm.Rows[0].Target = "2001";
        vm.Rows[0].Label = "팀장";
        vm.Save();

        var slots = store.Load().Slots;
        Assert.Single(slots);
        Assert.Equal(1, slots[0].Slot);
        Assert.Equal("2001", slots[0].Target);
    }

    [Fact]
    public void A_target_that_is_not_dialable_blocks_the_save()
    {
        var (vm, store) = Build();

        vm.Rows[0].Target = "2001번";
        vm.Save();

        Assert.NotNull(vm.Error);
        Assert.Empty(store.Load().Slots);
    }

    [Fact]
    public void Fixing_the_target_clears_the_error()
    {
        var (vm, store) = Build();

        vm.Rows[0].Target = "2001번";
        vm.Save();
        vm.Rows[0].Target = "2001";
        vm.Save();

        Assert.Null(vm.Error);
        Assert.Single(store.Load().Slots);
    }
}
