using System.IO;
using System.Windows;
using System.Windows.Threading;
using KAster.Desktop.App.Services;

namespace KAster.Desktop.App;

public partial class App : Application
{
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
    {
        try
        {
            Directory.CreateDirectory(AppPaths.Root);
            File.AppendAllText(
                Path.Combine(AppPaths.Root, "call.log"),
                $"{DateTimeOffset.Now:HH:mm:ss.fff} {message}{Environment.NewLine}");
        }
        catch (IOException)
        {
            // 기록을 못 남겨도 통화는 계속 간다.
        }
    }

    public static void LogError(Exception? ex)
    {
        if (ex is null) return;

        try
        {
            Directory.CreateDirectory(AppPaths.Root);
            File.AppendAllText(
                Path.Combine(AppPaths.Root, "error.log"),
                $"{DateTimeOffset.Now:O} {ex}{Environment.NewLine}{Environment.NewLine}");
        }
        catch (IOException)
        {
            // 로그를 못 써도 앱은 계속 간다.
        }
    }
}
