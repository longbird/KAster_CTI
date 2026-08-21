using System.Net.Http;
using KAster.Desktop.App.Services;
using KAster.Desktop.Core.Contracts;
using KAster.Desktop.Core.Server;
using KAster.Desktop.Core.State;
using KAster.Desktop.Softphone;

namespace KAster.Desktop.App.ViewModels;

/// <summary>
/// 통화 화면 하나가 대기·수신·통화중·후처리를 모두 담당한다. 창 모양은 <b>요청만</b> 하고
/// 실제로 창을 바꾸는 일은 <see cref="WindowModeService"/> 가 한다.
///
/// 화면에 보이는 상태의 근거는 언제나 서버다 (<see cref="CallStateStore"/>). 소프트폰은 소리만 담당한다.
/// </summary>
public sealed class SoftphoneViewModel : ObservableObject
{
    private readonly CallStateStore _store;
    private readonly CtiServerClient _server;
    private readonly ISoftphoneControl _phone;
    private readonly AgentProfile _agent;
    private readonly Func<DateTimeOffset> _now;

    private WindowMode _windowMode = WindowMode.Idle;
    private string _customerName = string.Empty;
    private string _phoneNumber = string.Empty;
    private string _callDurationText = "00:00";
    private string? _noticeMessage;
    private bool _isMuted;
    private bool _isConnected;
    private AgentStatusCode _agentStatus = AgentStatusCode.Available;
    private string _dialNumber = string.Empty;
    private IReadOnlyList<string> _callerIds = Array.Empty<string>();
    private string? _selectedCallerId;

    /// <summary>같은 테넌트의 상담원 내선. 건 번호가 내선인지 가르는 유일한 근거다.</summary>
    private HashSet<string> _knownExtensions = new(StringComparer.Ordinal);

    /// <summary>
    /// 우리가 방금 건 번호와, 그 전화를 스스로 받아도 되는 기한.
    ///
    /// 발신은 PBX 가 우리 단말을 먼저 부르는 방식이라, 우리가 건 전화인데도 수신 INVITE 가 들어온다.
    /// 그 한 통만 자동으로 받는다. 기한을 두는 이유는 발신이 실패했을 때 이 상태가 남아 있다가
    /// 한참 뒤 걸려 온 고객 전화를 말없이 받아 버리는 것을 막기 위해서다.
    /// </summary>
    private string? _dialedNumber;
    private DateTimeOffset? _selfAnswerUntil;

    private const int SelfAnswerWindowSeconds = 45;

    public SoftphoneViewModel(
        CallStateStore store,
        CtiServerClient server,
        ISoftphoneControl phone,
        AgentProfile agent,
        Func<DateTimeOffset> now)
    {
        _store = store;
        _server = server;
        _phone = phone;
        _agent = agent;
        _now = now;

        _store.CurrentCallChanged += (_, call) => OnCurrentCallChanged(call);

        AnswerCommand = new RelayCommand(() => _ = AnswerAsync(), () => WindowMode == WindowMode.Ringing);
        HangupCommand = new RelayCommand(() => _ = HangupAsync(), () => WindowMode is WindowMode.Ringing or WindowMode.Talking);
        ToggleMuteCommand = new RelayCommand(() => _ = ToggleMuteAsync(), () => WindowMode == WindowMode.Talking);
        DialCommand = new RelayCommand(() => _ = DialAsync(), () => IsFree && CleanNumber(DialNumber).Length > 0);
        ToggleAvailabilityCommand = new RelayCommand(
            () => _ = ChangeStatusAsync(IsAvailable ? AgentStatusCode.Break : AgentStatusCode.Available),
            () => IsFree);
    }

    public event EventHandler<WindowMode>? WindowModeRequested;

    public RelayCommand AnswerCommand { get; }

    public RelayCommand HangupCommand { get; }

    public RelayCommand ToggleMuteCommand { get; }

    public RelayCommand DialCommand { get; }

    public RelayCommand ToggleAvailabilityCommand { get; }

    /// <summary>걸 번호. 화면에는 사람이 친 그대로 두고, 보낼 때만 기호를 떼어 낸다.</summary>
    public string DialNumber
    {
        get => _dialNumber;
        set
        {
            if (!Set(ref _dialNumber, value)) return;
            DialCommand.RaiseCanExecuteChanged();
            Raise(nameof(ShowsCallerIdPicker));
        }
    }

    /// <summary>관리자가 등록해 둔 발신번호. 외부 발신에 이 중 하나를 실어 보낸다.</summary>
    public IReadOnlyList<string> CallerIds
    {
        get => _callerIds;
        private set => Set(ref _callerIds, value);
    }

    public string? SelectedCallerId
    {
        get => _selectedCallerId;
        set => Set(ref _selectedCallerId, value);
    }

    /// <summary>내선을 거는 동안에는 발신번호 칸이 뜻이 없다. 고를 것이 있을 때만 보인다.</summary>
    public bool ShowsCallerIdPicker
        => CallerIds.Count > 0 && CleanNumber(DialNumber) is { Length: > 0 } number && !IsExtension(number);

