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

    /// <summary>
    /// <c>data</c> 가 <b>비어 있는 것이 정상</b>인 응답용. 업데이트 manifest 는 승인된 릴리스가
    /// 없으면 404 가 아니라 <c>success: true, data: null</c> 로 온다 — 그것을 오류로 다루면
    /// 아직 릴리스를 안 올린 현장에서 확인할 때마다 오류가 뜬다.
    ///
    /// 실패(<c>success: false</c> 또는 오류 상태 코드)는 그대로 던진다. "없다" 와 "못 물어봤다" 는 다르다.
    /// </summary>
    public static async Task<T?> ReadOptionalAsync<T>(HttpResponseMessage response, CancellationToken ct)
        where T : class
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

        if (envelope is { Success: true })
        {
            return envelope.Data;
        }

        var message = envelope?.Error?.Message
            ?? $"서버가 {(int)response.StatusCode} 로 응답했다";
        throw new CtiServerException(message, envelope?.Error?.Code, (int)response.StatusCode);
    }
}
