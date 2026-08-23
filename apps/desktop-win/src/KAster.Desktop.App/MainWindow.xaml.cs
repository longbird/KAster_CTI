using System.Net.Http;
using System.Runtime.Versioning;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Controls.Primitives;
using System.Windows.Threading;
using KAster.Desktop.App.Services;
using KAster.Desktop.App.ViewModels;
using KAster.Desktop.App.Views;
using KAster.Desktop.Core.Contracts;
using KAster.Desktop.Core.Protocol;
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
    /// 새 버전 확인. 통화 화면과 설정 화면이 <b>같은 것 하나</b>를 본다 —
    /// 둘로 두면 설정에서 확인한 결과가 통화 화면에 안 뜨고 그 반대도 마찬가지다.
    /// </summary>
    private UpdateViewModel? _update;

    /// <summary>
    /// 전역 핫키. 창 핸들이 생긴 뒤라야 등록할 수 있어 생성자가 아니라 로그인 뒤에 세운다 —
    /// 어차피 로그인 전에는 받을 전화도 끊을 통화도 없다.
    /// </summary>
    private GlobalHotkeyService? _hotkeys;

    /// <summary>
    /// 웹에서 넘긴 세션이 이 자리에서 어떻게 됐는지. 웹앱이 브리지로 되물어 본다 —
    /// 적어 두지 않으면 웹 화면은 연결에 성공했는데도 실패로 알린다.
    /// </summary>
    private readonly HandoffStatusBoard _handoffs = new();

    private readonly DesktopBridgeServer _bridge;

    /// <summary>트레이 그림. 테마가 바뀌면 캐시를 버려야 해서 창이 들고 있다.</summary>
    private readonly TrayIconArt _trayArt;

    private readonly ThemeService _theme;

    /// <summary>트레이의 "종료" 로 끄는 중인가. 닫기를 트레이로 내리는 설정을 건너뛰는 표시다.</summary>
    private bool _quitting;

    /// <summary>
    /// 통화 중 1~9 에 걸어 둔 전환 대상. 창이 읽으므로 창이 들고 있다 —
    /// 설정 화면에서 고치면 다음에 창이 다시 읽는다.
    /// </summary>
    /// <summary>앱 전반의 동작. 창 모양과 소리를 정하므로 창이 들고 있다.</summary>
    private readonly ISettingsStore<GeneralPreferences> _general =
        new JsonSettingsStore<GeneralPreferences>(AppPaths.General, new GeneralPreferences());

    /// <summary>
    /// 전화가 왔을 때 울린다. 지금까지 이 앱은 소리를 내지 않아, 다른 창을 보고 있으면
    /// 전화가 온 것을 몰랐다.
    /// </summary>
    private readonly RingTonePlayer _ring = new();

    private readonly ISettingsStore<TransferHotkeySettings> _transferHotkeys =
        new JsonSettingsStore<TransferHotkeySettings>(
            AppPaths.TransferHotkeys, new TransferHotkeySettings());

    /// <summary>1초 타이머의 순번. 수신 중 아이콘 깜빡임의 위상이 여기서 나온다.</summary>
    private long _tick;

    public MainWindow()
    {
        InitializeComponent();

        _settings = new JsonSettingsStore<AppSettings>(AppPaths.Settings, new AppSettings()).Load();
        _tokens = new TokenVault(AppPaths.TokenVault);
        _windowMode = new WindowModeService(this);
        _subWindows = new SubWindowService(this, () => _theme?.Current ?? ThemePalette.Light);

        // 트레이에서 창을 부르는 것은 상담원이 스스로 누른 경로다. 종료는 창을 닫는 것과 같은 길을 쓴다 —
        // 여기서만 따로 정리하면 어느 한쪽에 빠진 것이 생긴다.
        //
        // 트레이의 "종료" 는 <b>진짜 종료</b>여야 한다. 닫기를 트레이로 내리게 해 두면
        // 그 길로도 안 꺼져서 앱을 끌 방법이 사라진다.
        _trayArt = new TrayIconArt();
        _tray = new TrayIconService(_trayArt, ComeBack, () => { _quitting = true; Close(); });

        // 저장해 둔 테마를 얹는다. 색이 바뀌면 트레이가 들고 있던 그림도 옛 색이므로 버린다 —
        // 안 버리면 화면만 밝아지고 트레이만 어두운 색으로 남는다.
        // 시작 적용을 먼저 하고 그 다음에 구독한다. 순서를 바꾸면 시작할 때도 이벤트가 와서
        // 같은 줄이 로그에 두 번 남는다.
        _theme = new ThemeService(Application.Current.Resources);
        _theme.Apply(_general.Load().Sane().Theme);
        WindowTitleBar.Follow(this, _theme.Current);
        LogTheme(_theme.Current);

        _theme.Changed += (_, palette) =>
        {
            // 색이 바뀌면 트레이가 들고 있던 그림도 옛 색이므로 버린다.
            _trayArt.Invalidate();
            _tray.Show(CurrentTrayState());

            WindowTitleBar.Follow(this, palette);
            _subWindows.FollowTheme(palette);
            LogTheme(palette);
        };

        // 웹앱이 "이 PC 에 앱이 떠 있는가" 를 여기로 확인한다. 못 열어도 앱은 그대로 돈다 —
        // 웹에서 넘기는 길만 막히고 직접 로그인과 통화는 영향이 없다.
        _bridge = new DesktopBridgeServer(_handoffs, note: App.Log);
        _bridge.Start();

        Topmost = _general.Load().Sane().AlwaysOnTop;

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

        // 앱이 꺼져 있을 때 웹에서 링크를 누르면 요청이 창보다 먼저 도착해 있다.
        // 화면이 선 지금에야 그것을 처리할 수 있다.
        App.Protocol.Attach(request => Dispatcher.Invoke(() => OnHandoffRequested(request)));
        App.Protocol.MarkReady();

        // 창을 닫으면 <b>앱이 끝난다</b>. 트레이가 생겼다고 X 를 최소화로 바꾸지 않았다 —
        // 서버는 앱이 붙어 있는지로 큐 배정을 정하므로(파동 1), 트레이로 내려간 앱은 상담원이
        // 껐다고 생각한 뒤에도 큐에 남아 빈 자리로 전화를 받는다. 고객은 아무도 없는 자리에서
        // 벨소리만 듣는다.
        //
        // 창이 가려져 전화를 놓치는 문제는 창을 숨기는 쪽이 아니라 알리는 쪽(풍선·깜빡임)으로 푼다.
        //
        // 트레이는 창 하나에 딸린 것이라 창이 사라질 때만 내린다. 로그아웃은 같은 창에서 이어지므로
        // ShutdownAsync 안에서 내리면 로그인 화면으로 돌아온 뒤 아이콘이 없어진다.
        // 닫기를 트레이로 내리는 설정이 켜져 있으면 여기서 닫힘을 접는다.
        Closing += (_, e) =>
        {
            if (_quitting || _softphone is null) return;
            if (!_general.Load().Sane().CloseToTray) return;

            e.Cancel = true;
            HideToTray();
        };

        Closed += async (_, _) =>
        {
            await ShutdownAsync();
            _hotkeys?.Dispose();
            _ring.Dispose();
            _bridge.Dispose();
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

        var settings = new JsonSettingsStore<HotkeySettings>(AppPaths.Hotkeys, new HotkeySettings()).Load();

        if (HotkeyNotice.For(ApplyHotkeys(settings)) is { } notice)
        {
            softphone.ShowNotice(notice);
            App.Log($"핫키 등록 실패: {notice}");
        }
    }

    /// <summary>
    /// 조합을 실제로 윈도우에 건다. 설정 화면이 저장할 때도 이 길을 지난다 —
    /// 등록 경로가 둘이면 설정에서 바꾼 조합과 지금 걸려 있는 조합이 어긋난다.
    /// </summary>
    private IReadOnlyList<string> ApplyHotkeys(HotkeySettings combos)
        => _hotkeys?.Apply(HotkeyPlan.For(combos)) ?? Array.Empty<string>();

    private void ShowLogin()
    {
        var auth = new AuthClient(new HttpClient { BaseAddress = _settings.BaseUri });
        var vm = new LoginViewModel(auth, _tokens, new SavedLoginStore(AppPaths.SavedLogin));
        vm.SignedIn += async (_, result) => await StartRuntimeAsync(result, vm.UseSoftphone);
        vm.SettingsRequested += (_, _) => ShowSettings(vm.UseSoftphone, ShowLogin);

        _windowMode.Request(WindowMode.Idle);
        Host.Content = new LoginView { DataContext = vm };

        // 화면을 먼저 세운 뒤에 되살린다. 되살아나면 SignedIn 이 통화 화면으로 갈아 끼우고,
        // 안 되면 지금 세워 둔 이 화면에서 평소처럼 받는다.
        //
        // 로그아웃으로 온 경우에는 금고가 비어 있어 아무 일도 일어나지 않는다 — 자리를 넘긴 뒤
        // 다음 사람이 앞사람 계정으로 들어가지 않게 하는 것이 그 빈 금고다.
        _ = vm.TryResumeAsync();
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

        // 통화 동작은 현장마다 다르다. 값이 없거나 말이 안 되면 옛 상수와 같은 기본값으로 떨어진다.
        // <b>쓸 때마다 읽는다</b> — 설정에서 바꾼 값이 다시 로그인해야 먹으면 상담원은
        // 자기가 고친 값이 안 쓰이는 줄 안다.
        var callPreferences = new JsonSettingsStore<CallPreferences>(
            AppPaths.CallPreferences, new CallPreferences());

        // 통화 중에는 받지 않고, 알림은 상담원이 이미 보고 있는 그 한 자리에 적는다.
        // 두 closure 가 아래에서야 채워지는 _softphone 을 보지만, 불리는 시점은 언제나 그 뒤다.
        var update = new UpdateViewModel(
            runtime.Updates,
            AppRelease.Version,
            AppRelease.Channel,
            AppPaths.UpdateDownloads,
            () => DateTimeOffset.UtcNow,
            () => _softphone?.WindowMode == WindowMode.Idle,
            // 업데이트 작업은 스스로 실패를 삼키므로 여기서 붙잡을 것이 없다.
            // 예상 못 한 예외는 App 의 UnobservedTaskException 이 파일로 남긴다.
            _ => { },
            message => _softphone?.ShowNotice(message));

        update.FolderRequested += (_, path) => OpenFolder(path);

        var softphone = new SoftphoneViewModel(
            runtime.Calls,
            runtime.Server,
            runtime.Phone,
            login.Session.Agent,
            () => DateTimeOffset.UtcNow,
            useSoftphone,
            login.Session.SoftphoneConfig,
            new JsonSettingsStore<AnnouncementReadState>(
                AppPaths.AnnouncementReads, new AnnouncementReadState()),
            () => callPreferences.Load(new CallPreferences()),
            update);

        // 창을 만지는 일은 모두 여기 한 줄을 지난다.
        // 서버 이벤트는 이미 UI 스레드로 넘어와 있으므로 여기서는 그대로 받는다.
        softphone.WindowModeRequested += (_, mode) => ApplyMode(mode, softphone);
        runtime.Events.ConnectionStateChanged += (_, state) =>
            Dispatcher.Invoke(() => softphone.OnConnectionStateChanged(state));

        // SIP 스레드에서 올라온다. UI 스레드로 옮기지 않으면 창 전환이 조용히 멈춘다.
        runtime.Phone.CallStatusChanged += (_, status) =>
            Dispatcher.Invoke(() => softphone.Dial.OnSoftphoneCallStatusChanged(status));
        // 등록 상태는 지금까지 어디에도 안 남았다. 상담원이 "전화기 오류" 라고만 말하면
        // 우리가 볼 수 있는 것이 없었다. 같은 상태가 이어지면 적지 않는다 — 등록 갱신마다 쌓인다.
        var lastRegistration = runtime.Phone.Status.State;
        runtime.Phone.RegistrationStatusChanged += (_, status) =>
            Dispatcher.Invoke(() =>
            {
                if (status.State != lastRegistration)
                {
                    lastRegistration = status.State;
                    var why = string.IsNullOrWhiteSpace(status.Reason) ? string.Empty : $" 사유={status.Reason}";
                    App.Log($"전화 등록 {status.State}{why}");
                }

                softphone.DeskPhone.OnRegistrationStatusChanged(status);
            });

        // 이미 등록이 끝난 뒤에 붙을 수도 있다. 현재 값을 한 번 밀어 넣는다.
        softphone.DeskPhone.OnRegistrationStatusChanged(runtime.Phone.Status);
        runtime.Events.HandlerFailed += (_, ex) => App.LogError(ex);
        softphone.Dial.SelfAnswerFailed += (_, ex) => App.LogError(ex);
        softphone.Diagnostic += (_, message) => App.Log(message);
        softphone.AttentionRequested += (_, alert) => RaiseAttention(alert);

        // 알려 둔 전화가 남에게 갔거나 끝났다. 알림 센터에 지난 전화를 남겨 두지 않는다.
        softphone.AttentionDismissed += (_, _) => _tray.DismissBalloon();
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
        _update = update;

        ApplyMode(WindowMode.Idle, softphone);
        StartHotkeys(softphone);
        _timer.Start();

        await runtime.StartAsync();

        // 소프트폰 자리인데 못 켰으면 그 사유가 전부다. 여기서 안 적으면 어디에도 안 남는다.
        if (runtime.SoftphoneStartFailure is { } cannotStart)
        {
            App.Log($"소프트폰을 켜지 못했다: {cannotStart}");
            softphone.DeskPhone.OnSoftphoneUnavailable(cannotStart);
        }

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

        // 창 모양과 벨은 같은 사실("전화가 와 있다")에서 나온다. 두 곳에서 따로 정하면 어긋난다.
        if (mode == WindowMode.Ringing) StartRinging();
        else _ring.Stop();
    }

    /// <summary>
    /// 실제로 얹힌 색을 남긴다. "화면이 이상하다" 는 신고에서 사전이 제대로 갈렸는지를
    /// 이 한 줄로 가른다 — 색을 못 찾으면 창은 예외 없이 그냥 검게 뜬다.
    /// </summary>
    private static void LogTheme(ThemePalette palette)
        => App.Log($"테마 {palette} · 배경 {ResolvedColour("BrushBackground")}"
            + $" · 글자 {ResolvedColour("BrushText")}");

    /// <summary>지금 얹힌 색. 못 찾으면 그렇다고 적는다 — 그 자리가 검게 뜨는 이유다.</summary>
    private static string ResolvedColour(string token)
        => Application.Current?.TryFindResource(token) is SolidColorBrush brush
            ? brush.Color.ToString()
            : "없음";

    /// <summary>
    /// 트레이로 내린다. <b>내려간 자리는 비어 있다</b> — 상태를 안 바꾸면 상담원이 껐다고
    /// 생각한 자리로 전화가 가고, 고객은 아무도 없는 자리에서 벨소리만 듣는다.
    ///
    /// 그 사실을 반드시 알린다. 조용히 자리비움으로 바꾸면 상담원은 왜 전화가 안 오는지 모른다.
    /// </summary>
    private void HideToTray()
    {
        Hide();
        _softphone?.GoAway();

        _tray.Balloon(new Alert(
            "자리비움",
            "트레이로 내려갔습니다. 이 자리로는 전화가 배정되지 않습니다. 트레이 아이콘을 눌러 돌아오세요."));
    }

    /// <summary>
    /// 트레이에서 창을 다시 부른다. 기다리던 자리비움은 접되, <b>대기로 되돌리지는 않는다</b> —
    /// 창만 열어 두고 자리를 뜨는 일이 흔하다. 돌아왔다는 것은 상담원이 직접 누른다.
    /// </summary>
    private void ComeBack()
    {
        WindowAttention.Restore(this);
        _softphone?.CameBack();
    }

    /// <summary>
    /// 벨소리 장치는 설정 · 오디오 탭에서 고른 것을 따른다. 안 골랐으면 통화 출력으로 나간다 —
    /// 그 판정은 <see cref="AudioDeviceController"/> 가 이미 갖고 있다.
    /// </summary>
    private void StartRinging()
    {
        var preset = _general.Load().Sane().RingTone;
        if (preset == RingTonePreset.Silent) return;

        try
        {
            var devices = new WasapiDeviceEnumerator();
            var chosen = new JsonSettingsStore<AudioDeviceSelection>(
                AppPaths.AudioDevices, new AudioDeviceSelection()).Load();

            var ringRender = new AudioDeviceController(devices).Resolve(chosen).RingRender;

            _ring.Start(
                ringRender is null ? null : devices.Open(ringRender.Id),
                RingTonePattern.For(preset));
        }
        catch (Exception ex)
        {
            // 벨이 안 울려도 전화는 받아야 한다.
            App.Log($"벨소리를 울리지 못했다: {ex.Message}");
        }
    }

    /// <summary>
    /// 저장된 일반 설정을 실제로 반영한다. 시작 프로그램 등록은 정책으로 막힐 수 있으므로
    /// 실패 사유를 돌려주고 화면이 그 자리에서 알린다.
    /// </summary>
    private string? ApplyGeneral(GeneralPreferences preferences)
    {
        _theme.Apply(preferences.Theme);
        Topmost = preferences.AlwaysOnTop;

        // 트레이로 내리는 설정을 끄면서 창이 숨어 있으면 앱을 다시 꺼낼 길이 애매해진다.
        if (!preferences.CloseToTray && !IsVisible) Show();

        return AutoStartRegistration.Apply(
            preferences.AutoStart,
            AppRelease.ExecutablePath,
            Environment.GetEnvironmentVariable(AppPaths.ProfileVariable));
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
            // 핫키와 업데이트는 로그인한 뒤에만 뜻이 있다. 로그인 전에는 걸 창 핸들도 없고
            // (등록 실패를 그 자리에서 알릴 수 없다) 물어볼 서버도 없다 — 그 탭은 아예 안 만든다.
            var signedIn = _softphone is not null;

            var vm = new SettingsViewModel(
                new JsonSettingsStore<AppSettings>(AppPaths.Settings, new AppSettings()),
                new JsonSettingsStore<AudioDeviceSelection>(AppPaths.AudioDevices, new AudioDeviceSelection()),
                new WasapiDeviceEnumerator(),
                useSoftphone,
                signedIn
                    ? new JsonSettingsStore<HotkeySettings>(AppPaths.Hotkeys, new HotkeySettings())
                    : null,
                new JsonSettingsStore<CallPreferences>(AppPaths.CallPreferences, new CallPreferences()),
                signedIn ? _transferHotkeys : null,
                _general,
                ApplyGeneral,
                signedIn ? ApplyHotkeys : null,
                _update,
                ProtocolRegistration.IsRegistered(AppRelease.ExecutablePath),
                () => ProtocolRegistration.Register(AppRelease.ExecutablePath));

            vm.FolderRequested += (_, path) => OpenFolder(path);

            vm.Closed += (_, _) =>
            {
                // 저장된 주소를 곧바로 다시 읽는다. 다음 로그인이 새 주소로 나가야 한다.
                _settings = new JsonSettingsStore<AppSettings>(AppPaths.Settings, new AppSettings()).Load();

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

    /// <summary>
    /// 웹에서 넘어온 로그인 요청. 받을지는 <see cref="HandoffGate"/> 가 정하고, 여기서는 그 판정을 따른다.
    ///
    /// <b>토큰을 교환한 뒤에야 지금 세션을 내린다.</b> 순서를 뒤집으면 교환이 실패했을 때
    /// 앉아 있던 상담원이 아무 이유 없이 로그아웃된 채 남는다.
    /// </summary>
    private async void OnHandoffRequested(ProtocolRequest request)
    {
        var onCall = _softphone is not null && _softphone.WindowMode != WindowMode.Idle;

        var decision = HandoffGate.For(
            signedIn: _softphone is not null,
            onCall: onCall,
            sameServer: request.TargetsSameServer(_settings.BaseUri),
            _softphone?.AgentName,
            _softphone?.Extension);

        App.Log($"웹 로그인 요청 판정: {decision.Verdict}");

        // 웹 화면이 이 결말을 기다리고 있다. 안 적으면 그쪽은 16번 물어본 끝에
        // "자동 연결을 완료하지 못했습니다" 를 띄운다 — 여기서 무슨 일이 났든.
        _handoffs.Mark(request.HandoffToken, HandoffStatus.Pending);

        switch (decision.Verdict)
        {
            case HandoffVerdict.Refuse:
                _handoffs.Mark(request.HandoffToken, HandoffStatus.Failed(decision.Message));
                Tell(decision.Message);
                return;

            // 조용히 갈아타면 상담원 모르게 남의 계정이 된다. 지금 누구로 앉아 있는지 적어 물어본다.
            case HandoffVerdict.AskToSwitch when MessageBox.Show(
                    this, decision.Message, "웹에서 온 로그인", MessageBoxButton.YesNo, MessageBoxImage.Question)
                != MessageBoxResult.Yes:
                _handoffs.Mark(
                    request.HandoffToken,
                    HandoffStatus.Failed("이 자리에서 계정 전환을 취소했습니다."));
                return;
        }

        await AcceptHandoffAsync(request);
    }

    private async Task AcceptHandoffAsync(ProtocolRequest request)
    {
        // 페이로드가 적어 보낸 주소가 아니라 <b>이 PC 에 설정된 주소</b>로 간다.
        // 게이트가 둘이 같은 서버인지 이미 확인했다.
        var auth = new AuthClient(new HttpClient { BaseAddress = _settings.BaseUri });

        HandoffResult exchanged;
        try
        {
            exchanged = await auth.ExchangeHandoffAsync(request.HandoffToken, CancellationToken.None);
        }
        catch (Exception ex) when (ex is CtiServerException or HttpRequestException or TaskCanceledException)
        {
            App.LogError(ex);

            // 없음·만료·이미 씀·비활성이 서버에서 전부 같은 401 이다. 가를 근거가 없으므로 가르지 않는다.
            const string expired = "웹에서 넘어온 로그인이 만료됐거나 이미 쓰였습니다. 웹에서 다시 눌러 주세요.";
            _handoffs.Mark(request.HandoffToken, HandoffStatus.Failed(expired));
            Tell(expired);
            return;
        }

        // SIP 설정은 여기서만 온다. 못 받아도 로그인은 살린다 — 실기기 자리는 어차피 쓰지 않는다.
        SoftphoneConfig? softphone = null;
        try
        {
            softphone = (await auth.GetDesktopSessionAsync(
                exchanged.Tokens.AccessToken, CancellationToken.None)).SoftphoneConfig;
        }
        catch (Exception ex) when (ex is CtiServerException or HttpRequestException or TaskCanceledException)
        {
            App.LogError(ex);
        }

        // 앞 상담원의 refresh token 을 서버에 돌려준다. 안 돌려주면 그 계정이 서버에서 계속 살아 있다.
        var previous = _tokens.Load()?.RefreshToken;
        await ShutdownAsync();
        if (!string.IsNullOrEmpty(previous)) await auth.LogoutAsync(previous, CancellationToken.None);

        _tokens.Save(exchanged.Tokens);

        // 소프트폰이냐 실기기냐는 자리의 성질이라 웹이 정하지 않는다. 이 PC 에 남아 있는 선택을 따른다.
        var useSoftphone = new SavedLoginStore(AppPaths.SavedLogin).Load().UseSoftphone;

        await StartRuntimeAsync(
            new LoginResult(
                exchanged.Tokens,
                new SessionSummary { Agent = exchanged.Agent, SoftphoneConfig = softphone }),
            useSoftphone);

        // 자리에 앉았다. 이걸 적어야 웹 화면이 기다림을 끝낸다.
        _handoffs.Mark(request.HandoffToken, HandoffStatus.Connected);
    }

    /// <summary>
    /// 통화 중 숫자 키를 미리 정해 둔 자리로 넘기는 지시로 읽는다.
    ///
    /// 글자를 치고 있는 칸에서는 가로채지 않는다 — 번호를 적다가 1 을 눌렀는데 전화가
    /// 넘어가면 손쓸 방법이 없다. 걸어 두지 않은 숫자는 아무 일도 하지 않는다.
    /// </summary>
    private void OnPreviewKeyDown(object sender, KeyEventArgs e)
    {
        if (_softphone is not { } softphone) return;

        var digit = e.Key switch
        {
            >= Key.D1 and <= Key.D9 => e.Key - Key.D0,
            >= Key.NumPad1 and <= Key.NumPad9 => e.Key - Key.NumPad0,
            _ => 0,
        };
        if (digit == 0) return;

        var slot = TransferHotkeys.Resolve(
            _transferHotkeys.Load().Sane().Slots,
            digit,
            softphone.WindowMode,
            typingInATextBox: Keyboard.FocusedElement is TextBoxBase,
            modifierHeld: Keyboard.Modifiers != ModifierKeys.None);

        if (slot is null) return;

        e.Handled = true;
        App.Log($"전환 핫키 {slot.Slot} → {slot.DisplayName} ({slot.Mode})");

        _ = slot.Mode == TransferHotkeyMode.Attended
            ? softphone.Transfer.ConsultAsync(slot.Target)
            : softphone.Transfer.TransferToAsync(slot.Target);
    }

    /// <summary>
    /// 웹 로그인에 대한 답. 통화 화면이 서 있으면 그 알림 자리에 적는다 —
    /// 통화 중에 모달 창을 띄우면 상담원이 그것부터 치워야 통화를 이어갈 수 있다.
    /// </summary>
    private void Tell(string message)
    {
        if (_softphone is { } softphone)
        {
            softphone.ShowNotice(message);
            return;
        }

        MessageBox.Show(this, message, "웹에서 온 로그인", MessageBoxButton.OK, MessageBoxImage.Information);
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
        _update = null;
        _tray.Show(CurrentTrayState());

        if (_runtime is not null)
        {
            await _runtime.DisposeAsync();
            _runtime = null;
        }
    }
}
