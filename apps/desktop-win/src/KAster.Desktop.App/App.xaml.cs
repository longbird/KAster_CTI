using System.Windows;
using System.Windows.Threading;
using KAster.Desktop.App.Services;
using KAster.Desktop.Core.Diagnostics;

namespace KAster.Desktop.App;

public partial class App : Application
{
    /// <summary>
    /// 두 파일 모두 <see cref="AppPaths.Root"/> 아래에 놓인다 — 한 PC 에 상담원이 둘 있으면
    /// 프로필마다 자리가 갈려야 한다. 크기 상한도 여기서 온다.
    ///
    /// 여기 남는 것은 통화 흐름과 예외뿐이다. <b>비밀번호·토큰·누른 자릿수는 들어가지 않는다</b> —
    /// SIP 비밀번호는 화면에만 있고, 토큰은 HTTP 헤더와 소켓 auth 로만 나가며,
    /// 키패드 자릿수를 남기는 자리는 없다.
    /// </summary>
    private static readonly RollingLogFile CallLog = new(AppPaths.CallLog);

    private static readonly RollingLogFile ErrorLog = new(AppPaths.ErrorLog);

    /// <summary>
    /// 잡히지 않은 예외를 파일로 남긴다. 상담원 PC 에서 앱이 조용히 멈추면 이 파일이 유일한 단서다.
    /// </summary>
    protected override void OnStartup(StartupEventArgs e)
    {
        DispatcherUnhandledException += OnDispatcherException;
        AppDomain.CurrentDomain.UnhandledException += (_, args) => LogError(args.ExceptionObject as Exception);
        TaskScheduler.UnobservedTaskException += (_, args) => LogError(args.Exception);

        base.OnStartup(e);
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
