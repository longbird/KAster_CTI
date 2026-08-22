using System.Net;
using KAster.Desktop.Core.Server;
using Xunit;

namespace KAster.Desktop.Tests.Server;

public class CallHistoryTests
{
    private const string HistoryJson = """
    {"success":true,"data":[
      {"callId":"c-9","startedAt":"2026-08-22T01:00:00Z","direction":"inbound",
       "ani":"01034623453","dnis":"07052346380","talkSeconds":42,"missedReason":null}
    ],"error":null}
    """;

    /// <summary>
    /// agentId 를 빼면 서버가 테넌트 전체의 통화를 돌려준다. 상담원이 남의 통화
    /// 기록을 보게 되고, 화면만 봐서는 그게 남의 것인지 알 수 없다.
    /// </summary>
    [Fact]
    public async Task History_is_asked_for_one_agent_only()
    {
        var stub = new StubHttpHandler();
        stub.Enqueue(HttpStatusCode.OK, HistoryJson);
        var client = new CtiServerClient(new HttpClient(stub) { BaseAddress = new Uri("http://server/api/v1/") });

        await client.GetCallHistoryAsync("a-1", 20, CancellationToken.None);

        var query = stub.Requests[0].RequestUri!.Query;
        Assert.Contains("agentId=a-1", query);
        Assert.Contains("limit=20", query);
    }

    [Fact]
    public async Task History_rows_carry_what_the_screen_shows()
    {
        var stub = new StubHttpHandler();
        stub.Enqueue(HttpStatusCode.OK, HistoryJson);
        var client = new CtiServerClient(new HttpClient(stub) { BaseAddress = new Uri("http://server/api/v1/") });

        var rows = await client.GetCallHistoryAsync("a-1", 20, CancellationToken.None);

        var row = Assert.Single(rows);
        Assert.Equal("c-9", row.CallId);
        Assert.Equal("inbound", row.Direction);
        Assert.Equal("01034623453", row.Ani);
        Assert.Equal(42, row.TalkSeconds);
        Assert.Null(row.MissedReason);
    }
}
