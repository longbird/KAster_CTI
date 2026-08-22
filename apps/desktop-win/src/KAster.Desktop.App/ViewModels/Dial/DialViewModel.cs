using KAster.Desktop.App.Services;
using KAster.Desktop.Core.Contracts;
using KAster.Desktop.Core.Server;
using KAster.Desktop.Core.State;
using KAster.Desktop.Softphone;

namespace KAster.Desktop.App.ViewModels;

/// <summary>
/// 발신. 우리가 상대에게 직접 INVITE 를 보내지 않는다 — 서버에 부탁하면 PBX 가 <b>이 단말로</b> 전화를 걸고,
/// 받으면 그 다음에 상대에게 연결한다. 기존 앱과 같은 흐름이라 통화 기록과 녹취가 한 갈래로 남는다.
///
/// "우리가 건 전화인가" 의 주인은 여기다 (<see cref="IsOutboundCall"/>). 통화 화면도 이 값을 읽지만
/// 쓰지는 않는다 — 두 곳에서 쓰면 어느 쪽이 마지막에 이겼는지 알 수 없게 된다.
/// </summary>
public sealed class DialViewModel : ObservableObject
{
    private readonly CallStateStore _store;
    private readonly CtiServerClient _server;
    private readonly ISoftphoneControl _phone;
    private readonly Func<DateTimeOffset> _now;
    private readonly Action<string?> _notify;
    private readonly Action<string> _note;

    /// <summary>통화가 걸려 있지 않은 상태. 발신은 이때만 연다.</summary>
    private readonly Func<bool> _isFree;

    private string _dialNumber = string.Empty;
    private IReadOnlyList<string> _callerIds = Array.Empty<string>();
    private string? _selectedCallerId;
    private bool _isDialing;
    private string _dialingNumber = string.Empty;

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

    /// <summary>
    /// 방금 <see cref="Send{T}"/> 가 올린 알림. 발신이 거부됐을 때 그 사유를 진단 기록에 같이 남기려고 붙든다.
    /// 알림 자체의 주인은 통화 화면이라 되읽을 수 없다.
    /// </summary>
    private string? _lastNotice;

    /// <summary>
    /// 현장 설정. <b>쓸 때마다 읽는다</b> — 설정 화면에서 바꾼 값이 다시 로그인해야 먹으면
    /// 상담원은 자기가 고친 값이 안 쓰이는 줄 안다.
    /// </summary>
    private readonly Func<CallPreferences> _preferences;

    /// <summary>
    /// 걸기를 누른 뒤 되걸려 오는 전화를 우리 것으로 보는 기간.
    /// PBX 가 이 단말을 되부르기까지 걸리는 시간이 트렁크마다 다르다.
    /// </summary>
    private int SelfAnswerWindowSeconds => _preferences().Sane().SelfAnswerWindowSeconds;

    public DialViewModel(
        CallStateStore store,
        CtiServerClient server,
        ISoftphoneControl phone,
        Func<DateTimeOffset> now,
        Action<string?> notify,
        Action<string> note,
        Func<bool> isFree,
        Func<CallPreferences>? preferences = null)
    {
        _preferences = preferences ?? (static () => new CallPreferences());

        _store = store;
        _server = server;
        _phone = phone;
        _now = now;
        _notify = notify;
        _note = note;
        _isFree = isFree;

        DialCommand = new RelayCommand(() => _ = DialAsync(), () => _isFree() && CleanNumber(DialNumber).Length > 0);
    }

    /// <summary>
    /// "우리가 건 전화" 표시가 바뀌었다. 받기 버튼을 열고 닫는 것은 통화 화면의 몫이라 알려만 준다.
    /// </summary>
    public event EventHandler? OutboundMarkChanged;

    /// <summary>자동 응답이 예외로 끝난 경우. 조립 지점이 파일로 남긴다.</summary>
    public event EventHandler<Exception>? SelfAnswerFailed;

    public RelayCommand DialCommand { get; }

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

    /// <summary>
    /// 우리가 건 전화인지. 발신은 PBX 가 우리 단말을 먼저 부르므로 수신 INVITE 로 들어오는데,
    /// 그걸 "수신 전화" 라고 띄우면 방금 자기가 건 전화를 받아야 하는 줄 알고 멈칫한다.
    /// </summary>
    public bool IsOutboundCall => _dialedNumber is not null;

    /// <summary>
    /// 우리가 건 번호. 내선 발신은 서버가 direction 을 outbound 로 남기지 않아 세션의 번호가
    /// 우리 내선으로 오는데, 그때 화면에 띄울 번호는 이쪽이다.
    /// </summary>
    public string? DialedNumber => _dialedNumber;

    /// <summary>
    /// 로그인 직후에 받아 둔 내선 목록. 건 번호가 내선인지 가르는 데만 쓴다.
    /// </summary>
    public void UseDirectory(IReadOnlyList<AgentDirectoryEntry> directory)
        => _knownExtensions = directory
            .Select(entry => entry.Extension?.Trim())
            .Where(extension => !string.IsNullOrEmpty(extension))
            .ToHashSet(StringComparer.Ordinal)!;

    /// <summary>
    /// 발신번호를 받아 둔다. 실패해도 앱은 그대로 돈다 — 발신만 못 하고 수신·통화는 영향이 없다.
    /// </summary>
    public async Task LoadCallerIdsAsync(CancellationToken ct = default)
    {
        var capabilities = await Send(() => _server.GetCallCapabilitiesAsync(ct));
        if (capabilities is null) return;

        CallerIds = capabilities.OutboundDialOptions.AllowedCallerIds;
        SelectedCallerId = capabilities.OutboundDialOptions.DefaultCallerId ?? CallerIds.FirstOrDefault();
        Raise(nameof(ShowsCallerIdPicker));
    }

