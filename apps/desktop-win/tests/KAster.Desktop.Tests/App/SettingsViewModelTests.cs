using KAster.Desktop.App.Services;
using KAster.Desktop.App.ViewModels;
using KAster.Desktop.Core.Storage;
using KAster.Desktop.Softphone.Audio;
using Xunit;

namespace KAster.Desktop.Tests.App;

/// <summary>디스크를 쓰지 않는 저장소. 테스트가 실제 사용자 설정 파일을 건드리면 안 된다.</summary>
internal sealed class MemoryStore<T> : ISettingsStore<T>
{
    private T _value;

    public MemoryStore(T initial) => _value = initial;

    public T Load() => _value;

    public void Save(T value) => _value = value;
}

internal sealed class FakeDevices : IAudioDeviceEnumerator
{
    public List<AudioDeviceInfo> Capture { get; } = new();
    public List<AudioDeviceInfo> Render { get; } = new();

    public IReadOnlyList<AudioDeviceInfo> List(AudioDeviceKind kind)
        => kind == AudioDeviceKind.Capture ? Capture : Render;

    public AudioDeviceInfo? Default(AudioDeviceKind kind)
        => List(kind).FirstOrDefault(d => d.IsDefault);
}

public class SettingsViewModelTests
{
    private static FakeDevices Devices()
    {
        var devices = new FakeDevices();
        devices.Capture.Add(new AudioDeviceInfo("cap-1", "헤드셋 마이크", AudioDeviceKind.Capture, true));
        devices.Capture.Add(new AudioDeviceInfo("cap-2", "웹캠 마이크", AudioDeviceKind.Capture, false));
        devices.Render.Add(new AudioDeviceInfo("out-1", "헤드셋", AudioDeviceKind.Render, true));
        devices.Render.Add(new AudioDeviceInfo("out-2", "스피커", AudioDeviceKind.Render, false));
        return devices;
    }

    private static SettingsViewModel Build(
        bool useSoftphone = true,
        string url = "http://server:3000/api/v1/",
        AudioDeviceSelection? selection = null,
        FakeDevices? devices = null)
        => new(
            new MemoryStore<AppSettings>(new AppSettings { ServerBaseUrl = url }),
            new MemoryStore<AudioDeviceSelection>(selection ?? new AudioDeviceSelection()),
            devices ?? Devices(),
            useSoftphone);

    [Fact]
    public void Opens_with_the_address_currently_in_use()
    {
        var vm = Build(url: "http://49.247.46.86:3000/api/v1/");

        Assert.Equal("http://49.247.46.86:3000/api/v1/", vm.ServerBaseUrl);
    }

    /// <summary>주소를 잘못 넣으면 앱이 아무 서버에도 못 붙는다. 저장 전에 막는다.</summary>
    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("서버주소")]
    [InlineData("ftp://server/api")]
    public void A_broken_address_cannot_be_saved(string bad)
    {
        var vm = Build();
        vm.ServerBaseUrl = bad;

        Assert.False(vm.SaveCommand.CanExecute(null));
        Assert.NotNull(vm.ServerUrlError);
    }

    [Theory]
    [InlineData("http://49.247.46.86:3000/api/v1/")]
    [InlineData("https://pbx.example.com/api/v1")]
    public void A_usable_address_is_accepted(string good)
    {
        var vm = Build();
        vm.ServerBaseUrl = good;

        Assert.True(vm.SaveCommand.CanExecute(null));
        Assert.Null(vm.ServerUrlError);
    }

    [Fact]
    public void Saving_keeps_the_address_for_the_next_launch()
    {
        var store = new MemoryStore<AppSettings>(new AppSettings());
        var vm = new SettingsViewModel(
            store, new MemoryStore<AudioDeviceSelection>(new AudioDeviceSelection()), Devices(), true);
        vm.ServerBaseUrl = "http://pbx.local:3000/api/v1/";

        vm.SaveCommand.Execute(null);

        Assert.Equal("http://pbx.local:3000/api/v1/", store.Load().ServerBaseUrl);
    }

    [Fact]
    public void The_device_lists_are_offered_with_a_default_entry()
    {
        var vm = Build();

        // 첫 항목은 "시스템 기본". 고르지 않으면 OS 가 정한 통화용 장치를 쓴다.
        Assert.Null(vm.CaptureDevices[0].Id);
        Assert.Equal(new[] { null, "cap-1", "cap-2" }, vm.CaptureDevices.Select(d => d.Id));
        Assert.Equal(new[] { null, "out-1", "out-2" }, vm.CallRenderDevices.Select(d => d.Id));
    }

    [Fact]
    public void Saving_keeps_the_chosen_devices()
    {
        var store = new MemoryStore<AudioDeviceSelection>(new AudioDeviceSelection());
        var vm = new SettingsViewModel(
            new MemoryStore<AppSettings>(new AppSettings()), store, Devices(), true);

        vm.SelectedCapture = vm.CaptureDevices.Single(d => d.Id == "cap-2");
        vm.SelectedCallRender = vm.CallRenderDevices.Single(d => d.Id == "out-2");
        vm.SelectedRingRender = vm.RingRenderDevices.Single(d => d.Id == "out-1");
        vm.SaveCommand.Execute(null);

        Assert.Equal("cap-2", store.Load().CaptureDeviceId);
        Assert.Equal("out-2", store.Load().CallRenderDeviceId);
        Assert.Equal("out-1", store.Load().RingRenderDeviceId);
    }

    [Fact]
    public void A_previous_choice_comes_back_selected()
    {
        var vm = Build(selection: new AudioDeviceSelection { CaptureDeviceId = "cap-2" });

        Assert.Equal("cap-2", vm.SelectedCapture?.Id);
    }

    /// <summary>없어진 장치를 골라 둔 채로 두면 통화가 엉뚱한 곳으로 나간다. 기본으로 되돌린다.</summary>
    [Fact]
    public void A_device_that_is_gone_falls_back_to_the_default_entry()
    {
        var vm = Build(selection: new AudioDeviceSelection { CaptureDeviceId = "사라진-장치" });

        Assert.Null(vm.SelectedCapture?.Id);
    }

    /// <summary>실기기 모드에는 우리 오디오가 없다. 고를 것을 보여 주면 안 고른 줄 알고 헤맨다.</summary>
    [Fact]
    public void A_desk_phone_has_no_audio_devices_to_choose()
    {
        var vm = Build(useSoftphone: false);

        Assert.False(vm.ShowsAudioDevices);
    }

    [Fact]
    public void A_softphone_does()
    {
        Assert.True(Build(useSoftphone: true).ShowsAudioDevices);
    }

    /// <summary>주소가 바뀌면 지금 붙어 있는 서버와 달라진다. 그 사실을 말해야 한다.</summary>
    [Fact]
    public void Changing_the_address_says_it_takes_effect_after_signing_in_again()
    {
        var vm = Build(url: "http://a/api/v1/");
        Assert.False(vm.ServerUrlChanged);

        vm.ServerBaseUrl = "http://b/api/v1/";

        Assert.True(vm.ServerUrlChanged);
    }
}
