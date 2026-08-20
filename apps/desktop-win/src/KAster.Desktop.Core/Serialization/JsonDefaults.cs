using System.Text.Json;

namespace KAster.Desktop.Core.Serialization;

/// <summary>
/// 서버는 camelCase 로 응답한다. 직렬화 옵션을 한 곳에서만 정의해
/// 호출 지점마다 다른 옵션을 쓰는 일이 없게 한다.
/// </summary>
public static class JsonDefaults
{
    public static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
    };
}
