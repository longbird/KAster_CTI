using System.Globalization;
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
    /// <summary>서버가 이 값 하나만 받는다. 다르면 발신 명령을 통째로 거부한다.</summary>
    private const string ClientCommandProtocol = "kaster-desktop-v1";

    private readonly HttpClient _http;

    public CtiServerClient(HttpClient http) => _http = http;

    public async Task<IReadOnlyList<ActiveCall>> GetActiveCallsAsync(CancellationToken ct)
    {
        using var response = await _http.GetAsync("calls/active", ct);
        return await EnvelopeReader.ReadAsync<List<ActiveCall>>(response, ct);
    }

    /// <summary>
    /// 상담원 발신.
    ///
    /// <c>calls/originate</c> 가 아니라 이 전용 경로를 쓴다. 그쪽은 supervisor/admin 에게만 열려 있고
    /// 상담원이 부르면 403 이다. 여기서는 <b>내선을 본문에 싣지 않는다</b> — 서버가 인증 세션에서 꺼내므로
    /// 남의 내선으로 거는 길 자체가 없다.
    ///
    /// 헤더 다섯 개가 모두 있어야 접수된다. 시각은 서버와 60초 안쪽이어야 하고, nonce 는 재사용되면 거부된다
    /// (같은 명령이 두 번 나가 전화가 두 통 걸리는 것을 막는다).
    /// </summary>
    public async Task<CommandAck> OriginateAsync(
        string phoneNumber,
        string? callerId,
        CancellationToken ct)
    {
        // callerId 는 서버가 허용 목록으로 검증하므로 고르지 않았으면 아예 보내지 않는다.
        var commandId = Guid.NewGuid().ToString();
        object body = string.IsNullOrWhiteSpace(callerId)
            ? new { commandId, phoneNumber }
            : new { commandId, phoneNumber, callerId };

        using var request = new HttpRequestMessage(HttpMethod.Post, "client/call-commands/originate")
        {
            Content = JsonContent.Create(body, options: JsonDefaults.Options),
        };
        request.Headers.TryAddWithoutValidation("x-client-protocol", ClientCommandProtocol);
        request.Headers.TryAddWithoutValidation(
            "x-command-timestamp",
            DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString(CultureInfo.InvariantCulture));
        request.Headers.TryAddWithoutValidation("x-command-nonce", Guid.NewGuid().ToString("N"));
        request.Headers.TryAddWithoutValidation("x-correlation-id", Guid.NewGuid().ToString());
        request.Headers.TryAddWithoutValidation("idempotency-key", Guid.NewGuid().ToString());

        using var response = await _http.SendAsync(request, ct);
        return await EnvelopeReader.ReadAsync<CommandAck>(response, ct);
    }

    /// <summary>같은 상담원끼리 거는 내선 통화. 외부 발신과 달리 명령 프로토콜 헤더가 필요 없다.</summary>
    public Task<CommandAck> OriginateInternalAsync(string targetExtension, CancellationToken ct)
        => PostAsync<CommandAck>("calls/originate/internal", new { targetExtension }, ct);

    /// <summary>같은 테넌트의 상담원 목록. 건 번호가 내선인지 가르는 데 쓴다.</summary>
    public async Task<IReadOnlyList<AgentDirectoryEntry>> GetAgentDirectoryAsync(CancellationToken ct)
    {
        using var response = await _http.GetAsync("agents", ct);
        return await EnvelopeReader.ReadAsync<List<AgentDirectoryEntry>>(response, ct);
    }

    /// <summary>이 상담원의 발신 권한과 쓸 수 있는 발신번호.</summary>
    public async Task<CallCapabilities> GetCallCapabilitiesAsync(CancellationToken ct)
    {
        using var response = await _http.GetAsync("me/call-capabilities", ct);
        return await EnvelopeReader.ReadAsync<CallCapabilities>(response, ct);
    }

    /// <summary>
    /// 상담 메모. 서버는 후처리 코드와 같은 표에 넣으므로 상담원 id 와 종류를 함께 받는다.
    /// <c>acw</c> 는 통화 후 작성이라는 뜻이다.
    /// </summary>
    public Task<object> SaveMemoAsync(string callId, string agentId, string memoText, CancellationToken ct)
        => PostAsync<object>(
            $"calls/{Uri.EscapeDataString(callId)}/memo",
            new { agentId, memoType = "acw", memoText, isFinal = true },
            ct);

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
