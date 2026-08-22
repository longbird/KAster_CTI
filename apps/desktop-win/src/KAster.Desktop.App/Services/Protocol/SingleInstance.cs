using System.IO;
using System.IO.Pipes;
using System.Runtime.Versioning;
using System.Text;
using KAster.Desktop.Core.Protocol;

namespace KAster.Desktop.App.Services;

/// <summary>
/// 인스턴스 하나를 가르는 이름. <b>순수 함수다</b> — 뮤텍스와 파이프를 실제로 여는 일은
/// <see cref="SingleInstance"/> 가 한다.
/// </summary>
public static class SingleInstanceNames
{
    private const string Base = "KAsterCtiDesktop";

    public static string MutexFor(string? profile) => $"Local\\{Base}-{Slug(profile)}";

    public static string PipeFor(string? profile) => $"{Base}-{Slug(profile)}";

    /// <summary>
    /// 프로필 이름은 사람이 명령줄에 적는 값이라 공백·한글·경로 구분자가 섞여 들어온다.
    /// 파이프 이름에 못 쓰는 글자가 있으면 파이프가 안 열리고, 그러면 인스턴스가 조용히 둘이 된다.
    /// 글자를 버리는 대신 <b>부호 없는 해시를 덧붙여</b> 서로 다른 프로필이 같은 이름으로 뭉치지 않게 한다.
    /// </summary>
    private static string Slug(string? profile)
    {
        var name = profile?.Trim();
        if (string.IsNullOrEmpty(name)) return "default";

        var safe = new StringBuilder(name.Length);
        foreach (var c in name)
        {
            safe.Append(char.IsAsciiLetterOrDigit(c) || c is '-' or '_' ? c : '_');
        }

        var hash = Convert.ToHexString(
            System.Security.Cryptography.SHA256.HashData(Encoding.UTF8.GetBytes(name)))[..8];

        return $"{safe}.{hash}";
    }
}

/// <summary>실행 인자에서 우리 요청을 골라낸다. 나머지 인자는 우리 것이 아니다.</summary>
public static class ProtocolArguments
{
    public static string? UrlFrom(IReadOnlyList<string> args)
        => args.FirstOrDefault(arg => ProtocolRequest.TryParse(arg, out _, out _))
            // 파싱까지는 안 되더라도 우리 스킴이면 이쪽 인스턴스가 다뤄야 한다.
            // 그래야 잘못된 요청의 사유를 상담원에게 말할 수 있다.
            ?? args.FirstOrDefault(arg => ProtocolRequest.Schemes.Any(
                scheme => arg.StartsWith(scheme + ":", StringComparison.OrdinalIgnoreCase)));
}

/// <summary>
/// 앱이 한 벌만 뜨게 한다.
///
/// <c>kastercti://</c> 를 누르면 윈도우는 앱을 <b>한 벌 더 띄운다</b>. 그대로 두면 같은 내선으로
/// 소프트폰이 둘 등록되고, PBX 는 어느 쪽에 전화를 넘길지 알 수 없게 된다. 두 번째 인스턴스는
/// 주소만 먼저 뜬 인스턴스에 넘기고 스스로 끝난다.
/// </summary>
[SupportedOSPlatform("windows")]
public sealed class SingleInstance : IDisposable
{
    private readonly string _pipeName;
    private readonly Mutex _mutex;
    private readonly CancellationTokenSource _life = new();

    private SingleInstance(Mutex mutex, string pipeName)
    {
        _mutex = mutex;
        _pipeName = pipeName;
    }

    /// <summary>먼저 뜬 인스턴스에 주소가 도착했다.</summary>
    public event EventHandler<string>? UrlReceived;

    /// <summary>
    /// 이 프로세스가 첫 인스턴스면 <see cref="SingleInstance"/> 를, 아니면 null 을 돌려준다.
    /// null 이면 <paramref name="url"/> 은 이미 먼저 뜬 쪽으로 넘어갔으니 그대로 끝내면 된다.
    /// </summary>
    public static SingleInstance? Claim(string? profile, string? url)
    {
        var mutex = new Mutex(initiallyOwned: true, SingleInstanceNames.MutexFor(profile), out var first);
        var pipeName = SingleInstanceNames.PipeFor(profile);

        if (first)
        {
            var instance = new SingleInstance(mutex, pipeName);
            instance.Listen();
            return instance;
        }

        mutex.Dispose();
        Forward(pipeName, url);
        return null;
    }

    /// <summary>
    /// 먼저 뜬 인스턴스에 주소를 넘긴다. 못 넘겨도 그냥 끝낸다 — 여기서 버티면 인스턴스가 둘이 된다.
    /// </summary>
    private static void Forward(string pipeName, string? url)
    {
        if (string.IsNullOrEmpty(url)) return;

        try
        {
            using var client = new NamedPipeClientStream(".", pipeName, PipeDirection.Out);
            client.Connect(timeout: 3000);

            using var writer = new StreamWriter(client, new UTF8Encoding(false)) { AutoFlush = true };
            writer.WriteLine(url);
        }
        catch (Exception ex) when (ex is IOException or TimeoutException or UnauthorizedAccessException)
        {
            App.LogError(ex);
        }
    }

    /// <summary>
    /// 한 번에 하나씩 받는다. 상담원이 웹에서 두 번 누르는 정도라 동시성이 필요하지 않고,
    /// 어차피 뒤에 온 것만 쓸모가 있다 (토큰이 1회용이다).
    /// </summary>
    private void Listen() => _ = Task.Run(async () =>
    {
        while (!_life.IsCancellationRequested)
        {
            try
            {
                using var server = new NamedPipeServerStream(
                    _pipeName, PipeDirection.In, 1, PipeTransmissionMode.Byte, PipeOptions.Asynchronous);

                await server.WaitForConnectionAsync(_life.Token);

                using var reader = new StreamReader(server, new UTF8Encoding(false));
                var line = await reader.ReadLineAsync(_life.Token);

                if (!string.IsNullOrWhiteSpace(line)) UrlReceived?.Invoke(this, line!.Trim());
            }
            catch (OperationCanceledException)
            {
                return;
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                // 파이프 한 번이 깨졌을 뿐이다. 다음 요청을 계속 받는다.
                App.LogError(ex);
            }
        }
    });

    public void Dispose()
    {
        _life.Cancel();
        _mutex.Dispose();
        _life.Dispose();
    }
}
