# C# 데스크톱 소프트폰 1단계 구현 계획

> **에이전트 작업자에게:** 이 계획은 superpowers:subagent-driven-development 또는 superpowers:executing-plans 로 실행한다. 각 단계는 체크박스(`- [ ]`)로 추적한다.

**목표:** 상담원이 C# 데스크톱 앱으로 로그인하고, PBX 에 SIP 등록하고, 전화를 받고 걸고 끊고 마이크를 끄고, 상태를 바꾸고, 서버 실시간 이벤트를 화면에 반영하는 데까지 동작시킨다.

**아키텍처:** WPF(.NET 8) 단일 프로세스. `Core`(도메인·서버 연동·상태, UI/SIP 의존 없음) → `Softphone`(SIPSorcery + WASAPI) → `App`(WPF) 단방향 의존. PBX 에는 SIP UDP 로 직결하고 미디어는 평문 RTP(PCMA/PCMU)를 쓴다. 통화 상태의 진실원은 서버이고 SIP 다이얼로그는 미디어 제어 전용이다.

**기술 스택:** .NET 8 (`net8.0` / `net8.0-windows`), WPF, xUnit, SIPSorcery 10.x + SIPSorceryMedia.Windows, SocketIOClient(Engine.IO v4), System.Text.Json, `System.Security.Cryptography.ProtectedData`(DPAPI).

**설계 원본:** [`docs/design/2026-08-20-csharp-desktop-client-design.md`](../design/2026-08-20-csharp-desktop-client-design.md)
**화면 시안:** <https://claude.ai/code/artifact/362ae6cf-f98b-4094-815c-d8556ce3c670>

---

## 이 계획에서 다루지 않는 것

2단계(전환·홀드·다이얼패드·통화이력·상담원목록·메모·스크린팝)와 3단계(트레이·알림·전역 핫키·자동 업데이트·`kastercti://`·데스크톱 브리지)는 별도 계획으로 뺀다.
기존 `apps/desktop`(Electron) 은 **건드리지 않는다.** 두 앱은 병행 유지한다.

## 시작 전 준비

- [ ] 작업 브랜치를 만든다.

```bash
git checkout -b feat/csharp-desktop-client
```

- [ ] 도구가 준비됐는지 확인한다. `dotnet --list-sdks` 에 8 또는 9 SDK 가, `dotnet --list-runtimes` 에 `Microsoft.WindowsDesktop.App 8.x` 가 있어야 한다.

```bash
dotnet --list-sdks
dotnet --list-runtimes | Select-String "WindowsDesktop"
```

기대: SDK 9.0.x (또는 8.0.x), `Microsoft.WindowsDesktop.App 8.0.25` 이상.

## 파일 구조

```
apps/desktop-win/
  KAster.Desktop.sln
  src/KAster.Desktop.Core/                      net8.0
    Contracts/ApiEnvelope.cs                    { success, data, error } 봉투
    Contracts/AgentStatusCode.cs                상태 enum + 문자열 변환
    Contracts/SessionStatus.cs                  세션 상태 enum
    Contracts/ActiveCall.cs                     통화 세션 모델
    Contracts/CtiEvent.cs                       실시간 이벤트 판별 유니온
    Contracts/SoftphoneConfig.cs                서버가 내려주는 SIP 설정
    Contracts/SessionSummary.cs                 로그인 결과(agent + softphoneConfig)
    Serialization/JsonDefaults.cs               camelCase JsonSerializerOptions 단일 정의
    Storage/JsonSettingsStore.cs                %APPDATA% JSON 읽기/쓰기 제네릭
    Storage/TokenVault.cs                       DPAPI 토큰 저장소
    Server/AuthClient.cs                        로그인·리프레시·세션 조회
    Server/TokenRefreshHandler.cs               401 → refresh 1회 회전 후 재시도
    Server/CtiServerClient.cs                   REST 명령(상태변경·발신·끊기·뮤트)
    Server/CtiEventClient.cs                    Socket.IO 구독 + 연결 상태
    Server/CtiEventParser.cs                    이벤트 이름+페이로드 → CtiEvent
    Runtime/RetryPolicy.cs                      지수 백오프 계산(순수 함수)
    State/CallStateStore.cs                     서버 우선 병합 규칙
  src/KAster.Desktop.Softphone/                 net8.0-windows
    SipSoftphoneClient.cs                       등록·수발신·끊기
    SoftphoneOptions.cs                         sipServer/transport/자격증명
    RegistrationState.cs                        등록 상태 enum + 이벤트 인자
    Audio/AudioDeviceController.cs              장치 열거·선택·폴백
    Audio/AudioDeviceInfo.cs                    장치 모델
  src/KAster.Desktop.App/                       net8.0-windows (WPF)
    App.xaml / App.xaml.cs                      부팅·DI 조립
    Services/WindowModeService.cs               창 형상 단일 진실원
    Services/WindowBounds.cs                    모드별 바운드(순수 함수)
    ViewModels/LoginViewModel.cs
    ViewModels/SoftphoneViewModel.cs
    Views/LoginView.xaml
    Views/IdleView.xaml
    Views/RingingView.xaml
    Views/TalkingView.xaml
    Themes/Tokens.xaml                          색·글꼴·간격 토큰
  tests/KAster.Desktop.Tests/                   net8.0-windows
```

**서버 쪽 변경(1건):** `apps/server/src/modules/auth/auth.service.ts` 의 `buildSoftphoneConfig` 에 `sipServer` / `transport` 를 **추가**한다. 기존 `wsServer` 는 그대로 둔다.

---

## Chunk 1: 기반

### Task 1: 솔루션과 프로젝트 스캐폴드

**Files:**
- Create: `apps/desktop-win/KAster.Desktop.sln`
- Create: `apps/desktop-win/src/KAster.Desktop.Core/KAster.Desktop.Core.csproj`
- Create: `apps/desktop-win/src/KAster.Desktop.Softphone/KAster.Desktop.Softphone.csproj`
- Create: `apps/desktop-win/src/KAster.Desktop.App/KAster.Desktop.App.csproj`
- Create: `apps/desktop-win/tests/KAster.Desktop.Tests/KAster.Desktop.Tests.csproj`
- Create: `apps/desktop-win/Directory.Build.props`
- Create: `apps/desktop-win/.gitignore`

- [ ] **Step 1: 프로젝트를 만든다**

```bash
mkdir apps/desktop-win
cd apps/desktop-win
dotnet new sln -n KAster.Desktop
dotnet new classlib -o src/KAster.Desktop.Core -f net8.0
dotnet new classlib -o src/KAster.Desktop.Softphone -f net8.0
dotnet new wpf -o src/KAster.Desktop.App -f net8.0
dotnet new xunit -o tests/KAster.Desktop.Tests -f net8.0
```

- [ ] **Step 2: 의존 방향을 고정한다**

```bash
dotnet sln add src/KAster.Desktop.Core src/KAster.Desktop.Softphone src/KAster.Desktop.App tests/KAster.Desktop.Tests
dotnet add src/KAster.Desktop.Softphone reference src/KAster.Desktop.Core
dotnet add src/KAster.Desktop.App reference src/KAster.Desktop.Softphone src/KAster.Desktop.Core
dotnet add tests/KAster.Desktop.Tests reference src/KAster.Desktop.Core src/KAster.Desktop.Softphone
```

