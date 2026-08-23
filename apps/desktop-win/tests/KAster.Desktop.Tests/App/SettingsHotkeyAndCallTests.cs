using KAster.Desktop.App.Services;
using KAster.Desktop.App.ViewModels;
using KAster.Desktop.Core.Storage;
using KAster.Desktop.Softphone.Audio;

namespace KAster.Desktop.Tests.App;

/// <summary>
/// 설정 화면에 붙은 핫키·통화 항목. 서버 주소와 오디오는
/// <see cref="SettingsViewModelTests"/> 가 이미 지키고 있다.
/// </summary>
public class SettingsHotkeyAndCallTests
{
    private static FakeDevices Devices()
    {
        var devices = new FakeDevices();
        devices.Capture.Add(new AudioDeviceInfo("cap-1", "헤드셋 마이크", AudioDeviceKind.Capture, true));
        devices.Render.Add(new AudioDeviceInfo("out-1", "헤드셋", AudioDeviceKind.Render, true));
        return devices;
    }

    private static SettingsViewModel Build(
        ISettingsStore<HotkeySettings>? hotkeys = null,
        ISettingsStore<CallPreferences>? calls = null,
        Func<HotkeySettings, IReadOnlyList<string>>? apply = null,
        ISettingsStore<TransferHotkeySettings>? transferHotkeys = null)
        => new(
            new MemoryStore<AppSettings>(new AppSettings()),
            new MemoryStore<AudioDeviceSelection>(new AudioDeviceSelection()),
            Devices(),
            useSoftphone: true,
            hotkeys ?? new MemoryStore<HotkeySettings>(new HotkeySettings()),
            calls ?? new MemoryStore<CallPreferences>(new CallPreferences()),
            transferHotkeys ?? new MemoryStore<TransferHotkeySettings>(new TransferHotkeySettings()),
            apply ?? (_ => Array.Empty<string>()));

    [Fact]
    public void The_combinations_in_use_are_what_the_screen_opens_with()
    {
        var vm = Build();

        Assert.True(vm.ShowsHotkeys);
        Assert.Equal("Ctrl+Shift+F9", vm.AnswerHotkey);
        Assert.Equal("Ctrl+Shift+F10", vm.HangupHotkey);
        Assert.Equal("Ctrl+Shift+F8", vm.MuteHotkey);
    }

    [Fact]
    public void A_changed_combination_is_kept_for_the_next_launch()
    {
        var store = new MemoryStore<HotkeySettings>(new HotkeySettings());
        var vm = Build(store);

        vm.AnswerHotkey = "Ctrl+Alt+A";
        vm.SaveCommand.Execute(null);

        Assert.Equal("Ctrl+Alt+A", store.Load().Answer);
    }

    /// <summary>비워 두는 것은 "이 동작에는 핫키를 안 쓴다" 는 뜻이다. 오류가 아니다.</summary>
    [Fact]
    public void An_empty_combination_is_allowed()
    {
        var vm = Build();
        vm.MuteHotkey = string.Empty;

        Assert.Null(vm.HotkeyError);
        Assert.True(vm.SaveCommand.CanExecute(null));
    }

    /// <summary>
    /// 읽을 수 없는 조합을 저장하면 그 핫키는 조용히 안 먹는다. 저장 전에 막고 이유를 적는다.
    /// </summary>
    [Theory]
    [InlineData("F9")]
    [InlineData("Ctrl+Shift")]
    [InlineData("Ctrl+Shift+없는키")]
    [InlineData("Ctrl+A+B")]
    public void A_combination_we_cannot_read_blocks_saving_and_says_why(string bad)
    {
        var vm = Build();
        vm.AnswerHotkey = bad;

        Assert.NotNull(vm.HotkeyError);
        Assert.False(vm.SaveCommand.CanExecute(null));
    }

