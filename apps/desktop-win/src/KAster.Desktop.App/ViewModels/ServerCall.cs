using System.Net.Http;
using KAster.Desktop.Core.Server;

namespace KAster.Desktop.App.ViewModels;

/// <summary>
/// 서버 명령을 보내고 실패는 화면 알림으로 돌린다. 명령 하나가 실패했다고 앱이 죽으면 안 된다.
///
/// 통화 화면과 그 아래 화면들(돌려주기·이력)이 <b>같은</b> 규칙을 써야 한다 — 한 화면만
/// 예외를 그대로 올리면 그 화면에서만 앱이 죽고, 왜 거기서만 죽는지 알기 어렵다.
/// 그래서 구현을 한 곳에 둔다.
/// </summary>
internal static class ServerCall
{
    public static async Task<T?> SendAsync<T>(Func<Task<T>> command, Action<string?> notify)
        where T : class
    {
        try
        {
            notify(null);
            return await command();
        }
        catch (CtiServerException ex)
        {
            notify(ex.Message);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            notify($"서버에 연결할 수 없다: {ex.Message}");
        }

        return null;
    }
}
