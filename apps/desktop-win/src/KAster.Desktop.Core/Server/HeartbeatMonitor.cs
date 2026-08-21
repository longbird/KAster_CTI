namespace KAster.Desktop.Core.Server;

/// <summary>
/// 실시간 연결이 살아 있는지 판단한다.
///
/// 소켓이 조용히 죽는 경우가 있다. 서버가 내려가도 클라이언트 쪽 TCP 가 끝났다는 통지를 못 받으면
/// 라이브러리는 계속 "연결됨"이라고 답한다. 그러면 상담원 화면은 멀쩡해 보이는데 전화 팝업이
/// 하나도 안 뜬다 — 가장 나쁜 실패다.
///
/// 그래서 서버가 보내는 주기 신호(ping)와 이벤트 수신 시각을 기록해 두고, 일정 시간 아무것도
/// 오지 않으면 끊긴 것으로 본다. 사무실 무전기로 치면 정기 교신이 끊긴 시점을 세는 것이다.
/// </summary>
public sealed class HeartbeatMonitor
{
    private readonly TimeSpan _timeout;
    private DateTimeOffset? _lastBeat;

    public HeartbeatMonitor(TimeSpan timeout) => _timeout = timeout;

    public void Beat(DateTimeOffset now) => _lastBeat = now;

    public void Stop() => _lastBeat = null;

    /// <summary>한 번도 신호를 받지 못한 상태(연결 전)는 끊김으로 보지 않는다.</summary>
    public bool IsStale(DateTimeOffset now)
        => _lastBeat is { } last && now - last > _timeout;
}
