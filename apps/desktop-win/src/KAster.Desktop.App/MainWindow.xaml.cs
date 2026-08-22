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
    private readonly TrayIconService _tray;
    private readonly DispatcherTimer _timer = new() { Interval = TimeSpan.FromSeconds(1) };

    private SoftphoneRuntime? _runtime;
    private SoftphoneViewModel? _softphone;

    /// <summary>
    /// 전역 핫키. 창 핸들이 생긴 뒤라야 등록할 수 있어 생성자가 아니라 로그인 뒤에 세운다 —
    /// 어차피 로그인 전에는 받을 전화도 끊을 통화도 없다.
    /// </summary>
    private GlobalHotkeyService? _hotkeys;

    /// <summary>1초 타이머의 순번. 수신 중 아이콘 깜빡임의 위상이 여기서 나온다.</summary>
    private long _tick;

    public MainWindow()
    {
        InitializeComponent();

        _settings = new JsonSettingsStore<AppSettings>(AppPaths.Settings).Load(new AppSettings());
        _tokens = new TokenVault(AppPaths.TokenVault);
        _windowMode = new WindowModeService(this);
        _subWindows = new SubWindowService(this);

        // 트레이에서 창을 부르는 것은 상담원이 스스로 누른 경로다. 종료는 창을 닫는 것과 같은 길을 쓴다 —
        // 여기서만 따로 정리하면 어느 한쪽에 빠진 것이 생긴다.
        _tray = new TrayIconService(new TrayIconArt(), () => WindowAttention.Restore(this), Close);

        _timer.Tick += (_, _) =>
        {
            _softphone?.Tick();

            // 제안 남은 시간. 매번 시계로 다시 계산하므로 통화 화면 쪽에서 또 밀어도 결과가 같다.
            _softphone?.Offer.Tick();

            // 트레이는 같은 값을 다시 받으면 아무 일도 하지 않는다. 매초 밀어도 된다.
            // 수신 중일 때만 이 틱 번호가 아이콘을 번갈아 칠한다 — 창을 안 보고 있어도 눈에 걸린다.
            _tray.Show(TrayBlink.For(CurrentTrayState(), _tick++));
        };

        ShowLogin();
        _tray.Show(CurrentTrayState());

        // 창을 닫으면 <b>앱이 끝난다</b>. 트레이가 생겼다고 X 를 최소화로 바꾸지 않았다 —
        // 서버는 앱이 붙어 있는지로 큐 배정을 정하므로(파동 1), 트레이로 내려간 앱은 상담원이
        // 껐다고 생각한 뒤에도 큐에 남아 빈 자리로 전화를 받는다. 고객은 아무도 없는 자리에서
        // 벨소리만 듣는다.
        //
        // 창이 가려져 전화를 놓치는 문제는 창을 숨기는 쪽이 아니라 알리는 쪽(풍선·깜빡임)으로 푼다.
        //
        // 트레이는 창 하나에 딸린 것이라 창이 사라질 때만 내린다. 로그아웃은 같은 창에서 이어지므로
        // ShutdownAsync 안에서 내리면 로그인 화면으로 돌아온 뒤 아이콘이 없어진다.
        Closed += async (_, _) =>
        {
            await ShutdownAsync();
            _hotkeys?.Dispose();
            _tray.Dispose();
        };
    }

    /// <summary>
    /// 지금 트레이가 말해야 하는 것. 로그인 전에는 붙을 서버도 전화기도 없으므로 "서버 끊김" 이다 —
    /// 그 상태로 전화가 오지 않는 것은 사실이다.
    /// </summary>
    private TrayState CurrentTrayState()
        => _softphone is null
            ? new TrayState(TrayStatus.Disconnected, "PBX 상담원 · 로그인 전")
            : TrayPresentation.For(
                _softphone.IsConnected,
                _softphone.DeskPhone.IsPhoneRegistered,
                _softphone.WindowMode,
                _softphone.AgentStatus,
                _softphone.AgentName,
                _softphone.Extension);

    /// <summary>
    /// 상담원이 지금 알아채야 하는 것. 창이 앞에 있으면 아무것도 하지 않는다 —
    /// 이미 그 화면에 제안이 떠 있고, 그 위에 풍선을 얹으면 소음만 는다.
    ///
    /// <b>가려진 창과 내려 둔 창은 반드시 알림을 받는다.</b> 풍선은 창과 무관하게 트레이가 띄우고,
    /// 깜빡임은 작업 표시줄 단추에 걸리므로 최소화 상태에서도 그대로 보인다.
    /// 어느 쪽도 창을 앞으로 끌어내지 않는다.
    /// </summary>
    private void RaiseAttention(Alert alert)
    {
        var channels = AlertDelivery.For(IsActive, WindowState == WindowState.Minimized);

        if (channels.HasFlag(AlertChannel.Balloon)) _tray.Balloon(alert);
        if (channels.HasFlag(AlertChannel.Flash)) WindowAttention.Flash(this);
    }

    /// <summary>
    /// 전역 핫키를 건다. <b>등록 실패는 반드시 화면에 올린다</b> — 다른 프로그램이 먼저 잡은
    /// 조합이면 눌러도 아무 일이 없는데, 말하지 않으면 상담원은 되는 줄 알고 계속 누른다.
    /// </summary>
    private void StartHotkeys(SoftphoneViewModel softphone)
    {
        // 재로그인마다 새로 걸면 핸들러가 쌓여 한 번 누른 핫키가 여러 번 나간다.
        if (_hotkeys is null)
        {
            _hotkeys = new GlobalHotkeyService(this);
            _hotkeys.Pressed += (_, action) => _softphone?.Invoke(action);
        }

        var settings = new JsonSettingsStore<HotkeySettings>(AppPaths.Hotkeys).Load(new HotkeySettings());
        var failures = _hotkeys.Apply(HotkeyPlan.For(settings));

        if (HotkeyNotice.For(failures) is { } notice)
        {
            softphone.ShowNotice(notice);
            App.Log($"핫키 등록 실패: {notice}");
        }
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
            Dispatcher.Invoke(() => softphone.DeskPhone.OnRegistrationStatusChanged(status));

        // 이미 등록이 끝난 뒤에 붙을 수도 있다. 현재 값을 한 번 밀어 넣는다.
        softphone.DeskPhone.OnRegistrationStatusChanged(runtime.Phone.Status);
        runtime.Events.HandlerFailed += (_, ex) => App.LogError(ex);
        softphone.Dial.SelfAnswerFailed += (_, ex) => App.LogError(ex);
        softphone.Diagnostic += (_, message) => App.Log(message);
        softphone.AttentionRequested += (_, alert) => RaiseAttention(alert);
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
        StartHotkeys(softphone);
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

            vm.FolderRequested += (_, path) => OpenFolder(path);

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

    /// <summary>
    /// 폴더를 탐색기로 연다. 아직 아무것도 안 남은 자리일 수 있으므로 먼저 만든다 —
    /// 없는 경로를 넘기면 탐색기가 "찾을 수 없다" 만 띄우고 상담원은 자기가 잘못한 줄 안다.
    /// </summary>
    private static void OpenFolder(string path)
    {
        try
        {
            System.IO.Directory.CreateDirectory(path);
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(path)
            {
                UseShellExecute = true,
            });
        }
        catch (Exception ex)
        {
            App.LogError(ex);
        }
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

        // 로그아웃하면 누를 통화가 없다. 남겨 두면 로그인 화면에서 누른 핫키가 조용히 사라진다.
        _hotkeys?.Clear();
        _softphone = null;
        _tray.Show(CurrentTrayState());

        if (_runtime is not null)
        {
            await _runtime.DisposeAsync();
            _runtime = null;
        }
    }
}
