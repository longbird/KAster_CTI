using System.Net.Http;
using System.Runtime.Versioning;
using System.Windows;
using System.Windows.Threading;
using KAster.Desktop.App.Services;
using KAster.Desktop.App.ViewModels;
using KAster.Desktop.App.Views;
using KAster.Desktop.Core.Server;
using KAster.Desktop.Core.Storage;
using KAster.Desktop.Softphone.Audio;

namespace KAster.Desktop.App;

/// <summary>
/// 조립 지점. 로그인 화면을 띄우고, 로그인이 끝나면 런타임을 세워 통화 화면으로 넘긴다.
/// 창 모양은 <see cref="WindowModeService"/> 에게만 맡긴다.
/// </summary>
[SupportedOSPlatform("windows")]
public partial class MainWindow : Window
{
    /// <summary>
    /// 설정 서브 창. 메인 화면은 고정하고 필요한 화면만 옆에 띄운다 (사용자 결정 2026-08-22).
    /// 크기는 전에 이 화면이 메인 창을 통째로 쓰던 때와 같다.
    /// </summary>
    private static readonly SubWindowSpec SettingsWindow =
        new("settings", "PBX 설정", 560, 720, 500, 640);

    /// <summary>
    /// 읽기 전용 정보 창들. 메인 화면은 그대로 두고 옆에 세운다 — 목록을 보는 동안에도
    /// 울리는 전화가 보여야 한다 (<see cref="SubWindowPlacement"/> 가 자리를 잡는다).
    ///
    /// 크기는 각 화면이 스크롤 없이 담는 줄 수에서 나왔다. 창을 늘려도 줄이 늘지는 않는다 —
    /// 넘치는 것은 "외 n건" 으로 알린다.
    /// </summary>
    private static readonly SubWindowSpec AgentDirectoryWindow =
        new("agent-directory", "상담원 목록", 380, 520, 340, 420);

    private static readonly SubWindowSpec QueueStatusWindow =
        new("queue-status", "큐 대기 현황", 460, 460, 420, 380);

    private static readonly SubWindowSpec AnnouncementsWindow =
        new("announcements", "공지", 460, 560, 400, 440);

    private static readonly SubWindowSpec CustomerInfoWindow =
        new("customer-info", "고객 정보", 380, 440, 340, 360);

    private AppSettings _settings;

    private readonly TokenVault _tokens;
    private readonly WindowModeService _windowMode;
    private readonly SubWindowService _subWindows;
    private readonly DispatcherTimer _timer = new() { Interval = TimeSpan.FromSeconds(1) };

    private SoftphoneRuntime? _runtime;
    private SoftphoneViewModel? _softphone;

    public MainWindow()
    {
        InitializeComponent();

        _settings = new JsonSettingsStore<AppSettings>(AppPaths.Settings).Load(new AppSettings());
        _tokens = new TokenVault(AppPaths.TokenVault);
        _windowMode = new WindowModeService(this);
        _subWindows = new SubWindowService(this);

        _timer.Tick += (_, _) =>
        {
            _softphone?.Tick();

            // 제안 남은 시간. 매번 시계로 다시 계산하므로 통화 화면 쪽에서 또 밀어도 결과가 같다.
            _softphone?.Offer.Tick();
        };

        ShowLogin();
        Closed += async (_, _) => await ShutdownAsync();
    }

    private void ShowLogin()
    {
        var auth = new AuthClient(new HttpClient { BaseAddress = _settings.BaseUri });
        var vm = new LoginViewModel(auth, _tokens, new SavedLoginStore(AppPaths.SavedLogin));
        vm.SignedIn += async (_, result) => await StartRuntimeAsync(result, vm.UseSoftphone);
        vm.SettingsRequested += (_, _) => ShowSettings(vm.UseSoftphone, ShowLogin);

        _windowMode.Request(WindowMode.Idle);
        Host.Content = new LoginView { DataContext = vm };
    }

