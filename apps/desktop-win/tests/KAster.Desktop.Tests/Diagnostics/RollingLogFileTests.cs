using System.IO;
using KAster.Desktop.Core.Diagnostics;

namespace KAster.Desktop.Tests.Diagnostics;

/// <summary>
/// 진단 로그. 상담원 PC 에서 앱이 조용히 멈추거나 "전화가 안 걸린다" 는 신고가 들어왔을 때
/// 이 파일이 유일한 단서다.
///
/// <b>무한히 커지면 안 된다.</b> 재연결이 실패하는 서버를 만나면 오류 하나가 몇 초마다
/// 스택 트레이스째 쌓인다 — 며칠이면 상담원 PC 의 디스크를 먹는다.
/// </summary>
public sealed class RollingLogFileTests : IDisposable
{
    private readonly string _root = Path.Combine(
        Path.GetTempPath(), "kaster-log-" + Guid.NewGuid().ToString("N"));

    private string Path_(string name) => Path.Combine(_root, name);

    [Fact]
    public void A_line_lands_in_the_file_even_if_the_folder_is_not_there_yet()
    {
        var log = new RollingLogFile(Path_("call.log"));

        log.Append("발신 요청 01011112222");

        Assert.Contains("발신 요청 01011112222", File.ReadAllText(Path_("call.log")));
    }

    /// <summary>한도를 넘으면 지난 것을 옆으로 밀고 새로 시작한다. 최근 것이 잘리면 안 된다.</summary>
    [Fact]
    public void Passing_the_limit_pushes_the_old_file_aside()
    {
        var log = new RollingLogFile(Path_("call.log"), maxBytes: 200);

        for (var i = 0; i < 40; i++) log.Append($"줄 {i}");

        Assert.True(File.Exists(Path_("call.log.1")));
        Assert.True(new FileInfo(Path_("call.log")).Length <= 200);
        Assert.Contains("줄 39", File.ReadAllText(Path_("call.log")));
    }

    /// <summary>
    /// 백업은 하나만 남긴다. 세대를 늘리면 "무한히 커지지 않게 한다" 는 목적이 그대로 무너진다.
    /// </summary>
    [Fact]
    public void Only_one_backup_is_kept()
    {
        var log = new RollingLogFile(Path_("call.log"), maxBytes: 100);

        for (var i = 0; i < 200; i++) log.Append($"줄 {i}");

        Assert.False(File.Exists(Path_("call.log.2")));
        Assert.True(new FileInfo(Path_("call.log.1")).Length <= 200);
    }

    /// <summary>기록을 못 남겨도 통화는 계속 가야 한다. 로그가 앱을 죽이면 안 된다.</summary>
    [Fact]
    public void A_path_that_cannot_be_written_is_swallowed()
    {
        Directory.CreateDirectory(_root);
        File.WriteAllText(Path_("blocker"), "이건 파일이다");

        // 파일 안쪽 경로라 디렉터리를 만들 수 없다.
        var log = new RollingLogFile(Path.Combine(_root, "blocker", "call.log"));

        log.Append("아무 일도 나면 안 된다");
    }

    /// <summary>한 줄이 한도보다 길어도 버리지 않는다. 가장 긴 줄이 대개 가장 중요한 스택 트레이스다.</summary>
    [Fact]
    public void A_line_longer_than_the_limit_is_still_written()
    {
        var log = new RollingLogFile(Path_("error.log"), maxBytes: 50);

        log.Append(new string('가', 200));

        Assert.Contains("가가가", File.ReadAllText(Path_("error.log")));
    }

    public void Dispose()
    {
        if (Directory.Exists(_root)) Directory.Delete(_root, recursive: true);
    }
}
