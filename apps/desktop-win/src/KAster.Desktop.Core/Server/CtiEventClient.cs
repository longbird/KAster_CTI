using System.Text.Json;
using KAster.Desktop.Core.Contracts;
using SocketIOClient;

namespace KAster.Desktop.Core.Server;

public enum CtiConnectionState
{
    Disconnected,
    Connecting,
    Connected,
}

/// <summary>
/// 서버의 <c>/ws</c> 네임스페이스(Socket.IO v4 / Engine.IO v4)를 구독한다.
///
/// 라이브러리 자동 재연결은 끈다. access token 이 15분이면 만료되는데 자동 재연결은 처음 붙을 때의
/// 토큰을 그대로 다시 쓰기 때문이다. 재연결은 <see cref="ReconnectPolicy"/> 가 새 토큰으로 다시 붙이는 쪽이 맞다.
/// </summary>
public sealed class CtiEventClient : IAsyncDisposable
{
    private readonly Uri _namespaceUri;
    private readonly Func<string?> _accessTokenProvider;
    private readonly SemaphoreSlim _gate = new(1, 1);

    /// <summary>Engine.IO v4 서버는 25초마다 ping 을 보낸다. 45초면 두 번을 놓친 것이다.</summary>
    private static readonly TimeSpan HeartbeatTimeout = TimeSpan.FromSeconds(45);

    private readonly HeartbeatMonitor _heartbeat = new(HeartbeatTimeout);
    private Timer? _watchdog;
    private SocketIO? _socket;
    private CtiConnectionState _state = CtiConnectionState.Disconnected;

    public CtiEventClient(Uri serverBaseUri, Func<string?> accessTokenProvider)
    {
        _namespaceUri = new Uri(serverBaseUri, "/ws");
        _accessTokenProvider = accessTokenProvider;
    }

    public event EventHandler<CtiEvent>? EventReceived;
    public event EventHandler<CtiConnectionState>? ConnectionStateChanged;

    /// <summary>파싱하지 못한 이벤트. 서버가 새 이벤트를 추가했을 때 로그로 남기기 위한 것이다.</summary>
    public event EventHandler<string>? UnparsedEvent;

    /// <summary>
    /// 구독자가 던진 예외. 이걸 소켓 라이브러리로 흘려보내면 조용히 삼켜져서
    /// "이벤트는 왔는데 화면이 안 바뀐다" 가 된다.
    /// </summary>
    public event EventHandler<Exception>? HandlerFailed;

    public bool IsConnected => _socket?.Connected == true;

    public async Task ConnectAsync(CancellationToken ct)
    {
        await _gate.WaitAsync(ct);
        try
        {
            await CloseAsync();

            var token = _accessTokenProvider()
                ?? throw new CtiServerException("실시간 연결에 쓸 access token 이 없다");

            var socket = new SocketIO(_namespaceUri, new SocketIOOptions
            {
                Auth = new Dictionary<string, string> { ["token"] = token },
                EIO = SocketIOClient.Common.EngineIO.V4,
                Reconnection = false,
            });

            socket.OnConnected += (_, _) =>
            {
                _heartbeat.Beat(DateTimeOffset.UtcNow);
                Raise(CtiConnectionState.Connected);
            };
            socket.OnDisconnected += (_, _) => Raise(CtiConnectionState.Disconnected);

            // 서버가 살아 있다는 유일한 근거. 이벤트가 없는 한가한 시간에도 이건 온다.
            socket.OnPing += (_, _) => _heartbeat.Beat(DateTimeOffset.UtcNow);
            socket.OnPong += (_, _) => _heartbeat.Beat(DateTimeOffset.UtcNow);

            foreach (var name in CtiEventNames.All)
            {
                var eventName = name;
                socket.On(eventName, ctx =>
                {
                    _heartbeat.Beat(DateTimeOffset.UtcNow);
                    Dispatch(eventName, ctx);
                    return Task.CompletedTask;
                });
            }

            _socket = socket;
            Raise(CtiConnectionState.Connecting);
            await socket.ConnectAsync(ct);
            StartWatchdog();
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task DisconnectAsync()
    {
        await _gate.WaitAsync();
        try
        {
            await CloseAsync();
            Raise(CtiConnectionState.Disconnected);
        }
        finally
        {
            _gate.Release();
        }
    }

    private void Dispatch(string eventName, IEventContext ctx)
    {
        string json;
        try
        {
            // 확인된 형태: ctx.RawText 는 ["이름", 페이로드] 이고 0번 인자가 페이로드다.
            json = ctx.GetValue<JsonElement>(0).GetRawText();
        }
        catch (Exception ex) when (ex is JsonException or IndexOutOfRangeException or ArgumentOutOfRangeException)
        {
            UnparsedEvent?.Invoke(this, eventName);
            return;
        }

        var parsed = CtiEventParser.Parse(eventName, json);
        if (parsed is null)
        {
            UnparsedEvent?.Invoke(this, eventName);
            return;
        }

        try
        {
            EventReceived?.Invoke(this, parsed);
        }
        catch (Exception ex)
        {
            HandlerFailed?.Invoke(this, ex);
        }
    }

    /// <summary>
    /// 5초마다 신호가 끊겼는지 본다. 라이브러리가 끊김을 못 알아채는 경우가 실제로 있어
    /// (서버 컨테이너 재시작 시 5분 넘게 "연결됨"으로 남아 있었다) 이 감시가 필요하다.
    /// </summary>
    private void StartWatchdog()
    {
        _watchdog?.Dispose();
        _watchdog = new Timer(_ =>
        {
            if (!_heartbeat.IsStale(DateTimeOffset.UtcNow)) return;

            _heartbeat.Stop();
            Raise(CtiConnectionState.Disconnected);
        }, null, TimeSpan.FromSeconds(5), TimeSpan.FromSeconds(5));
    }

    private void StopWatchdog()
    {
        _watchdog?.Dispose();
        _watchdog = null;
        _heartbeat.Stop();
    }

    private void Raise(CtiConnectionState state)
    {
        // 같은 상태를 두 번 알리지 않는다. 소켓 이벤트와 명시적 종료가 겹칠 수 있다.
        lock (this)
        {
            if (_state == state) return;
            _state = state;
        }

        ConnectionStateChanged?.Invoke(this, state);
    }

    private async Task CloseAsync()
    {
        StopWatchdog();
        if (_socket is null) return;

        try
        {
            await _socket.DisconnectAsync();
        }
        catch (Exception)
        {
            // 이미 끊긴 소켓을 닫는 것은 실패해도 상관없다.
        }

        _socket.Dispose();
        _socket = null;
    }

    public async ValueTask DisposeAsync()
    {
        await DisconnectAsync();
        StopWatchdog();
        _gate.Dispose();
    }
}