    private async Task StartRuntimeAsync(LoginResult login, bool useSoftphone)
    {
        // 로그인 전에 열어 둔 설정 창은 로그인 이전의 설정 사본을 들고 있다. 통화 화면 위에
        // 남겨 두면 상담원이 거기서 저장해 방금 로그인한 주소를 덮어쓴다.
        _subWindows.CloseAll();

        var runtime = new SoftphoneRuntime(
            _settings,
            _tokens,
            login.Session.Agent,
            login.Session.SoftphoneConfig,
            action => Dispatcher.Invoke(action),
            useSoftphone);

        var softphone = new SoftphoneViewModel(
            runtime.Calls,
            runtime.Server,
            runtime.Phone,
            login.Session.Agent,
            () => DateTimeOffset.UtcNow,
            useSoftphone,
            login.Session.SoftphoneConfig,
            new JsonSettingsStore<AnnouncementReadState>(
                AppPaths.AnnouncementReads, new AnnouncementReadState()));

        // 창을 만지는 일은 모두 여기 한 줄을 지난다.
        // 서버 이벤트는 이미 UI 스레드로 넘어와 있으므로 여기서는 그대로 받는다.
        softphone.WindowModeRequested += (_, mode) => ApplyMode(mode, softphone);
        runtime.Events.ConnectionStateChanged += (_, state) =>
            Dispatcher.Invoke(() => softphone.OnConnectionStateChanged(state));

        // SIP 스레드에서 올라온다. UI 스레드로 옮기지 않으면 창 전환이 조용히 멈춘다.
        runtime.Phone.CallStatusChanged += (_, status) =>
            Dispatcher.Invoke(() => softphone.Dial.OnSoftphoneCallStatusChanged(status));
        runtime.Phone.RegistrationStatusChanged += (_, status) =>
            Dispatcher.Invoke(() => softphone.OnRegistrationStatusChanged(status));

        // 이미 등록이 끝난 뒤에 붙을 수도 있다. 현재 값을 한 번 밀어 넣는다.
        softphone.OnRegistrationStatusChanged(runtime.Phone.Status);
        runtime.Events.HandlerFailed += (_, ex) => App.LogError(ex);
        softphone.Dial.SelfAnswerFailed += (_, ex) => App.LogError(ex);
        softphone.Diagnostic += (_, message) => App.Log(message);
        runtime.NonCallEvent += (_, evt) => softphone.Apply(evt);
        softphone.SignOutRequested += async (_, _) => await SignOutAsync();

        // 정보 화면은 창을 스스로 만들지 않는다. 어느 창인지만 올라오고 여기서 띄운다.
        softphone.InfoWindowRequested += (_, which) => ShowInfoWindow(which, softphone);
        softphone.InfoWindowDismissed += (_, which) => _subWindows.Close(SpecOf(which).Key);
        // 메인 창은 그대로 있으므로 설정을 닫아도 되돌릴 화면이 없다.
        softphone.SettingsRequested += (_, _) => ShowSettings(useSoftphone, leave: null);
        runtime.RefreshHandler.SignedOut += (_, _) => Dispatcher.Invoke(SignOut);

        _runtime = runtime;
        _softphone = softphone;

        ApplyMode(WindowMode.Idle, softphone);
        _timer.Start();

        await runtime.StartAsync();

        // 내선 목록과 발신번호는 로그인 뒤 한 번만 받아 두면 된다.
        // 실패해도 여기서 멈추지 않는다 — 발신만 못 하고 수신·통화는 그대로 돈다.
        await softphone.LoadDialSetupAsync();

        // 안 읽은 공지 수는 창을 열기 전에 맞아야 한다. 조용히 실패하므로 발신 준비와 묶지 않는다.
        await softphone.Announcements.RefreshAsync();
    }

    /// <summary>
    /// 읽기 전용 정보 창을 띄운다.
    ///
    /// <paramref name="softphone"/> 를 통째로 <c>DataContext</c> 로 넘기는 것은 이 앱의 다른 화면과
    /// 같은 방식이다 — 화면 XAML 이 <c>{Binding Queues.Rows}</c> 처럼 자기 갈래를 찾아 읽는다.
    ///
    /// 닫힘 처리를 거는 이유는 <b>X 로 닫는 경로</b> 때문이다. 화면 안쪽 닫기 버튼만 듣고 있으면,
    /// X 로 닫은 큐 현황 창의 5초 조회가 아무도 안 보는 채로 계속 돈다.
    /// </summary>
    private void ShowInfoWindow(InfoWindow which, SoftphoneViewModel softphone)
    {
        var spec = SpecOf(which);

        _subWindows.Open(
            spec,
            () => (object)(which switch
            {
                InfoWindow.AgentDirectory => new AgentDirectoryView { DataContext = softphone },
                InfoWindow.QueueStatus => new QueueStatusView { DataContext = softphone },
                InfoWindow.Announcements => new AnnouncementsView { DataContext = softphone },
                _ => (System.Windows.Controls.UserControl)new CustomerInfoView { DataContext = softphone },
            }),
            which switch
            {
                InfoWindow.AgentDirectory => softphone.Directory.Close,
                InfoWindow.QueueStatus => softphone.Queues.Close,
                InfoWindow.Announcements => softphone.Announcements.Close,
                _ => softphone.Customer.Close,
            });
    }

