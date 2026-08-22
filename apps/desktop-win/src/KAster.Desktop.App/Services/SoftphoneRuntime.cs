using System.Net.Http;
using System.Runtime.Versioning;
using KAster.Desktop.Core.Contracts;
using KAster.Desktop.Core.Runtime;
using KAster.Desktop.Core.Server;
using KAster.Desktop.Core.State;
using KAster.Desktop.Core.Storage;
using KAster.Desktop.Core.Updates;
using KAster.Desktop.Softphone;
using KAster.Desktop.Softphone.Audio;

namespace KAster.Desktop.App.Services;

/// <summary>
/// 로그인 뒤에 살아 있는 것들을 한 자리에서 만들고 정리한다.
/// 실시간 소켓·SIP 등록·토큰 회전이 서로 얽혀 있어 생명주기를 한 곳에서 잡아야 한다.
/// </summary>
[SupportedOSPlatform("windows")]
public sealed class SoftphoneRuntime : IAsyncDisposable
{
    private readonly AppSettings _settings;
    private readonly ITokenStore _tokens;
    private readonly WasapiDeviceEnumerator _devices = new();
    private readonly AudioDeviceController _deviceController;
    private readonly JsonSettingsStore<AudioDeviceSelection> _deviceSelection;
    private readonly RetryPolicy _retry = new();

    private readonly CancellationTokenSource _life = new();
    private readonly SemaphoreSlim _connectGate = new(1, 1);
    private readonly Action<Action> _post;

    /// <summary>실기기 모드면 SIP 를 아예 띄우지 않는다. 책상 전화기와 같은 내선을 두고 다투면 안 된다.</summary>
    private readonly bool _useSoftphone;

    /// <param name="post">
    /// 서버 이벤트를 UI 스레드로 옮기는 통로. 소켓 스레드에서 상태를 바꾸면 WPF 가
    /// <c>CanExecuteChanged</c> 를 거부해 화면 전환이 조용히 멈춘다.
    /// </param>
    public SoftphoneRuntime(
        AppSettings settings,
        ITokenStore tokens,
        AgentProfile agent,
        SoftphoneConfig? softphone,
        Action<Action> post,
        bool useSoftphone)
    {
        _post = post;
        _useSoftphone = useSoftphone;
        _settings = settings;
        _tokens = tokens;
        _deviceController = new AudioDeviceController(_devices);
        _deviceSelection = new JsonSettingsStore<AudioDeviceSelection>(AppPaths.AudioDevices);

        // refresh 는 회전 핸들러를 거치지 않는 별도 클라이언트로 보낸다. 아니면 자기 자신을 다시 부른다.
        var plain = new HttpClient { BaseAddress = settings.BaseUri };
        var auth = new AuthClient(plain);

        RefreshHandler = new TokenRefreshHandler(tokens, async (refreshToken, ct) =>
        {
            try
            {
                var rotated = await auth.RefreshAsync(refreshToken, ct);
                return rotated.Tokens;
            }
            catch (Exception)
            {
                return null;
            }
        })
        {
            InnerHandler = new HttpClientHandler(),
        };

        Server = new CtiServerClient(new HttpClient(RefreshHandler) { BaseAddress = settings.BaseUri });

        // 업데이트는 회전 핸들러를 <b>안 거친다</b>. 그쪽은 모든 요청에 로그인 토큰을 덮어쓰는데,
        // manifest 와 다운로드는 각자 다른 토큰을 실어야 한다 (UpdateClient 주석 참조).
        Updates = new UpdateClient(
            new HttpClient { BaseAddress = settings.BaseUri },
            () => tokens.Load()?.AccessToken,
            AppRelease.DeviceId);
        Events = new CtiEventClient(settings.BaseUri, () => tokens.Load()?.AccessToken);
        Calls = new CallStateStore(agent.AgentId, () => DateTimeOffset.UtcNow, null, agent.Extension);
        Phone = new SipSoftphoneClient(CreateAudio);
        Softphone = softphone;

        // 통화 이벤트는 상태 저장소가, 나머지(상태 변경·스크린팝)는 화면이 받는다.
        // 한쪽만 연결하면 서버가 보낸 것이 조용히 사라진다.
        Events.EventReceived += (_, evt) => _post(() =>
        {
            Calls.Apply(evt);
            NonCallEvent?.Invoke(this, evt);
        });

        // 연결이 도중에 끊기면 스스로 다시 붙는다. 라이브러리 자동 재연결은 만료된 토큰을 재사용하므로 꺼 뒀다.
        Events.ConnectionStateChanged += (_, state) =>
        {
            if (state == CtiConnectionState.Disconnected && !_life.IsCancellationRequested)
            {
                _ = ConnectEventsAsync();
            }
        };
    }

    public TokenRefreshHandler RefreshHandler { get; }

    public CtiServerClient Server { get; }

    /// <summary>승인된 새 버전 확인. 알리는 데까지만 쓴다 — 설치는 상담원이 정한다.</summary>
    public UpdateClient Updates { get; }

    public CtiEventClient Events { get; }

    public CallStateStore Calls { get; }

    /// <summary>통화 상태 밖의 이벤트. 조립 지점이 화면으로 넘긴다.</summary>
    public event EventHandler<CtiEvent>? NonCallEvent;

    public SipSoftphoneClient Phone { get; }

    public SoftphoneConfig? Softphone { get; }

    public AudioDeviceController Devices => _deviceController;

    public async Task StartAsync()
    {
        await ConnectEventsAsync();

        if (_useSoftphone && SoftphoneOptions.TryCreate(Softphone, out var options, out _))
        {
            Phone.Start(options!);
        }
    }

    /// <summary>연결이 끊기면 백오프를 두고 새 토큰으로 다시 붙는다.</summary>
    private async Task ConnectEventsAsync()
    {
        // 재연결 시도가 겹치면 서버에 소켓이 여러 개 붙는다.
        if (!await _connectGate.WaitAsync(0)) return;

        try
        {
            while (!_life.IsCancellationRequested)
            {
                try
                {
                    await Events.ConnectAsync(_life.Token);
                    _retry.Reset();
                    return;
                }
                catch (Exception) when (!_life.IsCancellationRequested)
                {
                    await Task.Delay(_retry.NextDelay(), _life.Token);
                }
            }
        }
        catch (OperationCanceledException)
        {
            // 종료 중이다.
        }
        finally
        {
            _connectGate.Release();
        }
    }

    private WasapiAudioEndPoint CreateAudio()
    {
        var resolved = _deviceController.Resolve(_deviceSelection.Load(new AudioDeviceSelection()));
        return new WasapiAudioEndPoint(
            resolved.Capture is null ? null : _devices.Open(resolved.Capture.Id),
            resolved.CallRender is null ? null : _devices.Open(resolved.CallRender.Id));
    }

    public async ValueTask DisposeAsync()
    {
        _life.Cancel();
        Phone.Dispose();
        await Events.DisposeAsync();
        RefreshHandler.Dispose();
        _devices.Dispose();
        _connectGate.Dispose();
        _life.Dispose();
    }
}
