using KAster.Desktop.App.Services;
using KAster.Desktop.App.ViewModels;
using KAster.Desktop.Core.Storage;
using KAster.Desktop.Softphone.Audio;
using Xunit;

namespace KAster.Desktop.Tests.App;

/// <summary>
/// 설정 화면이 <b>실제 파일 저장소</b>로 선다.
///
/// 다른 설정 테스트는 전부 <c>MemoryStore</c> 를 쓴다. 그래서 저장소를 기본값 없이 만들어
/// 인터페이스로 읽는 순간 터지는 결함을 하나도 못 잡았고, 상담원 PC 에서 "설정을 눌러도
/// 아무 일이 없는" 증상으로만 드러났다 (2026-08-23). 여기만은 앱이 건네는 것과 같은 것을 쓴다.
/// </summary>
public class SettingsRealStoreTests : IDisposable
{
    private readonly string _dir = Path.Combine(
        Path.GetTempPath(), "kaster-settings-" + Guid.NewGuid().ToString("N"));

    private string At(string name) => Path.Combine(_dir, name);

    [Fact]
    public void Stands_up_with_the_stores_the_app_hands_it()
    {
        var devices = new FakeDevices();
        devices.Capture.Add(new AudioDeviceInfo("cap-1", "헤드셋 마이크", AudioDeviceKind.Capture, true));
        devices.Render.Add(new AudioDeviceInfo("out-1", "헤드셋", AudioDeviceKind.Render, true));

        var vm = new SettingsViewModel(
            new JsonSettingsStore<AppSettings>(At("settings.json"), new AppSettings()),
            new JsonSettingsStore<AudioDeviceSelection>(At("audio.json"), new AudioDeviceSelection()),
            devices,
            useSoftphone: true,
            hotkeys: new JsonSettingsStore<HotkeySettings>(At("hotkeys.json"), new HotkeySettings()),
            callPreferences: new JsonSettingsStore<CallPreferences>(
                At("call.json"), new CallPreferences()),
            transferHotkeys: new JsonSettingsStore<TransferHotkeySettings>(
                At("transfer.json"), new TransferHotkeySettings()),
            general: new JsonSettingsStore<GeneralPreferences>(
                At("general.json"), new GeneralPreferences()),
            applyHotkeys: _ => Array.Empty<string>());

        Assert.NotNull(vm.TransferHotkeys);
    }

    public void Dispose()
    {
        if (Directory.Exists(_dir)) Directory.Delete(_dir, recursive: true);
    }
}