`Core` 에는 어떤 참조도 추가하지 않는다. 이 방향이 깨지면 `Core` 의 테스트가 UI/SIP 를 끌어오게 된다.

- [ ] **Step 3: 공통 빌드 설정을 둔다**

`apps/desktop-win/Directory.Build.props`:

```xml
<Project>
  <PropertyGroup>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <LangVersion>latest</LangVersion>
    <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
    <InvariantGlobalization>false</InvariantGlobalization>
  </PropertyGroup>
</Project>
```

`Softphone`, `App`, `Tests` 의 `.csproj` 는 `TargetFramework` 를 `net8.0-windows` 로 바꾸고, `Softphone` 과 `Tests` 에 `<UseWPF>` 는 넣지 않는다(App 만 WPF).

- [ ] **Step 4: 빌드와 테스트가 도는지 확인한다**

```bash
dotnet build apps/desktop-win/KAster.Desktop.sln
dotnet test apps/desktop-win/tests/KAster.Desktop.Tests/KAster.Desktop.Tests.csproj
```

기대: 빌드 성공(0 errors), 테스트 0건 통과(스캐폴드 테스트를 지웠다면 "No test matches").

- [ ] **Step 5: 커밋**

```bash
git add apps/desktop-win
git commit -m "chore(desktop-win): scaffold the C# softphone solution"
```

---

### Task 2: 응답 봉투와 계약 타입

서버의 모든 응답은 `{ success, data, error }` 봉투다. 이걸 잘못 벗기면 이후 전부 어긋나므로 먼저 못 박는다.

**Files:**
- Create: `apps/desktop-win/src/KAster.Desktop.Core/Serialization/JsonDefaults.cs`
- Create: `apps/desktop-win/src/KAster.Desktop.Core/Contracts/ApiEnvelope.cs`
- Create: `apps/desktop-win/src/KAster.Desktop.Core/Contracts/AgentStatusCode.cs`
- Create: `apps/desktop-win/src/KAster.Desktop.Core/Contracts/SessionStatus.cs`
- Create: `apps/desktop-win/src/KAster.Desktop.Core/Contracts/ActiveCall.cs`
- Create: `apps/desktop-win/src/KAster.Desktop.Core/Contracts/SoftphoneConfig.cs`
- Create: `apps/desktop-win/src/KAster.Desktop.Core/Contracts/SessionSummary.cs`
- Test: `apps/desktop-win/tests/KAster.Desktop.Tests/Contracts/ApiEnvelopeTests.cs`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```csharp
using System.Text.Json;
using KAster.Desktop.Core.Contracts;
using KAster.Desktop.Core.Serialization;
using Xunit;

namespace KAster.Desktop.Tests.Contracts;

public class ApiEnvelopeTests
{
    [Fact]
    public void Unwraps_a_successful_envelope()
    {
        const string json = """
        {"success":true,"data":{"callId":"c-1","linkedid":"l-1","ani":"01034567890",
        "dnis":"1588","queueName":"main","sessionStatus":"TALKING","startedAt":"2026-08-20T04:00:00.000Z"},
        "error":null}
        """;

        var envelope = JsonSerializer.Deserialize<ApiEnvelope<ActiveCall>>(json, JsonDefaults.Options);

        Assert.NotNull(envelope);
        Assert.True(envelope!.Success);
        Assert.Equal("c-1", envelope.Data!.CallId);
        Assert.Equal(SessionStatus.Talking, envelope.Data.SessionStatus);
    }

    [Fact]
    public void Surfaces_the_error_message_when_success_is_false()
    {
        const string json = """{"success":false,"data":null,"error":{"message":"Forbidden","code":"FORBIDDEN"}}""";

        var envelope = JsonSerializer.Deserialize<ApiEnvelope<ActiveCall>>(json, JsonDefaults.Options);

        Assert.False(envelope!.Success);
        Assert.Equal("Forbidden", envelope.Error!.Message);
    }

    [Fact]
    public void Unknown_session_status_does_not_throw()
    {
        const string json = """
        {"success":true,"data":{"callId":"c-2","linkedid":"l-2","ani":"","dnis":"","queueName":"",
        "sessionStatus":"SOMETHING_NEW","startedAt":"2026-08-20T04:00:00.000Z"},"error":null}
        """;

        var envelope = JsonSerializer.Deserialize<ApiEnvelope<ActiveCall>>(json, JsonDefaults.Options);

        Assert.Equal(SessionStatus.Unknown, envelope!.Data!.SessionStatus);
    }
}
```

세 번째 테스트가 중요하다. 서버가 상태값을 추가해도 클라이언트가 예외로 죽으면 안 된다.

- [ ] **Step 2: 실패를 확인한다**

```bash
dotnet test apps/desktop-win/tests/KAster.Desktop.Tests/KAster.Desktop.Tests.csproj --filter FullyQualifiedName~ApiEnvelopeTests
```

기대: 컴파일 실패 — `ApiEnvelope` / `ActiveCall` 없음.

- [ ] **Step 3: 최소 구현을 쓴다**

`Serialization/JsonDefaults.cs`:

```csharp
using System.Text.Json;

namespace KAster.Desktop.Core.Serialization;

public static class JsonDefaults
{
    public static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
    };
}
```

`Contracts/ApiEnvelope.cs`:

```csharp
namespace KAster.Desktop.Core.Contracts;

public sealed class ApiEnvelope<T>
{
    public bool Success { get; init; }
    public T? Data { get; init; }
    public ApiError? Error { get; init; }
}

public sealed class ApiError
{
    public string? Code { get; init; }
    public string Message { get; init; } = string.Empty;
}
```

`Contracts/SessionStatus.cs` — 서버가 모르는 값을 보내도 `Unknown` 으로 떨어지게 커스텀 컨버터를 붙인다.

```csharp
using System.Text.Json;
using System.Text.Json.Serialization;

namespace KAster.Desktop.Core.Contracts;

[JsonConverter(typeof(SessionStatusConverter))]
public enum SessionStatus
{
    Unknown = 0, New, Ivr, Queued, RingingAgent, Talking, Hold, Transferring, AfterCallWork, Ended,
}

public sealed class SessionStatusConverter : JsonConverter<SessionStatus>
{
    public override SessionStatus Read(ref Utf8JsonReader reader, Type type, JsonSerializerOptions options)
        => reader.GetString() switch
        {
            "NEW" => SessionStatus.New,
            "IVR" => SessionStatus.Ivr,
            "QUEUED" => SessionStatus.Queued,
            "RINGING_AGENT" => SessionStatus.RingingAgent,
            "TALKING" => SessionStatus.Talking,
            "HOLD" => SessionStatus.Hold,
            "TRANSFERRING" => SessionStatus.Transferring,
            "AFTER_CALL_WORK" => SessionStatus.AfterCallWork,
            "ENDED" => SessionStatus.Ended,
            _ => SessionStatus.Unknown,
        };

    public override void Write(Utf8JsonWriter writer, SessionStatus value, JsonSerializerOptions options)
        => writer.WriteStringValue(value switch
        {
            SessionStatus.New => "NEW",
            SessionStatus.Ivr => "IVR",
            SessionStatus.Queued => "QUEUED",
            SessionStatus.RingingAgent => "RINGING_AGENT",
            SessionStatus.Talking => "TALKING",
            SessionStatus.Hold => "HOLD",
            SessionStatus.Transferring => "TRANSFERRING",
            SessionStatus.AfterCallWork => "AFTER_CALL_WORK",
            SessionStatus.Ended => "ENDED",
            _ => "UNKNOWN",
        });
}
```

