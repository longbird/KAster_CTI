using System.Net.Http;
using KAster.Desktop.App.Services;
using KAster.Desktop.Core.Contracts;
using KAster.Desktop.Core.Server;
using KAster.Desktop.Core.State;
using KAster.Desktop.Core.Storage;
using KAster.Desktop.Softphone;

namespace KAster.Desktop.App.ViewModels;

/// <summary>
/// 통화 화면. 받기·끊기·마이크·근무 상태, 그리고 <b>창 모양</b>이 여기 남는다.
/// 창 모양은 <b>요청만</b> 하고 실제로 창을 바꾸는 일은 <see cref="WindowModeService"/> 가 한다.
///
/// 화면에 보이는 상태의 근거는 언제나 서버다 (<see cref="CallStateStore"/>). 소프트폰은 소리만 담당한다.
///
/// 갈래가 있는 화면(제안·돌려주기·이력·키패드·발신·당겨받기)은 각자 뷰모델로 나가 있고, 여기서는
/// 속성으로 들고만 있다. 그쪽에서 올라오는 것은 "열렸다/닫혔다" 뿐이고, 그때 창을 어떻게 할지는
/// <b>여기서</b> 정한다 — 창 모양의 진실원이 둘이 되면 어느 쪽이 마지막에 이겼는지 알 수 없게 된다.
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
    /// 이 앱은 통화 제어만 한다. 받기·끊기·음소거가 나가는 길이 그래서 갈린다.
    /// </summary>
    private readonly bool _useSoftphone;

    private WindowMode _windowMode = WindowMode.Idle;
    private string _customerName = string.Empty;
    private string _branchName = string.Empty;
    private string _calledNumber = string.Empty;
    private string _phoneNumber = string.Empty;
    private string _callDurationText = "00:00";
    private string? _noticeMessage;
    private bool _isMuted;
    private bool _isConnected;
    private AgentStatusCode _agentStatus = AgentStatusCode.Available;
    private bool _canHold;
    private bool _isOnHold;

    /// <summary>
    /// 보류 요청의 답을 기다리는 기한. 서버는 feature code 를 DTMF 로 넣을 뿐이라
    /// PBX 가 그것을 먹었는지 <b>모른다</b> — 아무 이벤트도 안 오는 경우가 있다.
    /// 기한이 없으면 화면이 영원히 "요청 중" 으로 남는다.
    /// </summary>
    private DateTimeOffset? _holdRequestDeadline;

    /// <summary>현장 설정. PBX 마다 feature code 를 먹는 데 걸리는 시간이 다르다.</summary>
    private readonly Func<CallPreferences> _preferences;

    private int HoldRequestTimeoutSeconds => _preferences().Sane().PbxResponseWaitSeconds;

    /// <summary>진행 중인 뒷작업. 테스트가 기다릴 수 있게 내보낸다.</summary>
    private Task _pendingWork = Task.CompletedTask;
    private string _memoText = string.Empty;

    /// <summary>메모를 붙일 통화. 통화가 끝난 뒤에 저장하므로 그때는 현재 통화가 이미 없다.</summary>
    private string? _memoCallId;

    public SoftphoneViewModel(
        CallStateStore store,
        CtiServerClient server,
        ISoftphoneControl phone,
        AgentProfile agent,
        Func<DateTimeOffset> now,
        bool useSoftphone,
        SoftphoneConfig? sipConfig,
        ISettingsStore<AnnouncementReadState> announcementReads,
        Func<CallPreferences>? callPreferences = null,
        UpdateViewModel? update = null)
    {
        _preferences = callPreferences ?? (static () => new CallPreferences());
        Update = update;

        _store = store;
        _server = server;
        _phone = phone;
        _agent = agent;
        _now = now;
        _useSoftphone = useSoftphone;

        _store.CurrentCallChanged += (_, call) => OnCurrentCallChanged(call);

        // 이 자리의 전화기가 살아 있는가. 통화 제어가 아니라 장치 상태라 따로 나가 있다.
        DeskPhone = new DeskPhoneViewModel(server, agent.Extension, now, useSoftphone, sipConfig, Note, Track);

        // 순서가 있다. 돌려주기는 당겨받기가 훑어 온 통화 목록을 받고, 이력의 "다시 걸기" 는
        // 발신 칸에 번호를 넣는다. 받는 쪽이 먼저 서 있어야 한다.
        Offer = new OfferViewModel(store, server, Notify, Track);
        Transfer = new TransferViewModel(store, server, agent.Extension, now, Notify, Track, _preferences);
        Keypad = new KeypadViewModel(phone, server, useSoftphone, CurrentCallId, Notify, Track);
        Dial = new DialViewModel(store, server, phone, now, Notify, Note, () => IsFree, _preferences);
        // 같은 통화 목록을 돌려주기와 상담원 목록이 함께 쓴다. 두 번 물어보지 않는다.
        Waiting = new WaitingCallsViewModel(
            server, now, Notify, Note, Track, () => IsFree, ShareActiveCalls);
        History = new HistoryViewModel(
            server, agent.AgentId, now, Notify, Track, number => Dial.DialNumber = number, () => IsFree);

        // 읽기 전용 정보 화면들. 창을 만드는 일은 조립 지점이 하고, 여기서는 어느 창인지만 넘긴다.
        // 목록에서 바로 거는 길은 발신 화면을 지나간다 — "우리가 건 전화" 표시의 주인이 거기다.
        Directory = new AgentDirectoryViewModel(
            server, agent.Extension, now, Notify, Track, () => IsFree, CallExtension);
        Queues = new QueueStatusViewModel(server, now, Track);
        Announcements = new AnnouncementsViewModel(server, announcementReads, agent.AgentId, now, Track);
        Customer = new CustomerInfoViewModel(store);

        Directory.Opened += (_, _) => InfoWindowRequested?.Invoke(this, InfoWindow.AgentDirectory);
        Directory.Closed += (_, _) => InfoWindowDismissed?.Invoke(this, InfoWindow.AgentDirectory);
        Queues.Opened += (_, _) => InfoWindowRequested?.Invoke(this, InfoWindow.QueueStatus);
        Queues.Closed += (_, _) => InfoWindowDismissed?.Invoke(this, InfoWindow.QueueStatus);
        Announcements.Opened += (_, _) => InfoWindowRequested?.Invoke(this, InfoWindow.Announcements);
        Announcements.Closed += (_, _) => InfoWindowDismissed?.Invoke(this, InfoWindow.Announcements);
        Customer.Opened += (_, _) => InfoWindowRequested?.Invoke(this, InfoWindow.CustomerInfo);
        Customer.Closed += (_, _) => InfoWindowDismissed?.Invoke(this, InfoWindow.CustomerInfo);

        // 제안이 뜨면 창이 그것부터 보여야 한다. 내려가면 원래 통화 상태로 돌아간다.
        //
        // 창을 앞으로 끌어내지는 않는다. 상담원이 가려 둔 창이 스스로 튀어나와 하던 작업을
        // 덮으면 알리는 것이 아니라 뺏는 것이다 — 대신 알릴 것이 생겼다고만 올린다.
        Offer.Changed += (_, offer) =>
        {
            if (offer is not null)
            {
                WindowMode = WindowMode.Ringing;
                AttentionRequested?.Invoke(
                    this, OfferAlert.For(Offer.OfferPhoneNumber, Offer.CountdownText));
            }
            else OnCurrentCallChanged(_store.Current);
        };

        Transfer.Started += (_, _) => WindowMode = WindowMode.Transferring;
        Transfer.Ended += (_, _) => OnCurrentCallChanged(_store.Current);
        History.Opened += (_, _) => WindowMode = WindowMode.Settings;
        History.Closed += (_, _) => OnCurrentCallChanged(_store.Current);

        // 내가 건 전화에 "받기" 는 뜻이 없다. 소프트폰이면 알아서 받고, 실기기면 수화기를 든다.
        AnswerCommand = new RelayCommand(
            () => _ = AnswerAsync(),
            () => WindowMode == WindowMode.Ringing && !Dial.IsOutboundCall);

        // 그 판정의 주인이 발신 쪽이므로, 바뀌면 여기 버튼을 다시 열고 닫아야 한다.
        Dial.OutboundMarkChanged += (_, _) => AnswerCommand.RaiseCanExecuteChanged();

        HangupCommand = new RelayCommand(() => _ = HangupAsync(), () => WindowMode is WindowMode.Ringing or WindowMode.Talking);
        ToggleMuteCommand = new RelayCommand(() => _ = ToggleMuteAsync(), () => WindowMode == WindowMode.Talking);

        // 앞선 요청의 답을 기다리는 동안에는 다시 누를 수 없다. 보류와 해제가 엇갈려 나가면
        // 어느 쪽이 마지막에 먹었는지 알 수 없게 된다.
        ToggleHoldCommand = new RelayCommand(
            () => _ = ToggleHoldAsync(),
            () => CanHold && WindowMode == WindowMode.Talking && !IsHoldRequestPending);
        ToggleAvailabilityCommand = new RelayCommand(
            () => _ = ChangeStatusAsync(IsAvailable ? AgentStatusCode.Break : AgentStatusCode.Available),
            () => IsFree);

        // 통화 중 로그아웃은 막는다. 고객이 끊긴 줄 모른 채 남는다.
        SignOutCommand = new RelayCommand(() => SignOutRequested?.Invoke(this, EventArgs.Empty), () => IsFree);
        OpenSettingsCommand = new RelayCommand(
            () => SettingsRequested?.Invoke(this, EventArgs.Empty),
            () => IsFree);
    }

    /// <summary>이 자리의 전화기가 살아 있는가. 실기기면 등록 안내도 여기가 든다.</summary>
    public DeskPhoneViewModel DeskPhone { get; }

    /// <summary>큐가 넘기기 전에 물어보는 호.</summary>
    public OfferViewModel Offer { get; }

    /// <summary>돌려줄 상대 고르기.</summary>
    public TransferViewModel Transfer { get; }

    /// <summary>지난 통화.</summary>
    public HistoryViewModel History { get; }

    /// <summary>통화 중 키패드.</summary>
    public KeypadViewModel Keypad { get; }

    /// <summary>발신.</summary>
    public DialViewModel Dial { get; }

    /// <summary>당겨받을 수 있는 전화.</summary>
    public WaitingCallsViewModel Waiting { get; }

    /// <summary>상담원 목록.</summary>
    public AgentDirectoryViewModel Directory { get; }

    /// <summary>큐 대기 현황.</summary>
    public QueueStatusViewModel Queues { get; }

    /// <summary>공지.</summary>
    public AnnouncementsViewModel Announcements { get; }

    /// <summary>지금 통화 중인 고객.</summary>
    public CustomerInfoViewModel Customer { get; }

    /// <summary>
    /// 새 버전 확인. <b>알리는 데까지만 한다</b> — 설치도 재시작도 상담원이 정한다.
    /// 로그인 화면에서 만든 화면에는 물어볼 서버가 없어 null 이다.
    /// </summary>
    public UpdateViewModel? Update { get; }

    public event EventHandler<WindowMode>? WindowModeRequested;

    /// <summary>
    /// 상담원이 지금 알아채야 하는 것이 생겼다. 창이 다른 프로그램에 가려져 있으면 이것이
    /// 유일한 창구다. <b>어떻게</b> 알릴지는 조립 지점이 정한다 — 화면은 무엇을 적을지만 안다.
    /// </summary>
    public event EventHandler<Alert>? AttentionRequested;

    /// <summary>
    /// 읽기 전용 화면을 서브 창으로 띄워 달라. 창을 만드는 일은 조립 지점이 한다 —
    /// 이 코드베이스에서 창을 만지는 곳은 <c>MainWindow</c> 하나뿐이다.
    /// </summary>
    public event EventHandler<InfoWindow>? InfoWindowRequested;

    /// <summary>서브 창 안쪽 닫기 버튼을 눌렀거나, 화면이 스스로 닫혔다.</summary>
    public event EventHandler<InfoWindow>? InfoWindowDismissed;

    public RelayCommand AnswerCommand { get; }

    public RelayCommand HangupCommand { get; }

    public RelayCommand ToggleMuteCommand { get; }

    public RelayCommand ToggleHoldCommand { get; }

    public RelayCommand ToggleAvailabilityCommand { get; }

    public RelayCommand SignOutCommand { get; }

    public RelayCommand OpenSettingsCommand { get; }

    /// <summary>설정 화면을 여는 것은 조립 지점이 한다. 화면은 요청만 한다.</summary>
    public event EventHandler? SettingsRequested;

    /// <summary>화면 뒤에서 도는 작업. 테스트에서만 쓴다.</summary>
    public Task PendingWork => _pendingWork;

    /// <summary>
    /// 갈래 화면들이 내보내는 뒷작업도 같은 자리로 모은다. 테스트가 기다릴 곳이 하나여야 한다.
    /// </summary>
    private void Track(Task work) => _pendingWork = work;

    private void Notify(string? message) => NoticeMessage = message;

    /// <summary>
    /// 화면 밖(트레이·핫키 같은 조립 지점)에서 올라온 알림. 상담원이 알림을 찾는 자리는
    /// 하나여야 한다 — 조립 지점이 자기만 아는 곳에 적으면 그것은 아무도 못 본다.
    /// </summary>
    public void ShowNotice(string message) => Notify(message);

    /// <summary>
    /// 전역 핫키가 부른 동작. <b>화면의 버튼과 같은 것을 누른다</b> — 제안이 떠 있으면 받기·끊기는
    /// 그 제안에 대한 수락·거절이고, 그것이 지금 화면에 뜬 두 버튼이다. 다르게 동작하면
    /// 눈으로 본 것과 손으로 누른 결과가 어긋난다.
    ///
    /// 누를 수 없는 버튼은 핫키로도 못 누른다. 창을 안 보고 누르는 길이라 더욱 그렇다 —
    /// 대기 중에 끊기가 나가면 아무 통화도 없는데 서버에 명령이 간다.
    /// </summary>
    public void Invoke(HotkeyAction action)
    {
        RelayCommand command = action switch
        {
            HotkeyAction.Answer => Offer.HasOffer ? Offer.AcceptOfferCommand : AnswerCommand,
            HotkeyAction.Hangup => Offer.HasOffer ? Offer.RejectOfferCommand : HangupCommand,
            _ => ToggleMuteCommand,
        };

        if (command.CanExecute(null)) command.Execute(null);
    }

    /// <summary>
    /// 훑어 온 진행 중인 통화를 그것을 쓰는 화면들에 나눠 준다. 누가 통화 중인지 판단하는 근거가
    /// 돌려주기와 상담원 목록에서 같아야 한다 — 다르면 같은 사람이 두 화면에서 다르게 보인다.
    /// </summary>
    private void ShareActiveCalls(IReadOnlyList<ActiveCall> calls)
    {
        Transfer.UseActiveCalls(calls);
        Directory.UseActiveCalls(calls);
    }

    /// <summary>
    /// 상담원 목록에서 고른 내선으로 건다. <b>발신 화면을 지나간다</b> — 발신은 PBX 가 이 단말을
    /// 먼저 부르는 방식이라, "우리가 건 전화" 표시를 세우는 곳을 건너뛰면 방금 자기가 건 전화가
    /// 수신 전화로 뜨고 자동 응답도 안 된다.
    /// </summary>
    private void CallExtension(string extension)
    {
        Dial.DialNumber = extension;
        Track(Dial.DialAsync());
    }

    /// <summary>로그아웃을 실제로 수행하는 것은 조립 지점이다. 화면은 요청만 한다.</summary>
    public event EventHandler? SignOutRequested;

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
            ToggleHoldCommand.RaiseCanExecuteChanged();
            Dial.DialCommand.RaiseCanExecuteChanged();
            ToggleAvailabilityCommand.RaiseCanExecuteChanged();
            SignOutCommand.RaiseCanExecuteChanged();
            OpenSettingsCommand.RaiseCanExecuteChanged();
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

    /// <summary>
    /// 고객이 건 곳. 상담원이 받기 전에 가장 먼저 알아야 하는 것이다 —
    /// 인사말과 안내가 지사마다 다르다. 매핑이 없으면 비어 있다.
    /// </summary>
    public string BranchName
    {
        get => _branchName;
        private set
        {
            if (!Set(ref _branchName, value)) return;
            Raise(nameof(CalledLine));
        }
    }

    /// <summary>고객이 누른 번호. 대표번호가 있으면 그쪽을, 없으면 수신번호를 보여 준다.</summary>
    public string CalledNumber
    {
        get => _calledNumber;
        private set
        {
            if (!Set(ref _calledNumber, value)) return;
            Raise(nameof(CalledLine));
        }
    }

    /// <summary>화면에 한 줄로 붙일 형태. 지사가 없으면 번호만 남는다.</summary>
    public string CalledLine => string.IsNullOrEmpty(BranchName)
        ? CalledNumber
        : string.IsNullOrEmpty(CalledNumber) ? BranchName : $"{BranchName} · {CalledNumber}";

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

    /// <summary>
    /// 이 PBX 가 보류를 받아 주는가. feature code 가 없으면 서버가 400 을 던지므로
    /// 버튼을 눌러 보고 실패하는 대신 <b>버튼 자체를 만들지 않는다</b>.
    /// </summary>
    public bool CanHold
    {
        get => _canHold;
        private set
        {
            if (!Set(ref _canHold, value)) return;
            ToggleHoldCommand.RaiseCanExecuteChanged();
        }
    }

    /// <summary>
    /// 지금 보류 중인가. 근거는 <b>서버가 보내 준 세션 상태</b> 하나뿐이다 —
    /// 우리가 명령을 보냈다는 사실은 보류가 걸렸다는 뜻이 아니다.
    /// </summary>
    public bool IsOnHold
    {
        get => _isOnHold;
        private set
        {
            if (!Set(ref _isOnHold, value)) return;

            // 기다리던 답이 이것이다. 상태가 실제로 움직였으니 요청은 끝났다.
            ClearHoldRequest();
            Raise(nameof(HoldButtonText));
        }
    }

    /// <summary>명령은 나갔는데 아직 상태 변화를 못 본 상태.</summary>
    public bool IsHoldRequestPending
    {
        get => _holdRequestDeadline is not null;
    }

    /// <summary>
    /// 보류 버튼의 문구. 요청 중이라는 것과 보류가 걸렸다는 것을 다른 말로 적는다 —
    /// 같은 말로 적으면 안 걸린 보류를 걸렸다고 읽게 된다.
    /// </summary>
    public string HoldButtonText => IsHoldRequestPending
        ? (IsOnHold ? "해제 요청 중" : "보류 요청 중")
        : IsOnHold ? "보류 해제" : "보류";

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
        // 순서를 지킨다. 셋 다 뒷작업을 <see cref="PendingWork"/> 한 자리에 밀어 넣으므로,
        // 순서가 바뀌면 같은 Tick 안에서 기다리게 되는 작업이 달라진다.
        Dial.Tick();

        DeskPhone.Tick();
        Waiting.Tick();

        // 협의 전환의 연결·취소도 같은 사정이다 — 답이 없으면 스스로 기다림을 끝낸다.
        Transfer.Tick();

        // 정보 창들은 <b>떠 있을 때만</b> 조회한다. 닫혀 있으면 여기서 그대로 돌아간다.
        Queues.Tick();
        Directory.Tick();

        // 새 버전 확인도 주기가 됐을 때만 나간다. 안 됐으면 그대로 돌아간다.
        Update?.Tick();

        // PBX 가 feature code 를 안 먹으면 아무 이벤트도 오지 않는다. 서버는 그것을 모른다.
        // 기다림을 스스로 끝내지 않으면 버튼이 잠긴 채 남아 다시 시도할 방법이 없어진다.
        if (_holdRequestDeadline is { } due && _now() >= due)
        {
            ClearHoldRequest();
            NoticeMessage = "보류 요청에 PBX 가 응답하지 않았다.";
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
                CustomerName = pop.Customer.CustomerName?.Trim() ?? string.Empty;
                break;

            // 아래 둘은 <b>본문을 읽지 않는다</b>. 받는 쪽 메서드에 인자가 없는 것이 그 약속이다 —
            // 큐 현황은 WS 와 REST 의 필드명이 다르고, 공지 수정 이벤트는 관리자가 보낸 필드만
            // 실려 와 매번 구성이 다르다. 두 벌로 파싱하면 한쪽이 바뀔 때 다른 쪽이 조용히 어긋난다.
            case QueueSummaryUpdatedEvent:
                Queues.OnSummaryPushed();
                break;

            case AnnouncementPushedEvent:
                Announcements.OnPushed();
                break;
        }
    }

    public void OnConnectionStateChanged(CtiConnectionState state)
        => IsConnected = state == CtiConnectionState.Connected;

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
    /// 보류를 걸거나 푼다. <b>화면은 여기서 바뀌지 않는다</b> — 서버는 feature code 를 DTMF 로
    /// 흘려보낼 뿐이고 PBX 가 그것을 먹었는지 모른다. 지금 "보류 중" 으로 바꾸면 안 걸린 보류를
    /// 걸렸다고 말하게 되고, 상담원은 고객이 듣고 있는 줄 모른 채 옆 사람과 이야기한다.
    /// 화면은 뒤따라오는 <c>HOLD</c> 세션 상태를 보고서야 바뀐다.
    /// </summary>
    public async Task ToggleHoldAsync(CancellationToken ct = default)
    {
        var callId = CurrentCallId();
        if (callId is null || !CanHold) return;

        var resuming = IsOnHold;
        _holdRequestDeadline = _now().AddSeconds(HoldRequestTimeoutSeconds);
        Raise(nameof(IsHoldRequestPending));
        Raise(nameof(HoldButtonText));
        ToggleHoldCommand.RaiseCanExecuteChanged();
        Note($"{(resuming ? "보류 해제" : "보류")} 요청 {callId}");

        var ack = await Send(() => resuming
            ? _server.ResumeAsync(callId, ct)
            : _server.HoldAsync(callId, ct));

        // 접수 자체가 안 됐으면 기다릴 이유가 없다. 사유는 Send 가 이미 화면에 올렸다.
        if (ack is null) ClearHoldRequest();
    }

    /// <summary>기다림을 끝낸다. 보류 상태 자체는 서버가 정하므로 여기서 건드리지 않는다.</summary>
    private void ClearHoldRequest()
    {
        if (_holdRequestDeadline is null) return;

        _holdRequestDeadline = null;
        Raise(nameof(IsHoldRequestPending));
        Raise(nameof(HoldButtonText));
        ToggleHoldCommand.RaiseCanExecuteChanged();
    }

    /// <summary>
    /// 로그인 직후 한 번. 내선 목록과 발신번호를 받아 <b>나눠 준다</b>.
    /// 같은 내선 목록을 세 곳이 쓰므로(돌려줄 대상·내선 판별·실기기 등록 확인) 한 번만 물어본다.
    /// 실패해도 앱은 그대로 돈다 — 발신만 못 하고 수신·통화는 영향이 없다.
    /// </summary>
    public async Task LoadDialSetupAsync(CancellationToken ct = default)
    {
        var directory = await Send(() => _server.GetAgentDirectoryAsync(ct));
        if (directory is not null)
        {
            Transfer.UseDirectory(directory);
            Dial.UseDirectory(directory);
            DeskPhone.ApplyDirectory(directory);
        }

        Waiting.StartLooking();

        await Dial.LoadCallerIdsAsync(ct);
        await LoadCallControlCapabilitiesAsync(ct);
    }

    /// <summary>
    /// 이 PBX 가 보류를 받아 주는지 로그인 직후에 한 번 물어본다. 통화마다 바뀌는 값이 아니다.
    /// <b>조용히</b> 실패한다 — 못 물어봤으면 버튼을 안 보이는 쪽으로 두면 되고,
    /// 로그인 직후 화면에 오류를 띄울 일이 아니다.
    /// </summary>
    private async Task LoadCallControlCapabilitiesAsync(CancellationToken ct)
    {
        try
        {
            CanHold = (await _server.GetCallControlCapabilitiesAsync(ct)).HoldEnabled;
        }
        catch (Exception ex) when (ex is CtiServerException or HttpRequestException or TaskCanceledException)
        {
            CanHold = false;
        }
    }

    /// <summary>
    /// 발신 한 통이 어디까지 갔는지 남긴다. "전화가 안 걸린다" 는 신고가 들어왔을 때
    /// 화면 캡처만으로는 알 수 없는 것 — 요청은 나갔는지, PBX 가 되걸었는지 — 을 이걸로 가른다.
    /// </summary>
    public event EventHandler<string>? Diagnostic;

    private void Note(string message) => Diagnostic?.Invoke(this, message);

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

        // 고객명은 모르는 경우가 더 많다. "알 수 없음" 을 크게 띄우면 화면의 가장 좋은 자리를
        // 아무 정보도 없는 문구가 차지한다. 없으면 비운다.
        CustomerName = server?.Customer?.CustomerName?.Trim() ?? string.Empty;

        BranchName = server?.BranchName?.Trim() ?? string.Empty;
        CalledNumber = PhoneNumberFormat.ForDisplay(
            server?.RepresentativeNumber ?? server?.DidNumber ?? server?.Dnis);

        // 내선 발신은 서버가 direction 을 outbound 로 남기지 않아 세션의 번호가 우리 내선으로 온다.
        // 우리가 건 번호를 알고 있으면 그쪽이 맞다.
        // 발신번호 표시제한이면 번호 자체가 없다. 빈 자리를 두느니 그 사실을 적는다.
        var shown = server is null
            ? string.Empty
            : PhoneNumberFormat.ForDisplay(Dial.DialedNumber ?? server.Ani);
        PhoneNumber = server is not null && shown.Length == 0 ? "번호 없음" : shown;

        // 서버가 실제 음소거 상태를 알려주면 그 값을 따른다.
        if (server?.IsMuted is { } muted) IsMuted = muted;

        // 보류 여부의 근거는 이 상태뿐이다. 우리가 명령을 보냈는지는 여기에 끼어들지 않는다.
        IsOnHold = server?.SessionStatus == SessionStatus.Hold;
        Keypad.OnCallChanged();

        // 통화가 끝난 뒤에 메모를 저장하므로, 어느 통화였는지 지금 붙잡아 둔다.
        if (server is not null && WindowMode != WindowMode.Idle) _memoCallId = server.CallId;

        if (WindowMode == WindowMode.Idle)
        {
            IsMuted = false;

            // 통화가 없어졌으면 답을 기다릴 대상도 없다.
            ClearHoldRequest();
            CallDurationText = "00:00";
            Dial.ClearOutboundMark();
            _ = FileMemoAsync();
        }
        else
        {
            // 통화가 잡혔다. 발신 중 표시는 끝나고, 당겨받을 목록도 비운다.
            Dial.StopDialing("서버가 통화를 알려줬다");
            Waiting.Clear();
            Tick();
        }
    }

    /// <summary>
    /// 서버 명령을 보내고 실패는 화면 알림으로 돌린다. 명령 하나가 실패했다고 앱이 죽으면 안 된다.
    /// </summary>
    private Task<T?> Send<T>(Func<Task<T>> command) where T : class
        => ServerCall.SendAsync(command, Notify);
}
