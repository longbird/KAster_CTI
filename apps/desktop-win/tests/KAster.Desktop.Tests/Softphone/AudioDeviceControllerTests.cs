using KAster.Desktop.Softphone.Audio;
using Xunit;

namespace KAster.Desktop.Tests.Softphone;

internal sealed class FakeDeviceEnumerator : IAudioDeviceEnumerator
{
    private readonly List<AudioDeviceInfo> _devices;

    public FakeDeviceEnumerator(params AudioDeviceInfo[] devices) => _devices = devices.ToList();

    public IReadOnlyList<AudioDeviceInfo> List(AudioDeviceKind kind)
        => _devices.Where(d => d.Kind == kind).ToArray();

    public AudioDeviceInfo? Default(AudioDeviceKind kind)
        => _devices.FirstOrDefault(d => d.Kind == kind && d.IsDefault);
}

public class AudioDeviceControllerTests
{
    private static readonly AudioDeviceInfo Headset =
        new("cap-headset", "헤드셋 마이크", AudioDeviceKind.Capture, IsDefault: false);

    private static readonly AudioDeviceInfo BuiltInMic =
        new("cap-builtin", "내장 마이크", AudioDeviceKind.Capture, IsDefault: true);

    private static readonly AudioDeviceInfo HeadsetOut =
        new("out-headset", "헤드셋", AudioDeviceKind.Render, IsDefault: false);

    private static readonly AudioDeviceInfo Speakers =
        new("out-speakers", "스피커", AudioDeviceKind.Render, IsDefault: true);

    [Fact]
    public void Uses_the_saved_device_when_it_is_still_present()
    {
        var controller = new AudioDeviceController(new FakeDeviceEnumerator(Headset, BuiltInMic, HeadsetOut, Speakers));

        var resolved = controller.Resolve(new AudioDeviceSelection
        {
            CaptureDeviceId = "cap-headset",
            CallRenderDeviceId = "out-headset",
        });

        Assert.Equal("cap-headset", resolved.Capture!.Id);
        Assert.Equal("out-headset", resolved.CallRender!.Id);
    }

    [Fact]
    public void Falls_back_to_the_default_device_when_the_saved_one_disappeared()
    {
        var controller = new AudioDeviceController(new FakeDeviceEnumerator(BuiltInMic, Speakers));

        var resolved = controller.Resolve(new AudioDeviceSelection
        {
            CaptureDeviceId = "cap-headset",
            CallRenderDeviceId = "out-headset",
        });

        Assert.Equal("cap-builtin", resolved.Capture!.Id);
        Assert.Equal("out-speakers", resolved.CallRender!.Id);
    }

    [Fact]
    public void Raises_a_notice_when_it_falls_back()
    {
        var controller = new AudioDeviceController(new FakeDeviceEnumerator(BuiltInMic, Speakers));
        var notices = new List<string>();
        controller.FellBackToDefault += (_, message) => notices.Add(message);

        controller.Resolve(new AudioDeviceSelection { CaptureDeviceId = "cap-headset" });

        Assert.Single(notices);
        Assert.Contains("내장 마이크", notices[0]);
    }

    [Fact]
    public void Keeps_the_ring_output_independent_from_the_call_output()
    {
        var controller = new AudioDeviceController(new FakeDeviceEnumerator(BuiltInMic, HeadsetOut, Speakers));

        var resolved = controller.Resolve(new AudioDeviceSelection
        {
            CallRenderDeviceId = "out-headset",
            RingRenderDeviceId = "out-speakers",
        });

        // 통화는 헤드셋, 벨소리는 스피커. 자리를 비운 상담원이 벨을 놓치지 않게 하는 현장 요구다.
        Assert.Equal("out-headset", resolved.CallRender!.Id);
        Assert.Equal("out-speakers", resolved.RingRender!.Id);
    }

    [Fact]
    public void The_ring_output_follows_the_call_output_when_it_was_never_chosen()
    {
        var controller = new AudioDeviceController(new FakeDeviceEnumerator(BuiltInMic, HeadsetOut, Speakers));

        var resolved = controller.Resolve(new AudioDeviceSelection { CallRenderDeviceId = "out-headset" });

        Assert.Equal("out-headset", resolved.RingRender!.Id);
    }

    [Fact]
    public void Returns_nothing_instead_of_throwing_when_the_machine_has_no_device()
    {
        var controller = new AudioDeviceController(new FakeDeviceEnumerator());

        var resolved = controller.Resolve(new AudioDeviceSelection());

        Assert.Null(resolved.Capture);
        Assert.Null(resolved.CallRender);
        Assert.Null(resolved.RingRender);
    }

    [Fact]
    public void Does_not_raise_a_notice_when_nothing_was_saved()
    {
        var controller = new AudioDeviceController(new FakeDeviceEnumerator(BuiltInMic, Speakers));
        var notices = new List<string>();
        controller.FellBackToDefault += (_, message) => notices.Add(message);

        controller.Resolve(new AudioDeviceSelection());

        Assert.Empty(notices);
    }
}
