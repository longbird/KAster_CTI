using System.Text.Json;
using KAster.Desktop.Core.Serialization;

namespace KAster.Desktop.Core.Storage;

/// <summary>
/// 설정 한 덩어리를 읽고 쓴다. 인터페이스로 끊어 두면 테스트가 실제 사용자 파일을 건드리지 않는다.
/// </summary>
public interface ISettingsStore<T>
{
    T Load();

    void Save(T value);
}

/// <summary>
/// JSON 파일 하나에 설정을 보관한다. 저장은 임시 파일에 쓰고 옮기므로 도중에 죽어도 반쪽 파일이 남지 않는다.
/// </summary>
public sealed class JsonSettingsStore<T> : ISettingsStore<T>
{
    private readonly string _path;
    private readonly object _gate = new();
    /// <summary>
    /// <see cref="ISettingsStore{T}"/> 로 읽을 때 쓸 기본값. 파일이 없거나 깨졌을 때 돌려준다.
    /// 이 생성자를 안 쓰면 <see cref="Load(T)"/> 로 그때그때 넘겨야 한다.
    /// </summary>
    private readonly T? _fallback;

    public JsonSettingsStore(string path) => _path = path;

    public JsonSettingsStore(string path, T fallback)
    {
        _path = path;
        _fallback = fallback;
    }

    T ISettingsStore<T>.Load()
        => _fallback is null
            ? throw new InvalidOperationException("기본값 없이 만든 저장소는 Load(fallback) 으로 읽어야 한다")
            : Load(_fallback);

    void ISettingsStore<T>.Save(T value) => Save(value);

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
