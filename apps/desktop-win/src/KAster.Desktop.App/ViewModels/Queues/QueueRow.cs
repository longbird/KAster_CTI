using KAster.Desktop.Core.Contracts;

namespace KAster.Desktop.App.ViewModels;

/// <summary>
/// 큐 한 줄. 상담원이 읽는 것은 셋이다 — <b>몇 명이 기다리는가</b>, <b>가장 오래 기다린 사람이
/// 얼마나 기다렸는가</b>, <b>받을 수 있는 사람이 남아 있는가</b>.
/// </summary>
public sealed record QueueRow(
    string QueueId,
    string QueueName,
    int Waiting,
    int Ringing,
    int Talking,
    int Available,
    int Paused,
    string LongestWaitText,
    bool IsOverThreshold)
{
    public static QueueRow From(QueueStatusRow row)
    {
        var name = string.IsNullOrWhiteSpace(row.QueueDisplayName)
            ? row.QueueName
            : row.QueueDisplayName!.Trim();

        return new QueueRow(
            row.QueueId,
            name,
            row.Waiting,
            row.Ringing,
            row.Talking,
            row.Available,
            row.Paused,
            // 대기가 없으면 "가장 오래 기다린 시간" 은 가리킬 통화가 없다.
            // 지난 값을 남겨 두면 아무도 안 기다리는 큐가 기다리는 것처럼 보인다.
            row.Waiting > 0 ? FormatWait(row.LongestWaitSeconds) : string.Empty,
            row.VirtualBuffer?.Status == "OVER_THRESHOLD");
    }

    /// <summary>받을 수 있는 사람이 아무도 없는데 대기가 쌓이면, 그 큐는 스스로 풀리지 않는다.</summary>
    public bool HasNobodyToAnswer => Waiting > 0 && Available == 0;

    private static string FormatWait(int seconds)
    {
        if (seconds <= 0) return "0초";

        var span = TimeSpan.FromSeconds(seconds);
        return span.TotalMinutes >= 1
            ? $"{(int)span.TotalMinutes}분 {span.Seconds}초"
            : $"{span.Seconds}초";
    }
}
