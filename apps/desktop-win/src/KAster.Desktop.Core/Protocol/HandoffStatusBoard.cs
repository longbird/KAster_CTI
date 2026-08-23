namespace KAster.Desktop.Core.Protocol;

public enum HandoffState
{
    /// <summary>요청은 받았고 아직 결론이 안 났다.</summary>
    Pending,

    /// <summary>이 자리에 로그인까지 끝났다.</summary>
    Connected,

    /// <summary>넘겨받지 못했다. 웹 화면에 그대로 띄울 이유가 <see cref="HandoffStatus.Reason"/> 에 있다.</summary>
    Failed,
}

public sealed record HandoffStatus(HandoffState State, string? Reason = null)
{
    public static readonly HandoffStatus Pending = new(HandoffState.Pending);
    public static readonly HandoffStatus Connected = new(HandoffState.Connected);

    public static HandoffStatus Failed(string reason) => new(HandoffState.Failed, reason);

    /// <summary>웹앱이 읽는 값. `apps/web/src/utils/desktopBridge.ts` 와 글자까지 같아야 한다.</summary>
    public string Wire => State switch
    {
        HandoffState.Pending => "pending",
        HandoffState.Connected => "connected",
        _ => "failed",
    };
}

/// <summary>
/// 웹에서 넘긴 세션이 이 PC 에서 어떻게 됐는지. 웹앱이 브리지로 되물어 본다.
///
/// 적어 두지 않으면 웹 화면은 16번 물어본 끝에 "자동 연결을 완료하지 못했습니다" 를 띄운다 —
/// 실제로는 연결됐는데도. 상담원은 되던 것을 안 된다고 알게 된다.
///
/// 토큰은 60초 1회용이라 몇 개 이상 쌓일 일이 없지만, 한도를 안 두면 앱을 켜 둔 만큼 늘어난다.
/// </summary>
public sealed class HandoffStatusBoard
{
    private readonly int _capacity;
    private readonly object _gate = new();
    private readonly Dictionary<string, HandoffStatus> _byToken = new(StringComparer.Ordinal);
    private readonly Queue<string> _order = new();

    public HandoffStatusBoard(int capacity = 32) => _capacity = Math.Max(1, capacity);

    public void Mark(string? handoffToken, HandoffStatus status)
    {
        var token = handoffToken?.Trim();
        if (string.IsNullOrEmpty(token)) return;

        lock (_gate)
        {
            if (!_byToken.ContainsKey(token)) _order.Enqueue(token);
            _byToken[token] = status;

            while (_order.Count > _capacity) _byToken.Remove(_order.Dequeue());
        }
    }

    public HandoffStatus? Find(string? handoffToken)
    {
        var token = handoffToken?.Trim();
        if (string.IsNullOrEmpty(token)) return null;

        lock (_gate)
        {
            return _byToken.TryGetValue(token, out var status) ? status : null;
        }
    }
}
