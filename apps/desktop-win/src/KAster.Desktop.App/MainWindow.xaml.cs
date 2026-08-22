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
    private AppSettings _settings;

    /// <summary>설정 화면에서 돌아왔을 때 되돌아갈 화면.</summary>
    private Action? _leaveSettings;
    private readonly TokenVault _tokens;
    private readonly WindowModeService _windowMode;
    private readonly DispatcherTimer _timer = new() { Interval = TimeSpan.FromSeconds(1) };

    private SoftphoneRuntime? _runtime;
    private SoftphoneViewModel? _softphone;

    public MainWindow()
    {
        InitializeComponent();

        _settings = new JsonSettingsStore<AppSettings>(AppPaths.Settings).Load(new AppSettings());
        _tokens = new TokenVault(AppPaths.TokenVault);
        _windowMode = new WindowModeService(this);

        _timer.Tick += (_, _) => _softphone?.Tick();

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
            login.Session.SoftphoneConfig);

        // 창을 만지는 일은 모두 여기 한 줄을 지난다.
        // 서버 이벤트는 이미 UI 스레드로 넘어와 있으므로 여기서는 그대로 받는다.
        softphone.WindowModeRequested += (_, mode) => ApplyMode(mode, softphone);
        runtime.Events.ConnectionStateChanged += (_, state) =>
            Dispatcher.Invoke(() => softphone.OnConnectionStateChanged(state));

        // SIP 스레드에서 올라온다. UI 스레드로 옮기지 않으면 창 전환이 조용히 멈춘다.
        runtime.Phone.CallStatusChanged += (_, status) =>
            Dispatcher.Invoke(() => softphone.OnSoftphoneCallStatusChanged(status));
        runtime.Phone.RegistrationStatusChanged += (_, status) =>
            Dispatcher.Invoke(() => softphone.OnRegistrationStatusChanged(status));

        // 이미 등록이 끝난 뒤에 붙을 수도 있다. 현재 값을 한 번 밀어 넣는다.
        softphone.OnRegistrationStatusChanged(runtime.Phone.Status);
        runtime.Events.HandlerFailed += (_, ex) => App.LogError(ex);
        softphone.SelfAnswerFailed += (_, ex) => App.LogError(ex);
        softphone.Diagnostic += (_, message) => App.Log(message);
        runtime.NonCallEvent += (_, evt) => softphone.Apply(evt);
        softphone.SignOutRequested += async (_, _) => await SignOutAsync();
        softphone.SettingsRequested += (_, _) =>
            ShowSettings(useSoftphone, () => ApplyMode(softphone.WindowMode, softphone));
        runtime.RefreshHandler.SignedOut += (_, _) => Dispatcher.Invoke(SignOut);

        _runtime = runtime;
        _softphone = softphone;

        ApplyMode(WindowMode.Idle, softphone);
        _timer.Start();

        await runtime.StartAsync();

        // 내선 목록과 발신번호는 로그인 뒤 한 번만 받아 두면 된다.
        // 실패해도 여기서 멈추지 않는다 — 발신만 못 하고 수신·통화는 그대로 돈다.
        await softphone.LoadDialSetupAsync();
    }

    private void ApplyMode(WindowMode mode, SoftphoneViewModel softphone)
    {
        Host.Content = mode switch
        {
            // 큐가 물어보는 호와 이미 울리고 있는 호는 누를 것이 다르다.
            // 전자는 수락/거절, 후자는 받기/거절이다.
            WindowMode.Ringing when softphone.HasOffer => new OfferView { DataContext = softphone },
            WindowMode.Ringing => new RingingView { DataContext = softphone },
            WindowMode.Transferring when softphone.IsChoosingTransferTarget
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
    /// </summary>
    private void ShowSettings(bool useSoftphone, Action leave)
    {
        _leaveSettings = leave;

        var vm = new SettingsViewModel(
            new JsonSettingsStore<AppSettings>(AppPaths.Settings, new AppSettings()),
            new JsonSettingsStore<AudioDeviceSelection>(AppPaths.AudioDevices, new AudioDeviceSelection()),
            new WasapiDeviceEnumerator(),
            useSoftphone);

        vm.Closed += (_, _) =>
        {
            // 저장된 주소를 곧바로 다시 읽는다. 다음 로그인이 새 주소로 나가야 한다.
            _settings = new JsonSettingsStore<AppSettings>(AppPaths.Settings).Load(new AppSettings());
            var back = _leaveSettings;
            _leaveSettings = null;
            back?.Invoke();
        };

        _windowMode.Request(WindowMode.Settings);
        Host.Content = new SettingsView { DataContext = vm };
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
        _timer.Stop();
        _softphone = null;

        if (_runtime is not null)
        {
            await _runtime.DisposeAsync();
            _runtime = null;
        }
    }
}
