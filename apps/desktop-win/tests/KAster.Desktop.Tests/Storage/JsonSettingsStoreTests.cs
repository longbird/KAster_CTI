using KAster.Desktop.Core.Storage;
using Xunit;

namespace KAster.Desktop.Tests.Storage;

public sealed record AudioPrefs
{
    public string InputDeviceId { get; init; } = "";
    public int RingVolume { get; init; } = 65;
}

public class JsonSettingsStoreTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "kaster-test-" + Guid.NewGuid().ToString("N"));

    [Fact]
    public void Returns_the_fallback_when_no_file_exists()
    {
        var store = new JsonSettingsStore<AudioPrefs>(Path.Combine(_dir, "audio.json"));

        var loaded = store.Load(new AudioPrefs());

        Assert.Equal(65, loaded.RingVolume);
    }

    [Fact]
    public void Round_trips_through_disk()
    {
        var store = new JsonSettingsStore<AudioPrefs>(Path.Combine(_dir, "audio.json"));

        store.Save(new AudioPrefs { InputDeviceId = "mic-1", RingVolume = 20 });
        var loaded = store.Load(new AudioPrefs());

        Assert.Equal("mic-1", loaded.InputDeviceId);
        Assert.Equal(20, loaded.RingVolume);
    }

    [Fact]
    public void Corrupt_json_falls_back_instead_of_throwing()
    {
        var path = Path.Combine(_dir, "audio.json");
        Directory.CreateDirectory(_dir);
        File.WriteAllText(path, "{ this is not json");
        var store = new JsonSettingsStore<AudioPrefs>(path);

        var loaded = store.Load(new AudioPrefs { RingVolume = 40 });

        Assert.Equal(40, loaded.RingVolume);
    }

    public void Dispose()
    {
        if (Directory.Exists(_dir)) Directory.Delete(_dir, recursive: true);
    }
}
