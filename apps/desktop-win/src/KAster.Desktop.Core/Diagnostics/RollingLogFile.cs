using System.Text;

namespace KAster.Desktop.Core.Diagnostics;

/// <summary>
/// 진단 로그 한 파일. 상담원 PC 에서 앱이 조용히 멈추거나 "전화가 안 걸린다" 는 신고가 들어왔을 때
/// 이 파일이 유일한 단서다.
///
/// <b>크기에 상한을 둔다.</b> 재연결이 실패하는 서버를 만나면 같은 오류가 몇 초마다 스택 트레이스째
/// 쌓인다 — 상한이 없으면 며칠 만에 상담원 PC 의 디스크를 먹는다.
///
/// 백업은 <b>한 세대만</b> 남긴다. 세대를 늘리면 상한을 둔 뜻이 그대로 무너진다.
/// </summary>
public sealed class RollingLogFile
{
    /// <summary>파일 하나의 상한. 백업까지 합쳐도 4MB 안쪽이라 상담원 PC 에 부담이 없다.</summary>
    public const long DefaultMaxBytes = 2 * 1024 * 1024;

    private readonly string _path;
    private readonly long _maxBytes;
    private readonly object _gate = new();

    public RollingLogFile(string path, long maxBytes = DefaultMaxBytes)
    {
        _path = path;
        _maxBytes = maxBytes;
    }

    /// <summary>
    /// 한 줄 남긴다. <b>실패는 삼킨다</b> — 기록을 못 남겨도 통화는 계속 가야 한다.
    /// </summary>
    public void Append(string line)
    {
        lock (_gate)
        {
            try
            {
                var directory = Path.GetDirectoryName(_path);
                if (!string.IsNullOrEmpty(directory)) Directory.CreateDirectory(directory);

                var text = line + Environment.NewLine;
                RollIfNeeded(Encoding.UTF8.GetByteCount(text));
                File.AppendAllText(_path, text, Encoding.UTF8);
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or NotSupportedException)
            {
                // 로그를 못 써도 앱은 계속 간다.
            }
        }
    }

    /// <summary>
    /// 이번 줄까지 넣으면 상한을 넘는가. 넘으면 지금까지의 것을 옆으로 밀고 새로 시작한다.
    ///
    /// 빈 파일에는 밀지 않는다. 한 줄이 상한보다 길어도 그 줄은 남겨야 하고 — 대개 가장 긴 줄이
    /// 가장 중요한 스택 트레이스다 — 밀어 봐야 다음 줄에서 또 넘는 무한 반복이 된다.
    /// </summary>
    private void RollIfNeeded(int incoming)
    {
        var current = new FileInfo(_path);
        if (!current.Exists || current.Length == 0 || current.Length + incoming <= _maxBytes) return;

        File.Move(_path, _path + ".1", overwrite: true);
    }
}