    public bool IsAvailable => AgentStatus != AgentStatusCode.Break;

    /// <summary>통화가 걸려 있지 않은 상태. 발신과 상태 변경은 이때만 연다.</summary>
    private bool IsFree => WindowMode == WindowMode.Idle;

    public string AgentName => _agent.AgentName;

    public string Extension => _agent.Extension;

    public WindowMode WindowMode
    {
        get => _windowMode;
        private set
        {
            if (!Set(ref _windowMode, value)) return;

            Raise(nameof(IsRinging));
            Raise(nameof(IsTalking));
            AnswerCommand.RaiseCanExecuteChanged();
            HangupCommand.RaiseCanExecuteChanged();
            ToggleMuteCommand.RaiseCanExecuteChanged();
            DialCommand.RaiseCanExecuteChanged();
            ToggleAvailabilityCommand.RaiseCanExecuteChanged();
            WindowModeRequested?.Invoke(this, value);
        }
    }

    public bool IsRinging => WindowMode == WindowMode.Ringing;

    public bool IsTalking => WindowMode == WindowMode.Talking;

    public string CustomerName
    {
        get => _customerName;
        private set => Set(ref _customerName, value);
    }

    public string PhoneNumber
    {
        get => _phoneNumber;
        private set => Set(ref _phoneNumber, value);
    }

    public string CallDurationText
    {
        get => _callDurationText;
        private set => Set(ref _callDurationText, value);
    }

    public string? NoticeMessage
    {
        get => _noticeMessage;
        private set => Set(ref _noticeMessage, value);
    }

    public bool IsMuted
    {
        get => _isMuted;
        private set => Set(ref _isMuted, value);
    }

    public bool IsConnected
    {
        get => _isConnected;
        private set => Set(ref _isConnected, value);
    }

    public AgentStatusCode AgentStatus
    {
        get => _agentStatus;
        private set
        {
            if (!Set(ref _agentStatus, value)) return;
            Raise(nameof(IsAvailable));
        }
    }

    /// <summary>1초마다 불린다. 통화 시간은 서버가 준 <c>answeredAt</c> 기준으로 다시 계산한다.</summary>
    public void Tick()
    {
        var answeredAt = _store.Current?.Server?.AnsweredAt;
        if (answeredAt is null)
        {
            CallDurationText = "00:00";
            return;
        }

        var elapsed = _now() - answeredAt.Value;
        if (elapsed < TimeSpan.Zero) elapsed = TimeSpan.Zero;

        CallDurationText = elapsed.TotalHours >= 1
            ? $"{(int)elapsed.TotalHours}:{elapsed.Minutes:00}:{elapsed.Seconds:00}"
            : $"{elapsed.Minutes:00}:{elapsed.Seconds:00}";
    }

    public void OnConnectionStateChanged(CtiConnectionState state)
        => IsConnected = state == CtiConnectionState.Connected;

    public async Task AnswerAsync(CancellationToken ct = default)
    {
        var callId = CurrentCallId();
        if (callId is null) return;

        // SIP 200 OK 하나로 끝난다. 서버는 PBX 이벤트로 응답을 알게 된다.
        // 서버의 answer 는 <b>당겨받기</b>라서 이미 내 단말에 울리는 전화에 부르면 거부당한다.
        await _phone.AnswerAsync();
    }

    public async Task HangupAsync(CancellationToken ct = default)
    {
        var callId = CurrentCallId();
        _phone.Hangup();

        if (callId is not null) await Send(() => _server.HangupAsync(callId, ct));
    }

    public async Task ToggleMuteAsync(CancellationToken ct = default)
    {
        var callId = CurrentCallId();
        var next = !IsMuted;

        // 로컬을 먼저 바꾼다. 서버 왕복을 기다리는 사이에 목소리가 나가면 안 된다.
        _phone.IsMuted = next;
        IsMuted = next;

        if (callId is not null) await Send(() => _server.MuteAsync(callId, next, ct));
    }

    /// <summary>
    /// 로그인 직후 한 번. 내선 목록과 발신번호를 받아 둔다.
    /// 실패해도 앱은 그대로 돈다 — 발신만 못 하고 수신·통화는 영향이 없다.
    /// </summary>
    public async Task LoadDialSetupAsync(CancellationToken ct = default)
    {
        var directory = await Send(() => _server.GetAgentDirectoryAsync(ct));
        if (directory is not null)
        {
            _knownExtensions = directory
                .Select(entry => entry.Extension?.Trim())
                .Where(extension => !string.IsNullOrEmpty(extension))
                .ToHashSet(StringComparer.Ordinal)!;
        }

        var capabilities = await Send(() => _server.GetCallCapabilitiesAsync(ct));
        if (capabilities is null) return;

        CallerIds = capabilities.OutboundDialOptions.AllowedCallerIds;
        SelectedCallerId = capabilities.OutboundDialOptions.DefaultCallerId ?? CallerIds.FirstOrDefault();
        Raise(nameof(ShowsCallerIdPicker));
    }