`Contracts/AgentStatusCode.cs` 도 같은 패턴으로 만든다. 값은 `AVAILABLE`, `RINGING`, `TALKING`, `AFTER_CALL_WORK`, `BREAK`, `MEAL`, `TRAINING`, `MANUAL_PAUSED` 8개다 (원전: `apps/desktop/src/shared/cti.ts`).

`Contracts/ActiveCall.cs`:

```csharp
namespace KAster.Desktop.Core.Contracts;

public sealed record ActiveCall
{
    public required string CallId { get; init; }
    public required string Linkedid { get; init; }
    public string Ani { get; init; } = string.Empty;
    public string Dnis { get; init; } = string.Empty;
    public string QueueName { get; init; } = string.Empty;
    public SessionStatus SessionStatus { get; init; }
    public DateTimeOffset StartedAt { get; init; }
    public DateTimeOffset? AnsweredAt { get; init; }
    public string? PrimaryAgentId { get; init; }
    public bool? IsMuted { get; init; }
    public CustomerInfo? Customer { get; init; }
}

public sealed record CustomerInfo
{
    public string CustomerId { get; init; } = string.Empty;
    public string CustomerName { get; init; } = string.Empty;
    public string Grade { get; init; } = "NORMAL";
    public string PhoneNumber { get; init; } = string.Empty;
    public string? CompanyName { get; init; }
}
```

`Contracts/SoftphoneConfig.cs` — 서버가 새로 내려줄 `sipServer` / `transport` 를 포함한다.

```csharp
namespace KAster.Desktop.Core.Contracts;

public sealed record SoftphoneConfig
{
    public bool Enabled { get; init; }
    public string? SipUri { get; init; }
    public string? SipServer { get; init; }
    public string Transport { get; init; } = "udp";
    public string? AuthorizationUsername { get; init; }
    public string? AuthorizationPassword { get; init; }
    public string DisplayName { get; init; } = string.Empty;
}
```

`Contracts/SessionSummary.cs`:

```csharp
namespace KAster.Desktop.Core.Contracts;

public sealed record AgentProfile
{
    public required string AgentId { get; init; }
    public string AgentName { get; init; } = string.Empty;
    public string Extension { get; init; } = string.Empty;
    public string Role { get; init; } = "agent";
}

public sealed record SessionSummary
{
    public required AgentProfile Agent { get; init; }
    public SoftphoneConfig? SoftphoneConfig { get; init; }
}
```

- [ ] **Step 4: 통과를 확인한다**

```bash
dotnet test apps/desktop-win/tests/KAster.Desktop.Tests/KAster.Desktop.Tests.csproj --filter FullyQualifiedName~ApiEnvelopeTests
```

기대: 3/3 통과.

- [ ] **Step 5: 커밋**

```bash
git add apps/desktop-win
git commit -m "feat(desktop-win): add the server response contracts"
```

---

### Task 3: 설정 저장소와 토큰 금고

**Files:**
- Create: `apps/desktop-win/src/KAster.Desktop.Core/Storage/JsonSettingsStore.cs`
- Create: `apps/desktop-win/src/KAster.Desktop.Core/Storage/TokenVault.cs`
- Test: `apps/desktop-win/tests/KAster.Desktop.Tests/Storage/JsonSettingsStoreTests.cs`
- Test: `apps/desktop-win/tests/KAster.Desktop.Tests/Storage/TokenVaultTests.cs`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```csharp
using KAster.Desktop.Core.Storage;
using Xunit;

namespace KAster.Desktop.Tests.Storage;

public sealed record AudioPrefs
{
    public string InputDeviceId { get; init; } = "";
    public int RingVolume { get; init; } = 65;
}

public class JsonSettingsStoreTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "kaster-test-" + Guid.NewGuid().ToString("N"));

    [Fact]
    public void Returns_the_fallback_when_no_file_exists()
    {
        var store = new JsonSettingsStore<AudioPrefs>(Path.Combine(_dir, "audio.json"));

        var loaded = store.Load(new AudioPrefs());

        Assert.Equal(65, loaded.RingVolume);
    }

    [Fact]
    public void Round_trips_through_disk()
    {
        var store = new JsonSettingsStore<AudioPrefs>(Path.Combine(_dir, "audio.json"));

        store.Save(new AudioPrefs { InputDeviceId = "mic-1", RingVolume = 20 });
        var loaded = store.Load(new AudioPrefs());

        Assert.Equal("mic-1", loaded.InputDeviceId);
        Assert.Equal(20, loaded.RingVolume);
    }

    [Fact]
    public void Corrupt_json_falls_back_instead_of_throwing()
    {
        var path = Path.Combine(_dir, "audio.json");
        Directory.CreateDirectory(_dir);
        File.WriteAllText(path, "{ this is not json");
        var store = new JsonSettingsStore<AudioPrefs>(path);

        var loaded = store.Load(new AudioPrefs { RingVolume = 40 });

        Assert.Equal(40, loaded.RingVolume);
    }

    public void Dispose()
    {
        if (Directory.Exists(_dir)) Directory.Delete(_dir, recursive: true);
    }
}
```

`TokenVaultTests` 는 저장 후 다시 읽으면 같은 값이 나오고, **디스크의 바이트에는 토큰 원문이 들어 있지 않은지**를 확인한다.

```csharp
using System.Text;
using KAster.Desktop.Core.Storage;
using Xunit;

namespace KAster.Desktop.Tests.Storage;

public class TokenVaultTests : IDisposable
{
    private readonly string _path = Path.Combine(Path.GetTempPath(), $"kaster-vault-{Guid.NewGuid():N}.bin");

    [Fact]
    public void Round_trips_a_token_pair()
    {
        var vault = new TokenVault(_path);

        vault.Save(new TokenPair("access-abc", "refresh-xyz"));
        var loaded = vault.Load();

        Assert.Equal("access-abc", loaded!.AccessToken);
        Assert.Equal("refresh-xyz", loaded.RefreshToken);
    }

    [Fact]
    public void Does_not_write_the_token_in_clear_text()
    {
        var vault = new TokenVault(_path);

        vault.Save(new TokenPair("access-abc", "refresh-xyz"));
        var raw = Encoding.UTF8.GetString(File.ReadAllBytes(_path));

        Assert.DoesNotContain("refresh-xyz", raw);
    }

    [Fact]
    public void Clear_removes_the_file()
    {
        var vault = new TokenVault(_path);
        vault.Save(new TokenPair("a", "b"));

        vault.Clear();

        Assert.Null(vault.Load());
    }

    public void Dispose()
    {
        if (File.Exists(_path)) File.Delete(_path);
    }
}
```

- [ ] **Step 2: 실패를 확인한다**

```bash
dotnet test apps/desktop-win/tests/KAster.Desktop.Tests/KAster.Desktop.Tests.csproj --filter "FullyQualifiedName~JsonSettingsStoreTests|FullyQualifiedName~TokenVaultTests"
```

기대: 컴파일 실패.

- [ ] **Step 3: 구현한다**

`Storage/JsonSettingsStore.cs`:

```csharp
using System.Text.Json;
using KAster.Desktop.Core.Serialization;

namespace KAster.Desktop.Core.Storage;

public sealed class JsonSettingsStore<T>
{
    private readonly string _path;
    private readonly object _gate = new();

    public JsonSettingsStore(string path) => _path = path;

    public T Load(T fallback)
    {
        lock (_gate)
        {
            try
            {
                if (!File.Exists(_path)) return fallback;
                var json = File.ReadAllText(_path);
                return JsonSerializer.Deserialize<T>(json, JsonDefaults.Options) ?? fallback;
            }
            catch (Exception ex) when (ex is IOException or JsonException or UnauthorizedAccessException)
            {
                // 설정이 깨졌다고 앱이 못 뜨면 안 된다. 기본값으로 계속 간다.
                return fallback;
            }
        }
    }

    public void Save(T value)
    {
        lock (_gate)
        {
            var dir = Path.GetDirectoryName(_path);
            if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);

            var tmp = _path + ".tmp";
            File.WriteAllText(tmp, JsonSerializer.Serialize(value, JsonDefaults.Options));
            File.Move(tmp, _path, overwrite: true);
        }
    }
}
```

임시 파일에 쓰고 옮기는 이유는 저장 도중 앱이 죽어도 반쪽짜리 설정 파일이 남지 않게 하기 위해서다.

`Storage/TokenVault.cs`:

```csharp
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using KAster.Desktop.Core.Serialization;

namespace KAster.Desktop.Core.Storage;

public sealed record TokenPair(string AccessToken, string RefreshToken);

public sealed class TokenVault
{
    private static readonly byte[] Entropy = Encoding.UTF8.GetBytes("KAster.Desktop.TokenVault.v1");
    private readonly string _path;
    private readonly object _gate = new();

    public TokenVault(string path) => _path = path;

    public void Save(TokenPair pair)
    {
        lock (_gate)
        {
            var dir = Path.GetDirectoryName(_path);
            if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);

            var plain = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(pair, JsonDefaults.Options));
            var cipher = ProtectedData.Protect(plain, Entropy, DataProtectionScope.CurrentUser);
            File.WriteAllBytes(_path, cipher);
        }
    }

    public TokenPair? Load()
    {
        lock (_gate)
        {
            try
            {
                if (!File.Exists(_path)) return null;
                var plain = ProtectedData.Unprotect(File.ReadAllBytes(_path), Entropy, DataProtectionScope.CurrentUser);
                return JsonSerializer.Deserialize<TokenPair>(plain, JsonDefaults.Options);
            }
            catch (Exception ex) when (ex is CryptographicException or IOException or JsonException)
            {
                // 다른 계정에서 만든 파일이거나 깨진 경우. 재로그인으로 보낸다.
                return null;
            }
        }
    }

    public void Clear()
    {
        lock (_gate)
        {
            if (File.Exists(_path)) File.Delete(_path);
        }
    }
}
```

`ProtectedData` 는 `System.Security.Cryptography.ProtectedData` 패키지가 필요하다.

```bash
dotnet add apps/desktop-win/src/KAster.Desktop.Core package System.Security.Cryptography.ProtectedData
```

- [ ] **Step 4: 통과를 확인한다**

```bash
dotnet test apps/desktop-win/tests/KAster.Desktop.Tests/KAster.Desktop.Tests.csproj --filter "FullyQualifiedName~JsonSettingsStoreTests|FullyQualifiedName~TokenVaultTests"
```

기대: 6/6 통과.

- [ ] **Step 5: 커밋**

```bash
git add apps/desktop-win
git commit -m "feat(desktop-win): add the settings store and the DPAPI token vault"
```

---

### Task 4: 서버에 `sipServer` / `transport` 추가

네이티브 클라이언트는 WebSocket 이 아니라 SIP UDP 로 붙는다. 서버가 그 주소를 내려줘야 한다.
**추가만 한다.** `wsServer` 를 지우면 상담원 웹앱과 기존 Electron 앱이 죽는다.

**Files:**
- Modify: `apps/server/src/modules/auth/auth.service.ts` (`SoftphoneConfigPayload`, `buildSoftphoneConfig`)
- Modify: `apps/server/.env.example`
- Test: `apps/server/test/softphone-config.integration.spec.ts`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

기존 spec 들의 구성 방식을 먼저 확인한다.

```bash
ls apps/server/test | head -20
```

그 패턴을 따라 `apps/server/test/softphone-config.integration.spec.ts` 를 만든다. 확인할 것 3가지:

1. `SOFTPHONE_SIP_SERVER` 가 설정되면 `sipServer` 와 `transport` 가 응답에 실려 나온다.
2. `SOFTPHONE_WS_SERVER` 만 설정된 기존 구성에서도 여전히 `enabled: true` 이고 `wsServer` 가 나온다 (하위호환).
3. `SOFTPHONE_SIP_SERVER` 만 설정하고 `SOFTPHONE_WS_SERVER` 는 비운 구성에서도 `enabled: true` 다.

3번이 핵심이다. 현재 코드는 `wsServer` 가 비면 무조건 `enabled: false` 로 떨어진다.

- [ ] **Step 2: 실패를 확인한다**

```bash
cd apps/server && npx jest test/softphone-config.integration.spec.ts
```

기대: 3번 케이스가 `enabled: false` 로 실패.

- [ ] **Step 3: 구현한다**

`SoftphoneConfigPayload` 에 두 필드를 더한다.

```typescript
export interface SoftphoneConfigPayload {
  enabled: boolean;
  sipUri: string | null;
  wsServer: string | null;
  sipServer: string | null;          // 추가: 네이티브 SIP 클라이언트용 host:port
  transport: 'udp' | 'tls';          // 추가: 기본 udp
  authorizationUsername: string | null;
  authorizationPassword?: string | null;
  displayName: string;
  iceServers: SoftphoneIceServer[];
}
```

`buildSoftphoneConfig` 의 게이트를 고친다. **둘 중 하나만 있어도 enabled** 여야 한다.

```typescript
const wsServer = this.config.get<string>('SOFTPHONE_WS_SERVER', '').trim();
const sipServer = this.config.get<string>('SOFTPHONE_SIP_SERVER', '').trim();
const transport = this.config.get<string>('SOFTPHONE_SIP_TRANSPORT', 'udp').trim() === 'tls' ? 'tls' : 'udp';

if (!enabled || !sipDomain || !extension || (!wsServer && !sipServer)) {
  return {
    enabled: false,
    sipUri: null,
    wsServer: null,
    sipServer: null,
    transport: 'udp',
    authorizationUsername: null,
    authorizationPassword: options?.includeCredential ? null : undefined,
    displayName,
    iceServers: [],
  };
}

return {
  enabled: true,
  sipUri: `sip:${extension}@${sipDomain}`,
  wsServer: wsServer || null,
  sipServer: sipServer || null,
  transport,
  authorizationUsername: extension,
  authorizationPassword: options?.includeCredential ? agent?.sipPassword?.trim() ?? null : undefined,
  displayName,
  iceServers: this.parseIceServers(),
};
```

`.env.example` 의 `SOFTPHONE_*` 그룹에 두 줄을 더한다.

```
SOFTPHONE_SIP_SERVER=
SOFTPHONE_SIP_TRANSPORT=udp
```

- [ ] **Step 4: 통과와 회귀 없음을 확인한다**