    /// <summary>
    /// 같은 조합을 둘에 걸면 윈도우가 둘째를 거부한다. 그 실패는 "끊기가 왜 안 먹지" 로 나타나므로
    /// 등록해 보기 전에 여기서 잡는다.
    /// </summary>
    [Fact]
    public void The_same_combination_twice_blocks_saving()
    {
        var vm = Build();
        vm.HangupHotkey = vm.AnswerHotkey;

        Assert.NotNull(vm.HotkeyError);
        Assert.False(vm.SaveCommand.CanExecute(null));
    }

    /// <summary>
    /// <b>충돌로 등록이 실패하면 그 자리에서 알린다.</b> 다른 프로그램이 먼저 잡은 조합은
    /// 눌러도 아무 일이 없는데, 창이 그냥 닫히면 상담원은 되는 줄 알고 계속 누른다.
    /// </summary>
    [Fact]
    public void A_combination_windows_refuses_is_said_on_the_spot_and_the_window_stays_open()
    {
        var closed = false;
        var vm = Build(apply: _ => new[] { "받기 핫키 Ctrl+Shift+F9 를 등록하지 못했다 (다른 프로그램이 쓰고 있다)" });
        vm.Closed += (_, _) => closed = true;

        vm.SaveCommand.Execute(null);

        Assert.False(closed);
        Assert.NotNull(vm.HotkeyNotice);
        Assert.Contains("다른 프로그램", vm.HotkeyNotice);
    }

    /// <summary>등록이 실패해도 <b>적은 것은 저장한다</b>. 안 그러면 고치려고 다시 타야 한다.</summary>
    [Fact]
    public void What_the_agent_typed_survives_a_refused_registration()
    {
        var store = new MemoryStore<HotkeySettings>(new HotkeySettings());
        var vm = Build(store, apply: _ => new[] { "등록하지 못했다" });

        vm.AnswerHotkey = "Ctrl+Alt+A";
        vm.SaveCommand.Execute(null);

        Assert.Equal("Ctrl+Alt+A", store.Load().Answer);
    }

    [Fact]
    public void A_registration_that_went_through_closes_the_window()
    {
        var closed = false;
        var vm = Build();
        vm.Closed += (_, _) => closed = true;

        vm.SaveCommand.Execute(null);

        Assert.True(closed);
        Assert.Null(vm.HotkeyNotice);
    }

    /// <summary>등록해 보는 것은 저장을 누를 때뿐이다. 한 글자 칠 때마다 걸었다 내리면 안 된다.</summary>
    [Fact]
    public void Nothing_is_registered_until_the_agent_saves()
    {
        var tries = 0;
        var vm = Build(apply: _ =>
        {
            tries++;
            return Array.Empty<string>();
        });

        vm.AnswerHotkey = "Ctrl+Alt+A";
        Assert.Equal(0, tries);

        vm.SaveCommand.Execute(null);
        Assert.Equal(1, tries);
    }

    [Fact]
    public void The_call_settings_in_use_are_what_the_screen_opens_with()
    {
        var vm = Build(calls: new MemoryStore<CallPreferences>(
            new CallPreferences { SelfAnswerWindowSeconds = 60, PbxResponseWaitSeconds = 8 }));

        Assert.True(vm.ShowsCallPreferences);
        Assert.Equal("60", vm.SelfAnswerSeconds);
        Assert.Equal("8", vm.PbxWaitSeconds);
    }

    [Fact]
    public void A_changed_call_setting_is_kept_for_the_next_launch()
    {
        var store = new MemoryStore<CallPreferences>(new CallPreferences());
        var vm = Build(calls: store);

        vm.SelfAnswerSeconds = "70";
        vm.PbxWaitSeconds = "9";
        vm.SaveCommand.Execute(null);

        Assert.Equal(70, store.Load().SelfAnswerWindowSeconds);
        Assert.Equal(9, store.Load().PbxResponseWaitSeconds);
    }

