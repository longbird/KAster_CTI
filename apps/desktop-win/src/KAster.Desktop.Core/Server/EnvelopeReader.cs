using System.Net.Http.Json;
using System.Text.Json;
using KAster.Desktop.Core.Contracts;
using KAster.Desktop.Core.Serialization;

namespace KAster.Desktop.Core.Server;

/// <summary>
/// 서버 응답의 <c>{ success, data, error }</c> 봉투를 벗긴다. 실패면 <see cref="CtiServerException"/> 을 던진다.
/// </summary>
internal static class EnvelopeReader
{
    public static async Task<T> ReadAsync<T>(HttpResponseMessage response, CancellationToken ct)
    {
        ApiEnvelope<T>? envelope = null;
        try
        {
            envelope = await response.Content.ReadFromJsonAsync<ApiEnvelope<T>>(JsonDefaults.Options, ct);
        }
        catch (JsonException)
        {
            // 봉투가 아닌 응답(프록시 오류 페이지 등)은 아래에서 상태 코드로 처리한다.
        }

        if (envelope is { Success: true, Data: not null })
        {
            return envelope.Data;
        }

        var message = envelope?.Error?.Message
            ?? $"서버가 {(int)response.StatusCode} 로 응답했다";
        throw new CtiServerException(message, envelope?.Error?.Code, (int)response.StatusCode);
    }
}