```bash
cd apps/server
npx jest test/softphone-config.integration.spec.ts
npx jest --testPathPattern "auth"
npm run openapi:export
```

기대: 새 spec 3/3 통과, 기존 auth spec 전부 통과, `docs/openapi.json` 이 갱신됨.

- [ ] **Step 5: 커밋**

```bash
git add apps/server docs/openapi.json
git commit -m "feat(auth): expose the native SIP server address in the softphone config"
```

---

## Chunk 2: 서버 연동

### Task 5: 로그인과 토큰 회전

**Files:**
- Create: `apps/desktop-win/src/KAster.Desktop.Core/Server/AuthClient.cs`
- Create: `apps/desktop-win/src/KAster.Desktop.Core/Server/TokenRefreshHandler.cs`
- Test: `apps/desktop-win/tests/KAster.Desktop.Tests/Server/AuthClientTests.cs`
- Test: `apps/desktop-win/tests/KAster.Desktop.Tests/Server/TokenRefreshHandlerTests.cs`
- Create: `apps/desktop-win/tests/KAster.Desktop.Tests/Server/StubHttpHandler.cs`

- [ ] **Step 1: 가짜 HTTP 핸들러를 만든다**

```csharp
using System.Net;

namespace KAster.Desktop.Tests.Server;

public sealed class StubHttpHandler : HttpMessageHandler
{
    private readonly Queue<Func<HttpRequestMessage, HttpResponseMessage>> _responses = new();
    public List<HttpRequestMessage> Requests { get; } = new();

    public StubHttpHandler Enqueue(HttpStatusCode status, string json)
    {
        _responses.Enqueue(_ => new HttpResponseMessage(status)
        {
            Content = new StringContent(json, System.Text.Encoding.UTF8, "application/json"),
        });
        return this;
    }

    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
    {
        Requests.Add(request);
        if (_responses.Count == 0) throw new InvalidOperationException("스텁에 남은 응답이 없다");
        return Task.FromResult(_responses.Dequeue()(request));
    }
}
```

- [ ] **Step 2: 실패하는 테스트를 쓴다**

로그인 테스트는 `clientType: "desktop"` 을 보내야 SIP 비밀번호가 내려온다는 계약을 고정한다.

```csharp
[Fact]
public async Task Login_asks_for_a_desktop_session_so_the_sip_password_comes_back()
{
    var stub = new StubHttpHandler().Enqueue(HttpStatusCode.OK, """
    {"success":true,"data":{"accessToken":"at","refreshToken":"rt","tokenType":"Bearer","expiresIn":900,
    "agent":{"agentId":"a-1","agentName":"김상담","extension":"1001","role":"agent"},
    "softphoneConfig":{"enabled":true,"sipUri":"sip:1001@pbx.local","sipServer":"pbx.local:48950",
    "transport":"udp","authorizationUsername":"1001","authorizationPassword":"s3cret","displayName":"김상담"}},
    "error":null}
    """);
    var client = new AuthClient(new HttpClient(stub) { BaseAddress = new Uri("http://server/api/v1/") });

    var result = await client.LoginAsync("agent1001", "Password123!", "1001", CancellationToken.None);

    var body = await stub.Requests[0].Content!.ReadAsStringAsync();
    Assert.Contains("\"clientType\":\"desktop\"", body);
    Assert.Equal("s3cret", result.Session.SoftphoneConfig!.AuthorizationPassword);
    Assert.Equal("pbx.local:48950", result.Session.SoftphoneConfig.SipServer);
}
```

`TokenRefreshHandlerTests` 는 세 가지를 고정한다.

```csharp
[Fact] public async Task Retries_the_original_request_once_after_refreshing_on_401() { /* 401 → refresh 200 → 재시도 200 */ }
[Fact] public async Task Gives_up_and_signals_logout_when_the_refresh_also_fails() { /* 401 → refresh 401 → SignedOut 이벤트 */ }
[Fact] public async Task Refreshes_only_once_even_when_several_calls_race() { /* 동시 3건 → refresh 호출 1회 */ }
```

세 번째가 특히 중요하다. 화면 여러 곳이 동시에 API 를 부르는데 401 이 나면 refresh 가 3번 날아가고, 회전 정책 때문에 뒤의 두 번은 실패해 로그아웃된다.

- [ ] **Step 3: 실패를 확인한다**

```bash
dotnet test apps/desktop-win/tests/KAster.Desktop.Tests/KAster.Desktop.Tests.csproj --filter "FullyQualifiedName~AuthClientTests|FullyQualifiedName~TokenRefreshHandlerTests"
```

- [ ] **Step 4: 구현한다**

`AuthClient` 는 `POST auth/login`(body: `loginId`, `password`, `extension`, `clientType: "desktop"`), `POST auth/refresh`(body: `refreshToken`), `GET me/session` 세 개만 다룬다.

`TokenRefreshHandler` 는 `DelegatingHandler` 다. 요청에 Bearer 를 붙이고, 401 이면 `SemaphoreSlim(1,1)` 으로 한 번만 refresh 한 뒤 원요청을 **한 번만** 재시도한다. 재시도 후에도 401 이면 금고를 비우고 `SignedOut` 이벤트를 올린다. 요청 본문을 재사용해야 하므로 원요청은 복제해서 보낸다.

- [ ] **Step 5: 통과를 확인하고 커밋한다**

```bash
dotnet test apps/desktop-win/tests/KAster.Desktop.Tests/KAster.Desktop.Tests.csproj --filter "FullyQualifiedName~AuthClientTests|FullyQualifiedName~TokenRefreshHandlerTests"
git add apps/desktop-win
git commit -m "feat(desktop-win): add login and single-flight token rotation"
```

---

### Task 6: REST 명령 클라이언트

**Files:**
- Create: `apps/desktop-win/src/KAster.Desktop.Core/Server/CtiServerClient.cs`
- Test: `apps/desktop-win/tests/KAster.Desktop.Tests/Server/CtiServerClientTests.cs`

1단계에서 쓰는 엔드포인트만 만든다.

| 기능 | 메서드/경로 |
|---|---|
| 진행 중 통화 목록 | `GET calls/active` |
| 발신 | `POST calls/originate` — `{ phoneNumber, callerId? }` |
| 끊기 | `POST calls/{callId}/hangup` |
| 받기 | `POST calls/{callId}/pickup` |
| 마이크 | `POST calls/{callId}/mute` — `{ state: "on" \| "off" }` |
| 상태 변경 | `POST agents/{agentId}/status` — `{ statusCode, reasonCode? }` |

- [ ] **Step 1: 실패하는 테스트를 쓴다.** 경로와 본문이 정확한지, 봉투를 벗겨 `CommandAck` 를 돌려주는지, `success: false` 면 `CtiServerException` 을 던지는지 확인한다.
- [ ] **Step 2: 실패를 확인한다.**
- [ ] **Step 3: 구현한다.** 모든 메서드는 `CancellationToken` 을 받는다. 응답은 `ApiEnvelope<T>` 로 받고 `Success` 가 아니면 `Error.Message` 를 담아 던진다.
- [ ] **Step 4: 통과를 확인한다.**
- [ ] **Step 5: 커밋**

```bash
git commit -am "feat(desktop-win): add the REST command client"
```

---

### Task 7: 실시간 이벤트 구독

