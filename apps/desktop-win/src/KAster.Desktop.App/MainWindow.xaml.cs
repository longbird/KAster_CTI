using System.Net.Http;
using System.Runtime.Versioning;
using System.Windows;
using System.Windows.Threading;
using KAster.Desktop.App.Services;
using KAster.Desktop.App.ViewModels;
using KAster.Desktop.App.Views;
using KAster.Desktop.Core.Server;
using KAster.Desktop.Core.Storage;

namespace KAster.Desktop.App;

/// <summary>
/// 조립 지점. 로그인 화면을 띄우고, 로그인이 끝나면 런타임을 세워 통화 화면으로 넘긴다.
/// 창 모양은 <see cref="WindowModeService"/> 에게만 맡긴다.
/// </summary>
[SupportedOSPlatform("windows")]
public partial class MainWindow : Window
{
    private readonly AppSettings _settings;
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
        var vm = new LoginViewModel(auth, _tokens);
        vm.SignedIn += async (_, result) => await StartRuntimeAsync(result);

        _windowMode.Request(WindowMode.Idle);
        Host.Content = new LoginView { DataContext = vm };
    }

    private async Task StartRuntimeAsync(LoginResult login)
    {
        var runtime = new SoftphoneRuntime(
            _settings,
            _tokens,
            login.Session.Agent,
            login.Session.SoftphoneConfig,
            action => Dispatcher.Invoke(action));

        var softphone = new SoftphoneViewModel(
            runtime.Calls,
            runtime.Server,
            runtime.Phone,
            login.Session.Agent,
            () => DateTimeOffset.UtcNow);

        // 창을 만지는 일은 모두 여기 한 줄을 지난다.
        // 서버 이벤트는 이미 UI 스레드로 넘어와 있으므로 여기서는 그대로 받는다.
        softphone.WindowModeRequested += (_, mode) => ApplyMode(mode, softphone);
        runtime.Events.ConnectionStateChanged += (_, state) =>
            Dispatcher.Invoke(() => softphone.OnConnectionStateChanged(state));

        // SIP 스레드에서 올라온다. UI 스레드로 옮기지 않으면 창 전환이 조용히 멈춘다.
        runtime.Phone.CallStatusChanged += (_, status) =>
            Dispatcher.Invoke(() => softphone.OnSoftphoneCallStatusChanged(status));
        runtime.Events.HandlerFailed += (_, ex) => App.LogError(ex);
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
            WindowMode.Ringing => new RingingView { DataContext = softphone },
            WindowMode.Talking or WindowMode.Transferring or WindowMode.AfterCall
                => new TalkingView { DataContext = softphone },
            _ => new IdleView { DataContext = softphone },
        };

        _windowMode.Request(mode);
    }

    private async void SignOut()
    {
        await ShutdownAsync();
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
