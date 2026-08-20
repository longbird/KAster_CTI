using System.Text.Json;
using KAster.Desktop.Core.Serialization;

namespace KAster.Desktop.Core.Storage;

/// <summary>
/// JSON 파일 하나에 설정을 보관한다. 저장은 임시 파일에 쓰고 옮기므로 도중에 죽어도 반쪽 파일이 남지 않는다.
/// </summary>
public sealed class JsonSettingsStore<T>
{
    private readonly string _path;
    private readonly object _gate = new();

    public JsonSettingsStore(string path) => _path = path;

    public T Load(T fallback)
    {
        lock (_gate)
        {
            try
            {
                if (!File.Exists(_path)) return fallback;
                var json = File.ReadAllText(_path);
                return JsonSerializer.Deserialize<T>(json, JsonDefaults.Options) ?? fallback;
            }
            catch (Exception ex) when (ex is IOException or JsonException or UnauthorizedAccessException)
            {
                // 설정이 깨졌다고 앱이 못 뜨면 안 된다. 기본값으로 계속 간다.
                return fallback;
            }
        }
    }

    public void Save(T value)
    {
        lock (_gate)
        {
            var dir = Path.GetDirectoryName(_path);
            if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);

            var tmp = _path + ".tmp";
            File.WriteAllText(tmp, JsonSerializer.Serialize(value, JsonDefaults.Options));
            File.Move(tmp, _path, overwrite: true);
        }
    }
}