서버는 `@nestjs/platform-socket.io` 10.x / `socket.io` 4.x 이므로 **Engine.IO v4** 다. 네임스페이스는 `/ws`, 핸드셰이크는 `auth: { token }` 이다 (원전: `apps/server/src/modules/realtime/realtime.gateway.ts`).

**Files:**
- Create: `apps/desktop-win/src/KAster.Desktop.Core/Server/CtiEventClient.cs`
- Create: `apps/desktop-win/src/KAster.Desktop.Core/Server/CtiEventParser.cs`
- Create: `apps/desktop-win/src/KAster.Desktop.Core/Contracts/CtiEvent.cs`
- Test: `apps/desktop-win/tests/KAster.Desktop.Tests/Server/CtiEventParserTests.cs`

- [ ] **Step 1: 라이브러리 동작을 먼저 확인한다 (스파이크)**

라이브러리 API 를 추측해서 코드를 쓰지 않는다. 서버를 띄우고 실제로 붙여본다.

```bash
docker compose up -d postgres redis
cd apps/server && npm run start:dev
```

```bash
dotnet add apps/desktop-win/src/KAster.Desktop.Core package SocketIOClient
```

임시 콘솔에서 `/ws` 에 붙어 `connect` 가 뜨고 `agent.status.changed` 가 들어오는지 눈으로 확인한 뒤, 실제로 통한 호출 형태를 이 Task 의 구현 단계에 적어 넣는다. **붙지 않으면 여기서 멈추고 보고한다** — 설계 문서의 리스크 항목이다.

- [ ] **Step 2: 파서의 실패하는 테스트를 쓴다**

`CtiEventParser` 는 순수 함수다. 라이브러리 없이 테스트한다.

```csharp
[Fact]
public void Maps_call_created_to_an_active_call_event()
{
    var evt = CtiEventParser.Parse("call.created", """
    {"callId":"c-1","linkedid":"l-1","ani":"01011112222","dnis":"1588","queueName":"main",
    "sessionStatus":"RINGING_AGENT","startedAt":"2026-08-20T04:00:00.000Z"}
    """);

    var created = Assert.IsType<CallCreatedEvent>(evt);
    Assert.Equal("c-1", created.Call.CallId);
}

[Fact]
public void Unknown_event_names_return_null_instead_of_throwing()
    => Assert.Null(CtiEventParser.Parse("something.new", "{}"));

[Fact]
public void Malformed_payloads_return_null_instead_of_throwing()
    => Assert.Null(CtiEventParser.Parse("call.created", "{ broken"));
```

서버가 이벤트를 추가해도 클라이언트가 죽지 않아야 한다.

- [ ] **Step 3: 실패를 확인하고 구현한다.** `CtiEvent` 는 추상 record + 파생 record (`CallCreatedEvent`, `CallUpdatedEvent`, `CallEndedEvent`, `ScreenPopEvent`, `AgentStatusChangedEvent`, `QueueSummaryUpdatedEvent`, `AnnouncementPushedEvent`) 로 만든다. `CtiEventClient` 는 이 7개 이름을 구독하고 연결 상태 변화를 `ConnectionStateChanged` 로 올린다.
- [ ] **Step 4: 통과를 확인한다.**
- [ ] **Step 5: 커밋**

```bash
git commit -am "feat(desktop-win): subscribe to the realtime CTI events"
```

---

## Chunk 3: 상태

### Task 8: 통화 상태 병합 (서버 우선)

이 프로젝트에서 제일 틀리기 쉬운 곳이다. 서버 이벤트와 로컬 SIP 다이얼로그가 **같은 통화를 서로 다른 시점에** 알려준다.

**규칙:**
1. 통화의 상태·`callId`·고객 정보는 **서버가 진실원**이다. 로컬 SIP 상태가 이를 덮어쓰지 않는다.
2. 수신 INVITE 가 먼저 오고 `call.created` 가 나중에 올 수 있다. 반대도 가능하다. 둘을 **발신번호 + 도착 시각 창(기본 5초)** 으로 짝짓는다.
3. 짝을 못 찾으면 SIP 쪽은 미디어 제어만 하고 UI 상태는 서버를 따른다.
4. `call.ended` 가 오면 로컬 다이얼로그가 아직 살아 있어도 UI 는 종료로 간다.

**Files:**
- Create: `apps/desktop-win/src/KAster.Desktop.Core/State/CallStateStore.cs`
- Test: `apps/desktop-win/tests/KAster.Desktop.Tests/State/CallStateStoreTests.cs`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```csharp
[Fact] public void Server_event_wins_over_the_local_sip_state() { }
[Fact] public void Pairs_an_incoming_invite_with_call_created_by_ani_within_the_window() { }
[Fact] public void Pairs_when_call_created_arrives_before_the_invite() { }
[Fact] public void Leaves_the_call_unpaired_when_the_ani_differs() { }
[Fact] public void Ends_the_call_on_call_ended_even_if_the_dialog_is_still_up() { }
[Fact] public void Ignores_a_call_that_belongs_to_another_agent() { }
```

시각은 테스트에서 넣을 수 있어야 하므로 `CallStateStore` 는 `Func<DateTimeOffset> now` 를 생성자로 받는다. `DateTimeOffset.UtcNow` 를 직접 부르면 이 테스트를 쓸 수 없다.

- [ ] **Step 2: 실패를 확인한다.**
- [ ] **Step 3: 구현한다.** 상태 변경은 `CurrentCallChanged` 이벤트로 알린다. 내부 상태는 교체(새 record 생성)로만 바꾸고 제자리에서 고치지 않는다.
- [ ] **Step 4: 통과를 확인한다.** 6/6.
- [ ] **Step 5: 커밋**

```bash
git commit -am "feat(desktop-win): merge server and SIP call state with the server winning"
```

---

### Task 9: 재연결 백오프

**Files:**
- Create: `apps/desktop-win/src/KAster.Desktop.Core/Runtime/RetryPolicy.cs`
- Test: `apps/desktop-win/tests/KAster.Desktop.Tests/Runtime/RetryPolicyTests.cs`

- [ ] **Step 1: 실패하는 테스트를 쓴다.** 1회차 1초, 2회차 2초, 3회차 4초로 늘고 30초에서 멈추며, 성공하면 1초로 돌아간다. 지터는 계산된 값의 ±20% 안에 든다.
- [ ] **Step 2: 실패를 확인한다.**
- [ ] **Step 3: 구현한다.** 지터는 주입 가능한 `Func<double> random` 으로 받아 테스트에서 고정한다.
- [ ] **Step 4: 통과를 확인한다.**
- [ ] **Step 5: 커밋**

```bash
git commit -am "feat(desktop-win): add the reconnect backoff policy"
```

---

## Chunk 4: 소프트폰

### Task 10: SIP 등록

**Files:**
- Create: `apps/desktop-win/src/KAster.Desktop.Softphone/SoftphoneOptions.cs`
- Create: `apps/desktop-win/src/KAster.Desktop.Softphone/RegistrationState.cs`
- Create: `apps/desktop-win/src/KAster.Desktop.Softphone/SipSoftphoneClient.cs`
- Test: `apps/desktop-win/tests/KAster.Desktop.Tests/Softphone/SoftphoneOptionsTests.cs`

- [ ] **Step 1: 패키지를 넣고 실제 등록을 먼저 확인한다 (스파이크)**

