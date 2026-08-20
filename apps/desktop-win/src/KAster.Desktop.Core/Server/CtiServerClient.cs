using System.Net.Http.Json;
using KAster.Desktop.Core.Contracts;
using KAster.Desktop.Core.Serialization;

namespace KAster.Desktop.Core.Server;

/// <summary>
/// 1단계에서 쓰는 REST 명령만 다룬다. 인증 헤더와 401 회전은 <see cref="TokenRefreshHandler"/> 가 맡으므로
/// 여기서는 경로와 본문만 책임진다.
/// </summary>
public sealed class CtiServerClient
{
    private readonly HttpClient _http;

    public CtiServerClient(HttpClient http) => _http = http;

    public async Task<IReadOnlyList<ActiveCall>> GetActiveCallsAsync(CancellationToken ct)
    {
        using var response = await _http.GetAsync("calls/active", ct);
        return await EnvelopeReader.ReadAsync<List<ActiveCall>>(response, ct);
    }

    public Task<CommandAck> OriginateAsync(
        string agentExtension,
        string phoneNumber,
        string? callerId,
        CancellationToken ct)
    {
        // callerId 는 서버가 허용 목록으로 검증하므로 고르지 않았으면 아예 보내지 않는다.
        object body = string.IsNullOrWhiteSpace(callerId)
            ? new { agentExtension, phoneNumber }
            : new { agentExtension, phoneNumber, callerId };

        return PostAsync<CommandAck>("calls/originate", body, ct);
    }

    public Task<CommandAck> AnswerAsync(string callId, CancellationToken ct)
        => PostAsync<CommandAck>($"calls/{Uri.EscapeDataString(callId)}/answer", new { }, ct);

    public Task<CommandAck> HangupAsync(string callId, CancellationToken ct)
        => PostAsync<CommandAck>($"calls/{Uri.EscapeDataString(callId)}/hangup", new { }, ct);

    public Task<CommandAck> MuteAsync(string callId, bool muted, CancellationToken ct)
        => PostAsync<CommandAck>(
            $"calls/{Uri.EscapeDataString(callId)}/mute",
            new { state = muted ? "on" : "off" },
            ct);

    public Task<AgentStatusChange> ChangeAgentStatusAsync(
        string agentId,
        AgentStatusCode statusCode,
        string? reasonCode,
        CancellationToken ct)
    {
        object body = string.IsNullOrWhiteSpace(reasonCode)
            ? new { statusCode = AgentStatusCodeConverter.ToWire(statusCode) }
            : new { statusCode = AgentStatusCodeConverter.ToWire(statusCode), reasonCode };

        return PostAsync<AgentStatusChange>($"agents/{Uri.EscapeDataString(agentId)}/status", body, ct);
    }

    private async Task<T> PostAsync<T>(string path, object body, CancellationToken ct)
    {
        using var response = await _http.PostAsJsonAsync(path, body, JsonDefaults.Options, ct);
        return await EnvelopeReader.ReadAsync<T>(response, ct);
    }
}