    /// <summary>
    /// 발신. 우리가 상대에게 직접 INVITE 를 보내지 않는다 — 서버에 부탁하면 PBX 가 <b>이 단말로</b> 전화를 걸고,
    /// 받으면 그 다음에 상대에게 연결한다. 기존 앱과 같은 흐름이라 통화 기록과 녹취가 한 갈래로 남는다.
    ///
    /// 내선과 외부는 서버에서 아예 다른 경로다. 외부 경로에 내선을 넣으면 번호 형식 검사에 걸려 거부된다.
    /// </summary>
    public async Task DialAsync(CancellationToken ct = default)
    {
        var number = CleanNumber(DialNumber);
        if (number.Length == 0) return;

        var ack = IsExtension(number)
            ? await Send(() => _server.OriginateInternalAsync(number, ct))
            : await Send(() => _server.OriginateAsync(number, SelectedCallerId, ct));

        // 거절당한 번호는 지우지 않는다. 고쳐서 다시 걸 수 있어야 한다.
        if (ack is null) return;

        _dialedNumber = number;
        _selfAnswerUntil = _now().AddSeconds(SelfAnswerWindowSeconds);
        DialNumber = string.Empty;
    }

    /// <summary>
    /// 소프트폰이 알려주는 회선 상태. 우리가 방금 건 전화라면 묻지 않고 바로 받는다.
    /// UI 스레드에서 불러야 한다 — 창을 만지는 경로로 이어진다.
    /// </summary>
    public void OnSoftphoneCallStatusChanged(SoftphoneCallStatus status)
    {
        if (status.State == SoftphoneCallState.Ringing && IsSelfAnswering)
        {
            // 한 번만 받는다. 뒤이어 오는 전화는 상담원이 정한다.
            _selfAnswerUntil = null;
            _ = _phone.AnswerAsync();
            return;
        }

        if (status.State is SoftphoneCallState.Idle or SoftphoneCallState.Ended)
        {
            _selfAnswerUntil = null;
            _dialedNumber = null;
        }
    }

    private bool IsSelfAnswering => _selfAnswerUntil is { } until && _now() <= until;

    /// <summary>
    /// 내선인지 가른다. <b>자릿수로 짐작하지 않는다</b> — 119·112 는 세 자리라 내선처럼 보이지만
    /// 사내로 빠지면 안 되는 번호다. 실제 상담원 내선 목록에 있는 번호만 내선으로 본다.
    /// </summary>
    private bool IsExtension(string number) => _knownExtensions.Contains(number);

    /// <summary>사람이 치는 공백·하이픈·괄호를 떼어 낸다. 서버는 숫자와 <c>*#+</c> 만 받는다.</summary>
    private static string CleanNumber(string value)
        => new(value.Where(c => char.IsAsciiDigit(c) || c is '*' or '#' or '+').ToArray());

    public async Task ChangeStatusAsync(AgentStatusCode status, string? reasonCode = null, CancellationToken ct = default)
    {
        var changed = await Send(() => _server.ChangeAgentStatusAsync(_agent.AgentId, status, reasonCode, ct));
        if (changed is not null) AgentStatus = changed.StatusCode;
    }

    private string? CurrentCallId() => _store.Current?.Server?.CallId;

    private void OnCurrentCallChanged(CurrentCall? call)
    {
        var server = call?.Server;

        WindowMode = server?.SessionStatus switch
        {
            SessionStatus.Queued or SessionStatus.RingingAgent or SessionStatus.New or SessionStatus.Ivr
                => WindowMode.Ringing,
            SessionStatus.Talking or SessionStatus.Hold => WindowMode.Talking,
            SessionStatus.Transferring => WindowMode.Transferring,
            SessionStatus.AfterCallWork => WindowMode.AfterCall,
            _ => WindowMode.Idle,
        };

        CustomerName = server is null
            ? string.Empty
            : string.IsNullOrWhiteSpace(server.Customer?.CustomerName) ? "알 수 없음" : server.Customer.CustomerName;

        // 내선 발신은 서버가 direction 을 outbound 로 남기지 않아 세션의 번호가 우리 내선으로 온다.
        // 우리가 건 번호를 알고 있으면 그쪽이 맞다.
        PhoneNumber = server is null
            ? string.Empty
            : _dialedNumber ?? server.Ani;

        // 서버가 실제 음소거 상태를 알려주면 그 값을 따른다.
        if (server?.IsMuted is { } muted) IsMuted = muted;

        if (WindowMode == WindowMode.Idle)
        {
            IsMuted = false;
            CallDurationText = "00:00";
            _dialedNumber = null;
        }
        else
        {
            Tick();
        }
    }

    /// <summary>
    /// 서버 명령을 보내고 실패는 화면 알림으로 돌린다. 명령 하나가 실패했다고 앱이 죽으면 안 된다.
    /// </summary>
    private async Task<T?> Send<T>(Func<Task<T>> command) where T : class
    {
        try
        {
            NoticeMessage = null;
            return await command();
        }
        catch (CtiServerException ex)
        {
            NoticeMessage = ex.Message;
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            NoticeMessage = $"서버에 연결할 수 없다: {ex.Message}";
        }

        return null;
    }
}