```bash
dotnet add apps/desktop-win/src/KAster.Desktop.Softphone package SIPSorcery
dotnet add apps/desktop-win/src/KAster.Desktop.Softphone package SIPSorceryMedia.Windows
```

`SIPSorceryMedia.Windows` 는 **SIP/미디어 세션 참고용으로만** 넣는다. 그 안의 `WindowsAudioEndPoint` 는 쓰지 않는다
(2026-08-20 소스 확인: 캡처가 NAudio `WaveInEvent` 라 에코 제거가 없고 WASAPI 장치 선택도 불가 — 설계 문서 3장). 오디오는 Task 11 에서 직접 만든다.

SIPSorcery 의 정확한 타입·이벤트 이름은 버전에 따라 다르다. **추측해서 쓰지 말고** 공식 예제(`sipsorcery-org/sipsorcery` 저장소의 softphone 예제)를 기준으로 다음을 확인해 이 Task 에 적는다.

- UDP 채널을 붙인 `SIPTransport` 생성 방법
- 등록 UA 타입과 성공/실패/만료 이벤트 이름
- 코덱을 PCMA/PCMU 로 제한하는 방법
- `VoIPMediaSession` 에 **외부 `IAudioSource`/`IAudioSink` 를 주입하는 방법** (Task 11 이 여기에 붙는다)

- [ ] **Step 2: 순수 로직의 실패하는 테스트를 쓴다**

서버 설정에서 SIP 옵션을 뽑는 변환은 라이브러리 없이 테스트한다.

```csharp
[Fact] public void Builds_options_from_the_server_softphone_config() { }
[Fact] public void Rejects_a_config_with_no_sip_server() { }
[Fact] public void Defaults_the_port_to_5060_when_the_server_omits_it() { }
[Fact] public void Reports_disabled_when_the_server_says_softphone_is_off() { }
```

- [ ] **Step 3: 실패를 확인하고 구현한다.** `SipSoftphoneClient` 는 `StartAsync(SoftphoneOptions)` / `StopAsync()` 와 `RegistrationStateChanged` 이벤트를 낸다. 등록 실패는 예외로 던지지 않고 상태로 알린다 — 등록이 안 됐다고 앱이 죽으면 안 된다.
- [ ] **Step 4: 실제 PBX 로 등록을 확인한다**

`infra/asterisk/pjsip.conf` 의 `1001` 엔드포인트로 등록한다. 확인 방법:

```bash
# PBX 호스트에서
asterisk -rx "pjsip show endpoint 1001"
```

기대: `Contact` 에 이 PC 의 IP 와 포트가 `Avail` 로 보인다.

- [ ] **Step 5: 커밋**

```bash
git commit -am "feat(desktop-win): register the softphone with the PBX over SIP UDP"
```

---

### Task 11: 자체 오디오 엔드포인트, 수신·발신·끊기

`SIPSorceryMedia.Windows` 의 `WindowsAudioEndPoint` 를 쓰지 않고 `IAudioSource` / `IAudioSink` 를 직접 구현한다.
캡처는 NAudio `WasapiCapture` 를 **통신용(communications) 모드**로 열어 OS 엔드포인트 효과(AEC 포함)를 태우고,
재생은 `WasapiOut` 을 쓴다. 이렇게 해야 장치 선택과 에코 제거를 한 번에 얻는다.

**Files:**
- Modify: `apps/desktop-win/src/KAster.Desktop.Softphone/SipSoftphoneClient.cs`
- Create: `apps/desktop-win/src/KAster.Desktop.Softphone/Audio/WasapiAudioEndPoint.cs`
- Create: `apps/desktop-win/src/KAster.Desktop.Softphone/Audio/AudioDeviceInfo.cs`
- Create: `apps/desktop-win/src/KAster.Desktop.Softphone/Audio/AudioDeviceController.cs`
- Test: `apps/desktop-win/tests/KAster.Desktop.Tests/Softphone/AudioDeviceControllerTests.cs`

- [ ] **Step 0: 이 PC 의 AEC 지원 여부를 먼저 확인한다**

```bash
dotnet add apps/desktop-win/src/KAster.Desktop.Softphone package NAudio
```

임시 콘솔에서 `MMDeviceEnumerator` 로 캡처 장치를 열거하고, 통신용 모드 캡처가 열리는지 확인한다.
Windows 11 22H2 이상이면 `IAcousticEchoCancellationControl` 로 장치의 AEC 지원 여부를 조회할 수 있다.
지원 여부를 이 Task 에 적고, 없으면 Step 4 의 실측에서 헤드셋 전제로 갈지 판단한다.

- [ ] **Step 1: 장치 선택 로직의 실패하는 테스트를 쓴다**

장치 열거는 인터페이스(`IAudioDeviceEnumerator`)로 감싸 가짜 목록으로 테스트한다.

```csharp
[Fact] public void Uses_the_saved_device_when_it_is_still_present() { }
[Fact] public void Falls_back_to_the_default_device_when_the_saved_one_disappeared() { }
[Fact] public void Raises_a_notice_when_it_falls_back() { }
[Fact] public void Keeps_the_ring_output_independent_from_the_call_output() { }
```

네 번째가 현장 요구다. 벨소리는 스피커로, 통화는 헤드셋으로 나가야 한다.

- [ ] **Step 2: 실패를 확인하고 구현한다.**
- [ ] **Step 3: 통화 제어를 붙인다.** 수신 INVITE → 180 Ring → 사용자가 받으면 200 OK. 발신은 서버 `POST calls/originate` 로 요청하고 **PBX 가 이 단말로 거는 INVITE 를 받는 방식**이다 (기존 앱과 같은 흐름). 마이크 끄기는 로컬 미디어에 적용하고, 서버 `mute` API 는 별개로 호출한다.
- [ ] **Step 4: 실제 통화로 확인한다**

내선 1001 ↔ 1002 로 양방향 통화를 한다. 확인할 것:

- 양쪽 음성이 들린다
- 끊기가 양방향으로 동작한다
- 마이크 끄기가 상대에게 실제로 반영된다
- **음질 게이트**: 헤드셋과 스피커폰에서 각각 에코·끊김·지연을 실측한다. 결과를 `docs/qa/` 에 별도 문서로 남긴다 (`YYYY-MM-DD-csharp-softphone-audio-verification.md`)

에코 실측 절차 — 귀로만 판단하지 않는다.

1. 스피커폰 조건을 만든다 (내장 마이크 + 내장 스피커, 볼륨 70%)
2. PBX 양방향 녹취를 켠다 (`MixMonitor` — `recording-pipeline` 이 이미 스테레오 RAW 를 받는다)
3. 상담원 쪽에서 **짧은 박수 3회 + 5초 발화**, 상대는 침묵
4. 녹취 wav 의 **상대 레그 채널** 파형을 본다. 상담원 음성이 되돌아와 있으면 에코다. 박수 임펄스로 왕복 지연도 잰다
5. 헤드셋 조건으로 같은 절차를 돌려 비교한다

스피커폰에서 에코가 남으면 설계 문서 10장의 대응(헤드셋 전제 축소 → WebRTC APM → 상용 SDK)으로 올린다. **여기서 판단을 미루지 않는다.**

- [ ] **Step 5: 커밋**

```bash
git commit -am "feat(desktop-win): answer, place and end calls with device-aware audio"
```

---

## Chunk 5: 화면

