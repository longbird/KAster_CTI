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

    /// <summary>
    /// 큐 대기 현황. <b>WS <c>queue.summary.updated</c> 대신 이 경로를 쓴다</b> —
    /// 그쪽 브로드캐스트는 테넌트로 좁혀지지 않아 남의 테넌트 큐가 섞여 오고, 필드도 적다.
    /// 이 경로는 <c>JwtAuthGuard</c> 만이라 상담원도 부를 수 있다.
    /// </summary>
    public async Task<IReadOnlyList<QueueStatusRow>> GetQueueSummaryAsync(CancellationToken ct)
    {
        using var response = await _http.GetAsync("queues/summary", ct);
        return (await EnvelopeReader.ReadAsync<QueueSummaryResponse>(response, ct)).Queues;
    }

    /// <summary>
    /// 이 상담원이 볼 공지. 대상 앱과 게시 기간은 서버가 이미 거르고 고정 공지를 위로 올려 준다 —
    /// 쿼리 파라미터가 없고, 클라이언트가 다시 거르지 않는다.
    ///
    /// 읽음 처리 경로는 <b>부르지 않는다</b>. <c>POST admin/announcements/{id}/read</c> 는
    /// supervisor/admin 전용이라 상담원이 부르면 403 이다. 읽음 표시는 이 PC 안에만 남는다.
    /// </summary>
    public async Task<IReadOnlyList<Announcement>> GetAnnouncementsAsync(CancellationToken ct)
    {
        using var response = await _http.GetAsync("announcements", ct);
        return await EnvelopeReader.ReadAsync<List<Announcement>>(response, ct);
    }

    /// <summary>
    /// 이 상담원의 지난 통화. <b>agentId 를 반드시 싣는다</b> — 빼면 서버가 테넌트
    /// 전체의 통화를 돌려주고, 상담원이 남의 통화 기록을 보게 된다.
    /// </summary>
    public async Task<IReadOnlyList<CallHistoryEntry>> GetCallHistoryAsync(
        string agentId,
        int limit,
        CancellationToken ct)
    {
        var path = $"calls/history?agentId={Uri.EscapeDataString(agentId)}&limit={limit}";
        using var response = await _http.GetAsync(path, ct);
        return await EnvelopeReader.ReadAsync<List<CallHistoryEntry>>(response, ct);
    }

    /// <summary>이 상담원의 발신 권한과 쓸 수 있는 발신번호.</summary>
    public async Task<CallCapabilities> GetCallCapabilitiesAsync(CancellationToken ct)
    {
        using var response = await _http.GetAsync("me/call-capabilities", ct);
        return await EnvelopeReader.ReadAsync<CallCapabilities>(response, ct);
    }

    /// <summary>
    /// 이 PBX 가 통화 중에 받아 주는 제어. <b>발신 권한과 다른 경로다</b> —
    /// <c>me/call-capabilities</c> 에는 이 블록이 없고 <c>me/session</c> 에만 있다.
    ///
    /// 블록이 통째로 없는 현장을 대비해 기본값(전부 불가)으로 떨어진다. 없는 기능의 버튼을
    /// 열어 두면 상담원이 통화 중에 눌러 보고 나서야 400 을 받는다.
    /// </summary>
    public async Task<CallControlCapabilities> GetCallControlCapabilitiesAsync(CancellationToken ct)
    {
        using var response = await _http.GetAsync("me/session", ct);
        var session = await EnvelopeReader.ReadAsync<SessionControlResponse>(response, ct);
        return session.CallControlCapabilities ?? new CallControlCapabilities();
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

    /// <summary>
    /// 당겨받기. 옆자리에 울리는 전화를 내 내선으로 끌어온다.
    /// 서버는 큐 대기(QUEUED) 또는 상담원 호출 중(RINGING_AGENT) 일 때만 받아 준다.
    /// </summary>
    public Task<CommandAck> PickupAsync(string callId, CancellationToken ct)
        => PostAsync<CommandAck>($"calls/{Uri.EscapeDataString(callId)}/pickup", new { }, ct);

    /// <summary>
    /// 큐가 물어본 호에 답한다. 수락하면 전화기가 연결되고, 거절하면 다음 상담원에게 넘어간다.
    /// 답하지 않으면 서버가 정해진 시간 뒤에 알아서 넘긴다.
    /// </summary>
    public Task<CommandAck> RespondToOfferAsync(
        string linkedid,
        string extension,
        bool accept,
        CancellationToken ct)
        => PostAsync<CommandAck>(
            "client/call-commands/offer/decision",
            new { linkedid, extension, decision = accept ? "ACCEPT" : "REJECT" },
            ct);

    public Task<CommandAck> AnswerAsync(string callId, CancellationToken ct)
        => PostAsync<CommandAck>($"calls/{Uri.EscapeDataString(callId)}/answer", new { }, ct);

    /// <summary>
    /// 통화를 다른 내선으로 넘긴다. blind — 협의 없이 바로 넘어간다.
    /// 서버는 상담원 leg 를 찾아 transfer-target 으로 점프시킨다.
    /// </summary>
    public Task<CommandAck> TransferAsync(
        string callId,
        string target,
        string fromExtension,
        CancellationToken ct)
        => PostAsync<CommandAck>(
            $"calls/{Uri.EscapeDataString(callId)}/transfer",
            new { transferType = "blind", target, fromExtension },
            ct);

    /// <summary>
    /// 협의 통화를 연다. attended 전환의 첫 단계다 — 상대에게 먼저 사정을 말하고 넘긴다.
    /// 내 내선은 서버가 토큰에서 꺼내므로 보내지 않는다.
    ///
    /// <b>이것을 먼저 부르지 않으면</b> 완료도 취소도 서버가 400 으로 막는다. 열린 협의가
    /// 있어야만 닫을 것이 있기 때문이다.
    /// </summary>
    public Task<CommandAck> StartConsultationAsync(string callId, string target, CancellationToken ct)
        => PostAsync<CommandAck>(
            $"calls/{Uri.EscapeDataString(callId)}/consultation",
            new { target },
            ct);

    /// <summary>
    /// 협의를 끝내고 두 사람을 붙인 뒤 빠진다. 본문이 없다 — 무엇을 완료할지는 서버가 안다.
    ///
    /// 접수됐다고 넘어간 것은 아니다. 서버는 feature code 를 DTMF 로 넣을 뿐이고,
    /// 실제 완료는 뒤따라오는 <c>AttendedTransfer</c> 이벤트로 판정된다.
    /// </summary>
    public Task<CommandAck> CompleteAttendedTransferAsync(string callId, CancellationToken ct)
        => PostAsync<CommandAck>(
            $"calls/{Uri.EscapeDataString(callId)}/transfer/attended/complete",
            new { },
            ct);

    /// <summary>
    /// 협의를 접고 원 통화로 돌아간다. 실제 복귀는 PBX 의 atxferabort 설정에 달려 있어
    /// 서버도 성공 여부를 모른다.
    /// </summary>
    public Task<CommandAck> CancelAttendedTransferAsync(string callId, CancellationToken ct)
        => PostAsync<CommandAck>(
            $"calls/{Uri.EscapeDataString(callId)}/transfer/attended/cancel",
            new { },
            ct);

    public Task<CommandAck> HangupAsync(string callId, CancellationToken ct)
        => PostAsync<CommandAck>($"calls/{Uri.EscapeDataString(callId)}/hangup", new { }, ct);

    /// <summary>
    /// 통화를 보류한다. 본문이 없다 — 파라미터는 통화 하나뿐이다.
    /// 접수됐다고 보류가 걸린 것은 아니다. 서버는 feature code 를 DTMF 로 넣을 뿐이고,
    /// 실제 상태는 뒤따라오는 <c>Hold</c> 이벤트로 판정된다.
    /// </summary>
    public Task<CommandAck> HoldAsync(string callId, CancellationToken ct)
        => PostAsync<CommandAck>($"calls/{Uri.EscapeDataString(callId)}/hold", new { }, ct);

    public Task<CommandAck> ResumeAsync(string callId, CancellationToken ct)
        => PostAsync<CommandAck>($"calls/{Uri.EscapeDataString(callId)}/resume", new { }, ct);

    /// <summary>
    /// 통화 중 키 입력. <b>실기기 상담원 전용 경로다</b> — 소프트폰은 자기 SIP 다이얼로그로 직접 보낸다.
    /// 서버가 상담원 leg 에 AMI PlayDTMF 로 넣는다. <c>0-9 * #</c> 만, 최대 32자리.
    /// </summary>
    public Task<CommandAck> SendDtmfAsync(string callId, string digits, CancellationToken ct)
        => PostAsync<CommandAck>($"calls/{Uri.EscapeDataString(callId)}/dtmf", new { digits }, ct);

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

    /// <summary>
    /// <c>me/session</c> 응답에서 우리가 읽는 부분만. 세션 전체를 형으로 받지 않는 이유는
    /// 이 조회의 목적이 버튼을 열지 말지 하나뿐이기 때문이다 — 다른 블록이 바뀌어도 여기서 깨지면 안 된다.
    /// </summary>
    private sealed record SessionControlResponse
    {
        public CallControlCapabilities? CallControlCapabilities { get; init; }
    }
}
