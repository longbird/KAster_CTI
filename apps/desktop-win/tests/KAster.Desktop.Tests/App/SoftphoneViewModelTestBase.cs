using KAster.Desktop.App.Services;
using System.Net;
using KAster.Desktop.App.ViewModels;
using KAster.Desktop.Core.Contracts;
using KAster.Desktop.Core.Server;
using KAster.Desktop.Core.State;
using KAster.Desktop.Core.Storage;
using KAster.Desktop.Softphone;
using KAster.Desktop.Tests.Server;

namespace KAster.Desktop.Tests.App;

// public 인 이유: protected Build 가 이 형을 돌려주므로 base 보다 좁을 수 없다.
public sealed class FakeSoftphone : ISoftphoneControl
{
    /// <summary>소리 경로가 안 열려 있으면 소프트폰은 음소거 요청을 삼킨다. 그 상황을 흉내 낸다.</summary>
    public bool IgnoresMute { get; set; }

    private bool _muted;

    public bool IsMuted
    {
        get => _muted;
        set { if (!IgnoresMute) _muted = value; }
    }
    public int AnswerCalls { get; private set; }
    public int HangupCalls { get; private set; }

    public Task<bool> AnswerAsync()
    {
        AnswerCalls++;
        return Task.FromResult(true);
    }

    public List<char> Digits { get; } = new();

    public Task SendDigitAsync(char digit)
    {
        Digits.Add(digit);
        return Task.CompletedTask;
    }

    public void Hangup() => HangupCalls++;
}

/// <summary>
/// 통화 화면과 그 갈래 화면들(제안·돌려주기·이력·키패드)이 같은 조립을 쓴다.
/// 시간은 <see cref="_now"/> 로 주입해 테스트가 직접 민다 — 실제 시계에 기대면 재현되지 않는다.
/// </summary>
public abstract class SoftphoneViewModelTestBase
{
    protected const string AckJson = """
    {"success":true,"data":{"accepted":true,"requestedAt":"2026-08-20T04:00:00.000Z","correlationId":"c"},
    "error":null}
    """;

    protected static readonly AgentProfile Agent = new()
    {
        AgentId = "a-1",
        AgentName = "김상담",
        Extension = "1001",
    };

    protected DateTimeOffset _now = new(2026, 8, 20, 4, 0, 0, TimeSpan.Zero);

    protected static readonly SoftphoneConfig SipConfig = new()
    {
        Enabled = true,
        SipUri = "sip:1001@pbx.local",
        SipServer = "49.247.46.86:48950",
        Transport = "udp",
        AuthorizationUsername = "1001",
        AuthorizationPassword = "s3cret-pw",
        DisplayName = "김상담",
    };

    protected const string DirectoryJson = """
    {"success":true,"data":[
      {"agentId":"a-1","agentName":"김상담","extension":"1001",
       "loginStatus":"LOGGED_IN","currentStatus":{"statusCode":"AVAILABLE"}},
      {"agentId":"a-2","agentName":"이상담","extension":"1002",
       "loginStatus":"LOGGED_IN","currentStatus":{"statusCode":"AVAILABLE"},
       "sipRegistration":{"registered":true}},
      {"agentId":"a-3","agentName":"박상담","extension":"1003",
       "loginStatus":"LOGGED_IN","currentStatus":{"statusCode":"BREAK"},
       "sipRegistration":{"registered":true}},
      {"agentId":"a-4","agentName":"최상담","extension":"1004",
       "loginStatus":"LOGGED_OUT","currentStatus":null,
       "sipRegistration":{"registered":false}}
    ],"error":null}
    """;

    protected const string CapabilitiesJson = """
    {"success":true,"data":{
      "canOriginateExternal":true,"canOriginateInternal":true,
      "outboundDialOptions":{"allowedCallerIds":["0215881588","07052346380"],"defaultCallerId":"07052346380"},
      "disabledReasons":[]},"error":null}
    """;

    /// <summary>
    /// <c>me/session</c> 의 통화 제어 가능 여부. hold/resume feature code 가 둘 다 있을 때만
    /// 서버가 <c>holdEnabled</c> 를 켠다.
    /// </summary>
    protected static string ControlCapabilitiesJson(bool holdEnabled) => $$$"""
    {"success":true,"data":{
      "agent":{"agentId":"a-1","agentName":"김상담","extension":"1001","role":"agent"},
      "callControlCapabilities":{"muteEnabled":true,"answerEnabled":true,
        "holdEnabled":{{{(holdEnabled ? "true" : "false")}}},
        "holdMode":"{{{(holdEnabled ? "feature_code" : "disabled")}}}"}},"error":null}
    """;

    protected (SoftphoneViewModel Vm, CallStateStore Store, FakeSoftphone Phone, StubHttpHandler Stub) Build(
        bool useSoftphone = true,
        bool withSipConfig = true,
        ISettingsStore<AnnouncementReadState>? announcementReads = null,
        CallPreferences? callPreferences = null)
    {
        var stub = new StubHttpHandler();
        var store = new CallStateStore(Agent.AgentId, () => _now, null, Agent.Extension);
        var phone = new FakeSoftphone();
        var server = new CtiServerClient(new HttpClient(stub) { BaseAddress = new Uri("http://server/api/v1/") });
        return (
            new SoftphoneViewModel(
                store, server, phone, Agent, () => _now, useSoftphone, withSipConfig ? SipConfig : null,
                announcementReads ?? new MemoryStore<AnnouncementReadState>(new AnnouncementReadState()),
                callPreferences is null ? null : () => callPreferences),
            store, phone, stub);
    }

    protected static ActiveCall Call(SessionStatus status, DateTimeOffset? answeredAt = null) => new()
    {
        CallId = "c-1",
        Linkedid = "l-1",
        Ani = "01011112222",
        SessionStatus = status,
        StartedAt = new DateTimeOffset(2026, 8, 20, 4, 0, 0, TimeSpan.Zero),
        AnsweredAt = answeredAt,
        PrimaryAgentId = "a-1",
        Customer = new CustomerInfo { CustomerName = "홍길동", PhoneNumber = "01011112222" },
    };

    protected static int DirectoryLookups(StubHttpHandler stub)
        => stub.Requests.Count(r => r.RequestUri!.AbsolutePath.EndsWith("/agents", StringComparison.Ordinal));

    protected static async Task<StubHttpHandler> Ready(
        SoftphoneViewModel vm,
        StubHttpHandler stub,
        bool holdEnabled = false)
    {
        stub.Enqueue(HttpStatusCode.OK, DirectoryJson)
            .Enqueue(HttpStatusCode.OK, CapabilitiesJson)
            .Enqueue(HttpStatusCode.OK, ControlCapabilitiesJson(holdEnabled));
        await vm.LoadDialSetupAsync();
        return stub;
    }
}