    /// <summary>
    /// 발신. 내선과 외부는 서버에서 아예 다른 경로다. 외부 경로에 내선을 넣으면
    /// 번호 형식 검사에 걸려 거부된다.
    /// </summary>
    public async Task DialAsync(CancellationToken ct = default)
    {
        var number = CleanNumber(DialNumber);
        if (number.Length == 0) return;

        var internalCall = IsExtension(number);
        _note($"발신 요청 {number} ({(internalCall ? "내선" : "외부")})");

        // PBX 는 서버의 HTTP 응답보다 <b>먼저</b> 우리를 부를 수 있다
        // (실측 2026-08-21: 외부 발신에서 INVITE 가 ack 보다 1ms 빨랐다).
        // 그래서 요청을 보내기 전에 창을 연다. 응답을 기다렸다 열면 그 한 통을 놓친다.
        SetDialedNumber(number);
        // 기한과 저장소가 같은 값을 봐야 한다. 사이에 설정이 바뀌면 둘이 어긋난다.
        var window = SelfAnswerWindowSeconds;
        _selfAnswerUntil = _now().AddSeconds(window);

        // 곧 서버가 만들 통화는 아직 아무에게도 배정돼 있지 않다. 그래도 우리 것이다.
        _store.ExpectOutboundCall(TimeSpan.FromSeconds(window));
        DialingNumber = PhoneNumberFormat.ForDisplay(number);
        IsDialing = true;

        var ack = internalCall
            ? await Send(() => _server.OriginateInternalAsync(number, ct))
            : await Send(() => _server.OriginateAsync(number, SelectedCallerId, ct));

        // 거절당했으면 창을 즉시 닫는다. 열어 둔 채로 두면 남의 전화를 말없이 받는다.
        // 번호는 지우지 않는다 — 고쳐서 다시 걸 수 있어야 한다.
        if (ack is null)
        {
            _note($"발신 거부 {number}: {_lastNotice}");
            _selfAnswerUntil = null;
            SetDialedNumber(null);
            StopDialing("서버가 거부했다");
            return;
        }

        _note($"발신 접수 {number}");
        DialNumber = string.Empty;
    }

    /// <summary>
    /// 소프트폰이 알려주는 회선 상태. 우리가 방금 건 전화라면 묻지 않고 바로 받는다.
    /// UI 스레드에서 불러야 한다 — 창을 만지는 경로로 이어진다.
    /// </summary>
    public void OnSoftphoneCallStatusChanged(SoftphoneCallStatus status)
    {
        _note($"소프트폰 회선 {status.State} (자동응답 대기={IsSelfAnswering})");
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
            SetDialedNumber(null);
            StopDialing("소프트폰이 유휴로 돌아갔다");
        }
    }

    /// <summary>
    /// 1초마다 불린다. PBX 가 되걸어 주지 않으면 아무 일도 일어나지 않는데, 조용히 두면
    /// 상담원은 "대기 중" 화면을 보며 전화가 걸린 줄 안다.
    /// </summary>
    public void Tick()
    {
        if (!IsDialing || IsSelfAnswering) return;

        _notify($"{DialingNumber} 발신 요청은 접수됐지만 전화가 오지 않았다. 다시 걸어 달라.");
        _selfAnswerUntil = null;
        SetDialedNumber(null);
        StopDialing("기한 안에 전화가 오지 않았다");
    }

    /// <summary>서버가 통화를 알려줬거나 통화가 끝났다. 발신 중 표시를 내린다.</summary>
    public void StopDialing(string why)
    {
        if (IsDialing) _note($"발신 중 해제: {why}");
        IsDialing = false;
        DialingNumber = string.Empty;
    }

    /// <summary>통화가 끝났다. 다음 수신 전화는 다시 받을 수 있어야 한다.</summary>
    public void ClearOutboundMark() => SetDialedNumber(null);

    private bool IsSelfAnswering => _selfAnswerUntil is { } until && _now() <= until;

    /// <summary>
    /// 스스로 받기. 실패를 삼키지 않는다 — 조용히 실패하면 상담원은 왜 안 받아지는지 알 수 없고,
    /// 화면은 계속 "받기"를 띄운 채 멈춰 있게 된다.
    /// </summary>
    private async Task SelfAnswerAsync()
    {
        try
        {
            if (await _phone.AnswerAsync()) return;
            _notify("건 전화를 자동으로 받지 못했다. 받기를 눌러 달라.");
        }
        catch (Exception ex)
        {
            _notify($"자동 응답 실패: {ex.Message}");
            SelfAnswerFailed?.Invoke(this, ex);
        }
    }

    private void SetDialedNumber(string? number)
    {
        if (_dialedNumber == number) return;

        _dialedNumber = number;
        Raise(nameof(IsOutboundCall));
        OutboundMarkChanged?.Invoke(this, EventArgs.Empty);
    }

    /// <summary>
    /// 내선인지 가른다. <b>자릿수로 짐작하지 않는다</b> — 119·112 는 세 자리라 내선처럼 보이지만
    /// 사내로 빠지면 안 되는 번호다. 실제 상담원 내선 목록에 있는 번호만 내선으로 본다.
    /// </summary>
    private bool IsExtension(string number) => _knownExtensions.Contains(number);

    /// <summary>사람이 치는 공백·하이픈·괄호를 떼어 낸다. 서버는 숫자와 <c>*#+</c> 만 받는다.</summary>
    private static string CleanNumber(string value)
        => new(value.Where(c => char.IsAsciiDigit(c) || c is '*' or '#' or '+').ToArray());

    private Task<T?> Send<T>(Func<Task<T>> command) where T : class
        => ServerCall.SendAsync(command, message =>
        {
            _lastNotice = message;
            _notify(message);
        });
}