    /// <summary>
    /// 숫자가 아니거나 범위 밖이면 저장을 막는다. 자동응답 대기가 0 이면 자기가 건 전화를
    /// 영영 못 받고, 3600 이면 그 사이 걸려 온 고객 전화를 말없이 받는다.
    /// </summary>
    [Theory]
    [InlineData("")]
    [InlineData("영")]
    [InlineData("0")]
    [InlineData("-5")]
    [InlineData("3600")]
    public void A_call_setting_we_cannot_use_blocks_saving(string bad)
    {
        var vm = Build();
        vm.SelfAnswerSeconds = bad;

        Assert.NotNull(vm.CallSettingsError);
        Assert.False(vm.SaveCommand.CanExecute(null));
    }

    [Theory]
    [InlineData("0")]
    [InlineData("100")]
    [InlineData("한참")]
    public void A_pbx_wait_we_cannot_use_blocks_saving(string bad)
    {
        var vm = Build();
        vm.PbxWaitSeconds = bad;

        Assert.NotNull(vm.CallSettingsError);
        Assert.False(vm.SaveCommand.CanExecute(null));
    }

    /// <summary>고친 값이 다시 쓸 수 있게 되면 저장이 열린다.</summary>
    [Fact]
    public void Fixing_the_value_opens_saving_again()
    {
        var vm = Build();
        vm.SelfAnswerSeconds = "0";
        Assert.False(vm.SaveCommand.CanExecute(null));

        vm.SelfAnswerSeconds = "45";

        Assert.Null(vm.CallSettingsError);
        Assert.True(vm.SaveCommand.CanExecute(null));
    }

    /// <summary>
    /// 로그인 전에도 설정을 연다. 그때는 서버에 물어볼 수단이 없으므로 업데이트 자리를 아예 안 만든다 —
    /// 누를 수 없는 버튼을 보여 주면 상담원은 고장 난 줄 안다.
    /// </summary>
    [Fact]
    public void Before_signing_in_there_is_nothing_to_check_for_updates_with()
    {
        var vm = new SettingsViewModel(
            new MemoryStore<AppSettings>(new AppSettings()),
            new MemoryStore<AudioDeviceSelection>(new AudioDeviceSelection()),
            Devices(),
            useSoftphone: true);

        Assert.False(vm.ShowsUpdate);
        Assert.False(vm.ShowsHotkeys);
        Assert.False(vm.ShowsCallPreferences);
    }

    /// <summary>
    /// 프로토콜 등록이 풀려 있으면 웹에서 눌러도 아무 일이 없다. 상담원이 그 사실과
    /// 다시 거는 길을 볼 수 있어야 한다.
    /// </summary>
    [Fact]
    public void A_protocol_link_that_is_not_registered_can_be_put_back()
    {
        var repaired = 0;
        var vm = new SettingsViewModel(
            new MemoryStore<AppSettings>(new AppSettings()),
            new MemoryStore<AudioDeviceSelection>(new AudioDeviceSelection()),
            Devices(),
            useSoftphone: true,
            protocolRegistered: false,
            repairProtocol: () =>
            {
                repaired++;
                return null;
            });

        Assert.Contains("등록", vm.ProtocolStatusText);
        vm.RepairProtocolCommand.Execute(null);

        Assert.Equal(1, repaired);
        Assert.Contains("등록됐습니다", vm.ProtocolStatusText);
    }

    [Fact]
    public void A_protocol_link_that_could_not_be_put_back_says_so()
    {
        var vm = new SettingsViewModel(
            new MemoryStore<AppSettings>(new AppSettings()),
            new MemoryStore<AudioDeviceSelection>(new AudioDeviceSelection()),
            Devices(),
            useSoftphone: true,
            protocolRegistered: false,
            repairProtocol: () => "등록하지 못했다");

        vm.RepairProtocolCommand.Execute(null);

        Assert.Contains("등록하지 못했다", vm.ProtocolStatusText);
    }
}