### Task 12: 창 모드 서비스

창 형상의 단일 진실원이다. 뷰모델은 모드를 요청만 하고 창을 직접 만지지 않는다.

**Files:**
- Create: `apps/desktop-win/src/KAster.Desktop.App/Services/WindowBounds.cs`
- Create: `apps/desktop-win/src/KAster.Desktop.App/Services/WindowModeService.cs`
- Test: `apps/desktop-win/tests/KAster.Desktop.Tests/App/WindowBoundsTests.cs`

바운드는 기존 앱 `apps/desktop/src/main/index.ts:98-103` 의 실측값을 그대로 쓴다.

| 모드 | 크기 | 최소 |
|---|---|---|
| idle | 440×560 | 420×520 |
| ringing | 440×420 | 400×380 |
| talking | 460×620 | 420×540 |
| transferring | 500×640 | 440×560 |
| afterCall | 460×520 | 420×460 |
| settings | 560×720 | 500×640 |

- [ ] **Step 1: 실패하는 테스트를 쓴다.** 모드별 크기가 위 표와 같은지, 화면 밖으로 나가는 위치가 작업 영역 안으로 당겨지는지, 모르는 모드는 idle 로 떨어지는지 확인한다.
- [ ] **Step 2: 실패를 확인한다.**
- [ ] **Step 3: 구현한다.** `WindowBounds` 는 순수 함수(화면 작업 영역을 인자로 받는다), `WindowModeService` 가 실제 `Window` 에 적용한다.
- [ ] **Step 4: 통과를 확인한다.**
- [ ] **Step 5: 커밋**

```bash
git commit -am "feat(desktop-win): make the window mode service the single source of window shape"
```

---

### Task 13: 화면 토큰과 로그인

**Files:**
- Create: `apps/desktop-win/src/KAster.Desktop.App/Themes/Tokens.xaml`
- Create: `apps/desktop-win/src/KAster.Desktop.App/Views/LoginView.xaml`
- Create: `apps/desktop-win/src/KAster.Desktop.App/ViewModels/LoginViewModel.cs`
- Test: `apps/desktop-win/tests/KAster.Desktop.Tests/App/LoginViewModelTests.cs`

- [ ] **Step 1: 토큰을 정의한다.** 설계 문서 5장의 표를 `Tokens.xaml` 에 `SolidColorBrush` / `Thickness` / `CornerRadius` 리소스로 옮긴다. **화면에 색상 리터럴을 직접 쓰지 않는다.**
- [ ] **Step 2: 뷰모델의 실패하는 테스트를 쓴다.** 아이디·비밀번호·내선이 비면 로그인 버튼이 비활성, 로그인 실패 시 메시지가 노출되고 비밀번호가 지워지는지, 성공 시 토큰이 금고에 저장되는지 확인한다.
- [ ] **Step 3: 실패를 확인하고 구현한다.** XAML 은 시안(캔버스의 로그인 골격)을 따른다. 코드비하인드에는 로직을 두지 않는다.
- [ ] **Step 4: 통과를 확인하고 실제로 로그인해 본다.**

```bash
dotnet run --project apps/desktop-win/src/KAster.Desktop.App
```

시드 계정 `agent1001 / Password123! / 1001` 로 로그인된다.

- [ ] **Step 5: 커밋**

```bash
git commit -am "feat(desktop-win): add the design tokens and the login screen"
```

---

### Task 14: 대기·수신·통화중 화면

**Files:**
- Create: `apps/desktop-win/src/KAster.Desktop.App/Views/IdleView.xaml`
- Create: `apps/desktop-win/src/KAster.Desktop.App/Views/RingingView.xaml`
- Create: `apps/desktop-win/src/KAster.Desktop.App/Views/TalkingView.xaml`
- Create: `apps/desktop-win/src/KAster.Desktop.App/ViewModels/SoftphoneViewModel.cs`
- Test: `apps/desktop-win/tests/KAster.Desktop.Tests/App/SoftphoneViewModelTests.cs`

시안: 캔버스의 `대기 idle`, `수신 ringing`, `통화중 talking` 아트보드.

**레이아웃 규칙(설계 문서 5장):** 창에 스크롤을 만들지 않는다. 가변 텍스트는 한 줄 + 말줄임(`TextTrimming="CharacterEllipsis"`), 메모는 고정 줄 수, 남는 세로 공간은 한 영역만 흡수한다.

- [ ] **Step 1: 뷰모델의 실패하는 테스트를 쓴다.** 통화 상태에 따라 창 모드 요청이 idle→ringing→talking→idle 로 바뀌는지, 통화 시간 타이머가 `answeredAt` 기준으로 흐르는지, 마이크 토글이 로컬과 서버 양쪽에 반영되는지 확인한다.
- [ ] **Step 2: 실패를 확인하고 구현한다.**
- [ ] **Step 3: 통과를 확인한다.**
- [ ] **Step 4: 스크롤이 없는지 눈으로 확인한다.** 각 모드에서 창을 최소 크기까지 줄여도 스크롤바가 생기지 않아야 한다. 긴 고객명(20자 이상)을 넣어 말줄임이 동작하는지도 본다.
- [ ] **Step 5: 커밋**

```bash
git commit -am "feat(desktop-win): add the idle, ringing and talking screens"
```

---

### Task 15: 1단계 통합 검증

- [ ] **Step 1: 전체 테스트와 빌드를 돌린다**

```bash
dotnet test apps/desktop-win/KAster.Desktop.sln
dotnet build apps/desktop-win/KAster.Desktop.sln -c Release
cd apps/server && npm test && npm run lint
```

- [ ] **Step 2: 실 PBX 시나리오를 실행한다**

`docs/qa/` 의 기존 스모크 절차를 준용한다. 최소 시나리오:

1. 로그인 → SIP 등록됨 확인 (`pjsip show endpoint 1001` 에 Avail)
2. 외부 → 큐 → 이 상담원으로 수신, 화면이 ringing 으로 바뀜
3. 받기 → talking, 양방향 음성 확인
4. 마이크 끄기 → 상대가 못 들음, 다시 켜기
5. 끊기 → 양쪽 종료, 화면이 idle 로 복귀
6. 발신 → 상대 단말이 울리고 통화됨
7. 상태 변경(대기 ↔ 휴식) → 관리자 화면에 반영됨
8. 서버를 잠시 내렸다 올려 재연결되는지 확인
9. 액세스 토큰 만료 후(15분) API 호출이 자동 회전되는지 확인

- [ ] **Step 3: 결과를 기록한다.** `docs/qa/YYYY-MM-DD-csharp-softphone-phase1-verification.md` 에 실행한 명령과 출력 요약을 적는다. **실행하지 않은 항목을 통과로 적지 않는다.**
- [ ] **Step 4: 음질 게이트를 판정한다.** Task 11 의 실측 결과로 1단계 종료 여부를 정한다. 에코 문제가 남으면 2단계로 넘어가지 않고 대응안을 결정한다.
- [ ] **Step 5: 커밋하고 PR 을 연다**

```bash
git add docs/qa
git commit -m "docs(qa): record the phase 1 verification results"
```

---

## 미결정 사항

- 원격 상담원용 TLS+SRTP 지원 시점 (2단계 이후 판단)
- 병행 기간의 업데이트 채널 명명 규칙
- Electron 앱 폐기 시점과 마이그레이션 안내 절차
