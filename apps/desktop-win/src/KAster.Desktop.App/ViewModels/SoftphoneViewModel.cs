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

    /// <summary>
    /// 소프트폰으로 통화하는지. false 면 <b>실기기 모드</b> — 책상 전화기가 소리를 맡고
    /// 이 앱은 통화 제어만 한다. 그때 우리 SIP 등록 상태를 보여 주면 거짓말이 된다.
    /// </summary>
    private readonly bool _useSoftphone;

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
    private bool _isDialing;
    private bool _isPhoneRegistered;
    private string _phoneStatusText;
    private string _dialingNumber = string.Empty;
    private string _memoText = string.Empty;

    /// <summary>메모를 붙일 통화. 통화가 끝난 뒤에 저장하므로 그때는 현재 통화가 이미 없다.</summary>
    private string? _memoCallId;

    private const int SelfAnswerWindowSeconds = 45;

    public SoftphoneViewModel(
        CallStateStore store,
        CtiServerClient server,
        ISoftphoneControl phone,
        AgentProfile agent,
        Func<DateTimeOffset> now,
        bool useSoftphone)
    {
        _store = store;
        _server = server;
        _phone = phone;
        _agent = agent;
        _now = now;
        _useSoftphone = useSoftphone;
        _phoneStatusText = useSoftphone ? "전화 꺼짐" : "전화기 확인 중";

        _store.CurrentCallChanged += (_, call) => OnCurrentCallChanged(call);

        AnswerCommand = new RelayCommand(() => _ = AnswerAsync(), () => WindowMode == WindowMode.Ringing);
        HangupCommand = new RelayCommand(() => _ = HangupAsync(), () => WindowMode is WindowMode.Ringing or WindowMode.Talking);
        ToggleMuteCommand = new RelayCommand(() => _ = ToggleMuteAsync(), () => WindowMode == WindowMode.Talking);
        DialCommand = new RelayCommand(() => _ = DialAsync(), () => IsFree && CleanNumber(DialNumber).Length > 0);
        ToggleAvailabilityCommand = new RelayCommand(
            () => _ = ChangeStatusAsync(IsAvailable ? AgentStatusCode.Break : AgentStatusCode.Available),
            () => IsFree);

        // 통화 중 로그아웃은 막는다. 고객이 끊긴 줄 모른 채 남는다.
        SignOutCommand = new RelayCommand(() => SignOutRequested?.Invoke(this, EventArgs.Empty), () => IsFree);
    }

    public event EventHandler<WindowMode>? WindowModeRequested;

    public RelayCommand AnswerCommand { get; }

    public RelayCommand HangupCommand { get; }

    public RelayCommand ToggleMuteCommand { get; }

    public RelayCommand DialCommand { get; }

    public RelayCommand ToggleAvailabilityCommand { get; }

    public RelayCommand SignOutCommand { get; }

    /// <summary>로그아웃을 실제로 수행하는 것은 조립 지점이다. 화면은 요청만 한다.</summary>
    public event EventHandler? SignOutRequested;

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

    /// <summary>
    /// 통화 중에 적는 메모. 통화가 끝날 때 저장한다 — 화면이 바뀌면서 사라지면 다시 쓸 방법이 없다.
    /// </summary>
    public string MemoText
    {
        get => _memoText;
        set => Set(ref _memoText, value);
    }

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
            SignOutCommand.RaiseCanExecuteChanged();
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
        // PBX 가 되걸어 주지 않으면 아무 일도 일어나지 않는다. 조용히 두면 상담원은
        // "대기 중" 화면을 보며 전화가 걸린 줄 안다.
        if (IsDialing && !IsSelfAnswering)
        {
            NoticeMessage = $"{DialingNumber} 발신 요청은 접수됐지만 전화가 오지 않았다. 다시 걸어 달라.";
            _selfAnswerUntil = null;
            _dialedNumber = null;
            StopDialing("기한 안에 전화가 오지 않았다");
        }

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

    /// <summary>
    /// 통화 외의 서버 이벤트. 통화 이벤트는 <see cref="CallStateStore"/> 가 맡는다.
    /// 여기서 받지 않으면 그 이벤트들은 조용히 사라진다 — 관리자가 상태를 바꿔도 화면이 그대로였던 이유다.
    /// </summary>
    public void Apply(CtiEvent evt)
    {
        switch (evt)
        {
            // 관리자가 강제로 이석시키는 경우가 있다. 내 것만 반영한다.
            case AgentStatusChangedEvent status when status.Change.AgentId == _agent.AgentId:
                AgentStatus = status.Change.StatusCode;
                break;

            // 지금 통화의 고객이 누구인지 뒤늦게 밝혀지는 경우다.
            case ScreenPopEvent pop when pop.CallId == CurrentCallId() && pop.Customer is not null:
                CustomerName = string.IsNullOrWhiteSpace(pop.Customer.CustomerName)
                    ? "알 수 없음"
                    : pop.Customer.CustomerName;
                break;
        }
    }

    public void OnConnectionStateChanged(CtiConnectionState state)
        => IsConnected = state == CtiConnectionState.Connected;

    /// <summary>
    /// PBX 에 전화기가 등록돼 있는지. <b>서버 연결과 다른 것이다.</b>
    /// 웹소켓이 붙어 있어도 SIP 등록이 죽으면 전화는 한 통도 오지 않는다.
    /// 그때 화면이 "연결됨" 하나만 보여 주면 상담원은 원인을 알 수 없다.
    /// </summary>
    public bool IsPhoneRegistered
    {
        get => _isPhoneRegistered;
        private set => Set(ref _isPhoneRegistered, value);
    }

    public string PhoneStatusText
    {
        get => _phoneStatusText;
        private set => Set(ref _phoneStatusText, value);
    }

    public void OnRegistrationStatusChanged(RegistrationStatus status)
    {
        // 실기기 모드에서는 우리가 등록하지 않는다. 우리 상태를 보여 주면 거짓말이다.
        if (!_useSoftphone) return;

        IsPhoneRegistered = status.State == RegistrationState.Registered;
        PhoneStatusText = status.State switch
        {
            RegistrationState.Registered => "전화 준비됨",
            RegistrationState.Registering => "전화 등록 중",
            RegistrationState.Failed => string.IsNullOrWhiteSpace(status.Reason)
                ? "전화 등록 실패"
                : $"전화 등록 실패: {status.Reason}",
            _ => "전화 꺼짐",
        };
    }

    public async Task AnswerAsync(CancellationToken ct = default)
    {
        var callId = CurrentCallId();
        if (callId is null) return;

        if (_useSoftphone)
        {
            // SIP 200 OK 하나로 끝난다. 서버는 PBX 이벤트로 응답을 알게 된다.
            // 서버의 answer 는 <b>당겨받기</b>라서 이미 내 단말에 울리는 전화에 부르면 거부당한다.
            await _phone.AnswerAsync();
            return;
        }

        // 실기기 모드에는 우리가 열 SIP 다이얼로그가 없다. 서버가 고객 레그를 이 내선으로 돌린다.
        await Send(() => _server.AnswerAsync(callId, ct));
    }

    public async Task HangupAsync(CancellationToken ct = default)
    {
        var callId = CurrentCallId();
        if (_useSoftphone) _phone.Hangup();

        if (callId is not null) await Send(() => _server.HangupAsync(callId, ct));
    }

    public async Task ToggleMuteAsync(CancellationToken ct = default)
    {
        var callId = CurrentCallId();
        var next = !IsMuted;

        if (_useSoftphone)
        {
            // 로컬을 먼저 바꾼다. 서버 왕복을 기다리는 사이에 목소리가 나가면 안 된다.
            _phone.IsMuted = next;

            // 소리 경로가 안 열려 있으면 소프트폰은 이 요청을 조용히 삼킨다.
            // 그때 화면만 "마이크 켜기" 로 바꾸면 상담원은 꺼진 줄 알고 말하고, 상대에게 다 들린다.
            if (_phone.IsMuted != next)
            {
                Note($"음소거 {next} 적용 실패 — 소프트폰이 받아들이지 않았다");
                NoticeMessage = "마이크를 끄지 못했다. 통화 오디오가 열려 있지 않다.";
                return;
            }
        }

        IsMuted = next;
        Note($"음소거 {next}");

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

            ApplyDeskPhoneRegistration(directory);
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

        var internalCall = IsExtension(number);
        Note($"발신 요청 {number} ({(internalCall ? "내선" : "외부")})");

        // PBX 는 서버의 HTTP 응답보다 <b>먼저</b> 우리를 부를 수 있다
        // (실측 2026-08-21: 외부 발신에서 INVITE 가 ack 보다 1ms 빨랐다).
        // 그래서 요청을 보내기 전에 창을 연다. 응답을 기다렸다 열면 그 한 통을 놓친다.
        _dialedNumber = number;
        _selfAnswerUntil = _now().AddSeconds(SelfAnswerWindowSeconds);
        DialingNumber = PhoneNumberFormat.ForDisplay(number);
        IsDialing = true;

        var ack = internalCall
            ? await Send(() => _server.OriginateInternalAsync(number, ct))
            : await Send(() => _server.OriginateAsync(number, SelectedCallerId, ct));

        // 거절당했으면 창을 즉시 닫는다. 열어 둔 채로 두면 남의 전화를 말없이 받는다.
        // 번호는 지우지 않는다 — 고쳐서 다시 걸 수 있어야 한다.
        if (ack is null)
        {
            Note($"발신 거부 {number}: {NoticeMessage}");
            _selfAnswerUntil = null;
            _dialedNumber = null;
            StopDialing("서버가 거부했다");
            return;
        }

        Note($"발신 접수 {number}");
        DialNumber = string.Empty;
    }

    /// <summary>
    /// 소프트폰이 알려주는 회선 상태. 우리가 방금 건 전화라면 묻지 않고 바로 받는다.
    /// UI 스레드에서 불러야 한다 — 창을 만지는 경로로 이어진다.
    /// </summary>
    public void OnSoftphoneCallStatusChanged(SoftphoneCallStatus status)
    {
        Note($"소프트폰 회선 {status.State} (자동응답 대기={IsSelfAnswering})");
        if (status.State == SoftphoneCallState.Ringing && IsSelfAnswering)
        {
            // 한 번만 받는다. 뒤이어 오는 전화는 상담원이 정한다.
            _selfAnswerUntil = null;
            StopDialing("전화가 도착했다");
            _ = SelfAnswerAsync();
            return;
        }

        if (status.State is SoftphoneCallState.Idle or SoftphoneCallState.Ended)
        {
            _selfAnswerUntil = null;
            _dialedNumber = null;
            StopDialing("소프트폰이 유휴로 돌아갔다");
        }
    }

    private bool IsSelfAnswering => _selfAnswerUntil is { } until && _now() <= until;

    /// <summary>발신 요청을 보내고 PBX 가 되걸어 주기를 기다리는 중.</summary>
    public bool IsDialing
    {
        get => _isDialing;
        private set => Set(ref _isDialing, value);
    }

    /// <summary>지금 걸고 있는 번호.</summary>
    public string DialingNumber
    {
        get => _dialingNumber;
        private set => Set(ref _dialingNumber, value);
    }

    private void StopDialing(string why)
    {
        if (IsDialing) Note($"발신 중 해제: {why}");
        IsDialing = false;
        DialingNumber = string.Empty;
    }

    /// <summary>
    /// 스스로 받기. 실패를 삼키지 않는다 — 조용히 실패하면 상담원은 왜 안 받아지는지 알 수 없고,
    /// 화면은 계속 "받기"를 띄운 채 멈춰 있게 된다.
    /// </summary>
    private async Task SelfAnswerAsync()
    {
        try
        {
            if (await _phone.AnswerAsync()) return;
            NoticeMessage = "건 전화를 자동으로 받지 못했다. 받기를 눌러 달라.";
        }
        catch (Exception ex)
        {
            NoticeMessage = $"자동 응답 실패: {ex.Message}";
            SelfAnswerFailed?.Invoke(this, ex);
        }
    }

    /// <summary>자동 응답이 예외로 끝난 경우. 조립 지점이 파일로 남긴다.</summary>
    public event EventHandler<Exception>? SelfAnswerFailed;

    /// <summary>
    /// 발신 한 통이 어디까지 갔는지 남긴다. "전화가 안 걸린다" 는 신고가 들어왔을 때
    /// 화면 캡처만으로는 알 수 없는 것 — 요청은 나갔는지, PBX 가 되걸었는지 — 을 이걸로 가른다.
    /// </summary>
    public event EventHandler<string>? Diagnostic;

    private void Note(string message) => Diagnostic?.Invoke(this, message);

    /// <summary>
    /// 내선인지 가른다. <b>자릿수로 짐작하지 않는다</b> — 119·112 는 세 자리라 내선처럼 보이지만
    /// 사내로 빠지면 안 되는 번호다. 실제 상담원 내선 목록에 있는 번호만 내선으로 본다.
    /// </summary>
    private bool IsExtension(string number) => _knownExtensions.Contains(number);

    /// <summary>
    /// 실기기 모드에서 내 내선의 전화기가 PBX 에 등록돼 있는지 확인해 화면에 올린다.
    /// 등록돼 있지 않으면 전화가 한 통도 오지 않는다 — 로그인 직후에 말해 줘야 한다.
    /// </summary>
    private void ApplyDeskPhoneRegistration(IReadOnlyList<AgentDirectoryEntry> directory)
    {
        if (_useSoftphone) return;

        var mine = directory.FirstOrDefault(entry =>
            string.Equals(entry.Extension?.Trim(), _agent.Extension, StringComparison.Ordinal));

        if (mine is null)
        {
            IsPhoneRegistered = false;
            PhoneStatusText = $"내선 {_agent.Extension} 을 찾을 수 없다";
            return;
        }

        IsPhoneRegistered = mine.SipRegistration?.Registered ?? false;
        PhoneStatusText = IsPhoneRegistered
            ? "전화기 준비됨"
            : $"전화기가 등록되지 않았다 ({mine.SipRegistration?.RegistrationStatus ?? "UNREGISTERED"})";
        Note($"실기기 등록 확인 내선={_agent.Extension} 등록={IsPhoneRegistered}");
    }

    /// <summary>
    /// 메모를 통화에 붙인다. 빈 메모는 보내지 않는다 — 통화마다 빈 줄이 쌓인다.
    /// 실패하면 알림만 남기고 화면에는 그대로 둔다. 지워 버리면 상담원이 다시 쓸 수 없다.
    /// </summary>
    private async Task FileMemoAsync(CancellationToken ct = default)
    {
        var text = MemoText.Trim();
        var callId = _memoCallId;
        _memoCallId = null;

        if (text.Length == 0 || callId is null)
        {
            MemoText = string.Empty;
            return;
        }

        var saved = await Send(() => _server.SaveMemoAsync(callId, _agent.AgentId, text, ct));
        Note(saved is null ? $"메모 저장 실패 {callId}" : $"메모 저장 {callId}");
        if (saved is not null) MemoText = string.Empty;
    }

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
            : PhoneNumberFormat.ForDisplay(_dialedNumber ?? server.Ani);

        // 서버가 실제 음소거 상태를 알려주면 그 값을 따른다.
        if (server?.IsMuted is { } muted) IsMuted = muted;

        // 통화가 끝난 뒤에 메모를 저장하므로, 어느 통화였는지 지금 붙잡아 둔다.
        if (server is not null && WindowMode != WindowMode.Idle) _memoCallId = server.CallId;

        if (WindowMode == WindowMode.Idle)
        {
            IsMuted = false;
            CallDurationText = "00:00";
            _dialedNumber = null;
            _ = FileMemoAsync();
        }
        else
        {
            // 통화가 잡혔다. 발신 중 표시는 끝난다.
            StopDialing("서버가 통화를 알려줬다");
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
