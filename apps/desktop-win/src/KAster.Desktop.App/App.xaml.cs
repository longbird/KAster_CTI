using System.Runtime.Versioning;
using System.Windows;
using System.Windows.Threading;
using KAster.Desktop.App.Services;
using KAster.Desktop.Core.Diagnostics;
using KAster.Desktop.Core.Protocol;

namespace KAster.Desktop.App;

[SupportedOSPlatform("windows")]
public partial class App : Application
{
    /// <summary>
    /// 두 파일 모두 <see cref="AppPaths.Root"/> 아래에 놓인다 — 한 PC 에 상담원이 둘 있으면
    /// 프로필마다 자리가 갈려야 한다. 크기 상한도 여기서 온다.
    ///
    /// 여기 남는 것은 통화 흐름과 예외뿐이다. <b>비밀번호·토큰·누른 자릿수는 들어가지 않는다</b> —
    /// SIP 비밀번호는 화면에만 있고, 토큰은 HTTP 헤더와 소켓 auth 로만 나가며,
    /// 키패드 자릿수를 남기는 자리는 없다. 웹에서 넘어오는 핸드오프 토큰도 마찬가지다.
    /// </summary>
    private static readonly RollingLogFile CallLog = new(AppPaths.CallLog);

    private static readonly RollingLogFile ErrorLog = new(AppPaths.ErrorLog);

    private SingleInstance? _instance;

    /// <summary>
    /// 웹에서 넘어온 로그인 요청이 창을 기다리는 자리. 앱이 꺼져 있을 때 링크를 누르면
    /// 요청이 프로세스 인자로 <b>창보다 먼저</b> 도착한다.
    /// </summary>
    public static ProtocolInbox Protocol { get; } = new();

    /// <summary>
    /// 잡히지 않은 예외를 파일로 남긴다. 상담원 PC 에서 앱이 조용히 멈추면 이 파일이 유일한 단서다.
    /// </summary>
    protected override void OnStartup(StartupEventArgs e)
    {
        DispatcherUnhandledException += OnDispatcherException;
        AppDomain.CurrentDomain.UnhandledException += (_, args) => LogError(args.ExceptionObject as Exception);
        TaskScheduler.UnobservedTaskException += (_, args) => LogError(args.Exception);

        var url = ProtocolArguments.UrlFrom(e.Args);

        // 창을 만들기 <b>전에</b> 가른다. 두 벌이 뜨면 같은 내선으로 소프트폰이 둘 등록되고
        // PBX 는 어느 쪽에 전화를 넘길지 알 수 없게 된다.
        _instance = SingleInstance.Claim(Environment.GetEnvironmentVariable(AppPaths.ProfileVariable), url);
        if (_instance is null)
        {
            Shutdown();
            return;
        }

        _instance.UrlReceived += (_, received) => Accept(received);

        // 등록은 조용히 실패할 수 있다 (정책으로 막힌 PC). 실패해도 앱은 뜬다 —
        // 웹 연동만 안 될 뿐이고, 그 사실은 설정 화면의 웹 연동 자리에서 보인다.
        if (ProtocolRegistration.Register(AppRelease.ExecutablePath) is { } failure)
        {
            Log(failure);
        }

        if (url is not null) Accept(url);

        base.OnStartup(e);
    }

    protected override void OnExit(ExitEventArgs e)
    {
        _instance?.Dispose();
        base.OnExit(e);
    }

    /// <summary>
    /// 밖에서 온 주소 한 건. 읽을 수 없으면 <b>버린다</b> — 주소창에 아무나 칠 수 있는 값이라
    /// 사유를 화면에 띄울 만한 것이 아니다. 토큰은 로그에 남기지 않는다.
    /// </summary>
    private static void Accept(string raw)
    {
        if (ProtocolRequest.TryParse(raw, out var request, out var error))
        {
            Log("웹에서 로그인 요청이 왔다");
            Protocol.Enqueue(request!);
            return;
        }

        Log($"웹 요청을 읽지 못했다: {error}");
    }

    private void OnDispatcherException(object sender, DispatcherUnhandledExceptionEventArgs e)
    {
        LogError(e.Exception);

        // 통화 중에 창이 사라지면 상담원이 대응할 수 없다. 화면은 살려 두고 기록만 남긴다.
        e.Handled = true;
    }

    /// <summary>
    /// 통화 흐름 기록. 상담원이 "전화가 안 걸린다" 고 하면 화면 캡처만으로는 알 수 없다 —
    /// 요청이 나갔는지, PBX 가 되걸었는지, 어디서 끊겼는지가 여기 남는다.
    /// </summary>
    public static void Log(string message)
        => CallLog.Append($"{DateTimeOffset.Now:HH:mm:ss.fff} {message}");

    public static void LogError(Exception? ex)
    {
        if (ex is null) return;

        ErrorLog.Append($"{DateTimeOffset.Now:O} {ex}{Environment.NewLine}");
    }
}