    private static SubWindowSpec SpecOf(InfoWindow which) => which switch
    {
        InfoWindow.AgentDirectory => AgentDirectoryWindow,
        InfoWindow.QueueStatus => QueueStatusWindow,
        InfoWindow.Announcements => AnnouncementsWindow,
        _ => CustomerInfoWindow,
    };

    private void ApplyMode(WindowMode mode, SoftphoneViewModel softphone)
    {
        Host.Content = mode switch
        {
            // 큐가 물어보는 호와 이미 울리고 있는 호는 누를 것이 다르다.
            // 전자는 수락/거절, 후자는 받기/거절이다.
            WindowMode.Ringing when softphone.Offer.HasOffer => new OfferView { DataContext = softphone },
            WindowMode.Ringing => new RingingView { DataContext = softphone },
            WindowMode.Settings when softphone.History.IsViewingHistory
                => new HistoryView { DataContext = softphone },
            // 대상을 고르는 중이든 협의를 걸어 둔 중이든 같은 화면이다. 협의 중에 통화 화면으로
            // 되돌리면 연결과 취소를 누를 자리가 사라진다.
            WindowMode.Transferring when softphone.Transfer.IsTransferScreenOpen
                => new TransferView { DataContext = softphone },
            WindowMode.Talking or WindowMode.Transferring or WindowMode.AfterCall
                => new TalkingView { DataContext = softphone },
            _ => new IdleView { DataContext = softphone },
        };

        _windowMode.Request(mode);
    }

    /// <summary>
    /// 설정 화면. 로그인 전과 대기 중 양쪽에서 열린다.
    ///
    /// 서버 주소는 로그인 전에 고쳐야 뜻이 있고(못 붙는 주소면 로그인 자체가 안 된다),
    /// 오디오 장치는 통화 중에 바꾸면 소리가 끊기므로 대기 중에만 연다.
    ///
    /// 메인 창을 갈아 치우지 않고 옆에 띄운다 — 설정을 보는 동안에도 울리는 전화가 보여야 한다.
    /// </summary>
    /// <param name="leave">
    /// 설정을 닫은 뒤 다시 세워야 하는 화면. 로그인 화면은 서버 주소로 AuthClient 를 미리
    /// 만들어 두므로 주소가 바뀌면 다시 만들어야 한다. 이미 로그인한 세션은 이번 연결을 유지한다.
    /// </param>
    private void ShowSettings(bool useSoftphone, Action? leave)
    {
        _subWindows.Open(SettingsWindow, () =>
        {
            var vm = new SettingsViewModel(
                new JsonSettingsStore<AppSettings>(AppPaths.Settings, new AppSettings()),
                new JsonSettingsStore<AudioDeviceSelection>(AppPaths.AudioDevices, new AudioDeviceSelection()),
                new WasapiDeviceEnumerator(),
                useSoftphone);

            vm.Closed += (_, _) =>
            {
                // 저장된 주소를 곧바로 다시 읽는다. 다음 로그인이 새 주소로 나가야 한다.
                _settings = new JsonSettingsStore<AppSettings>(AppPaths.Settings).Load(new AppSettings());

                _subWindows.Close(SettingsWindow.Key);
                leave?.Invoke();
            };

            return new SettingsView { DataContext = vm };
        });
    }

    private async void SignOut() => await SignOutAsync();

    /// <summary>
    /// 로그아웃. 서버에 refresh token 을 돌려주고 이쪽 금고를 비운 뒤 로그인 화면으로 간다.
    /// 서버에 못 알려도 진행한다 — 서버가 죽었다고 상담원이 화면에 갇히면 안 된다.
    /// </summary>
    private async Task SignOutAsync()
    {
        var refreshToken = _tokens.Load()?.RefreshToken;
        await ShutdownAsync();

        if (!string.IsNullOrEmpty(refreshToken))
        {
            var auth = new AuthClient(new HttpClient { BaseAddress = _settings.BaseUri });
            await auth.LogoutAsync(refreshToken, CancellationToken.None);
        }

        _tokens.Clear();
        ShowLogin();
    }

    private async Task ShutdownAsync()
    {
        // 로그아웃과 종료가 모두 여기를 지난다. 안 닫으면 로그아웃한 뒤에도 앞 상담원의
        // 화면이 떠 있고, 종료 때는 남은 창이 프로세스를 붙잡는다.
        _subWindows.CloseAll();

        _timer.Stop();
        _softphone = null;

        if (_runtime is not null)
        {
            await _runtime.DisposeAsync();
            _runtime = null;
        }
    }
}
