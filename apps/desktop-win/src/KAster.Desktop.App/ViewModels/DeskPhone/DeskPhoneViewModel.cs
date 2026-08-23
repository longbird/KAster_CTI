using System.Net.Http;
using KAster.Desktop.Core.Contracts;
using KAster.Desktop.Core.Server;
using KAster.Desktop.Softphone;

namespace KAster.Desktop.App.ViewModels;

/// <summary>
/// 이 자리의 전화기가 살아 있는가. <b>통화 제어가 아니라 장치 상태다</b> —
/// 통화 화면은 이 값을 읽기만 하고, 창 모양도 여기서 정하지 않는다.
///
/// 전화기가 PBX 에 등록돼 있지 않으면 전화가 한 통도 오지 않는다. <b>서버 연결과 다른 것이다</b> —
/// 웹소켓이 붙어 있어도 SIP 등록이 죽으면 화면만 "연결됨" 이고 전화는 안 온다.
///
/// 등록 상태를 아는 길이 모드마다 다르다. 소프트폰은 <b>우리가 등록하므로</b> 등록 결과가
/// 그대로 올라오고(<see cref="OnRegistrationStatusChanged"/>), 실기기는 우리가 등록하지 않으므로
/// <b>서버에 물어봐야</b> 안다(<see cref="RecheckDeskPhoneAsync"/>). 두 길이 한 상태를 가리키게
/// 모아 둔다 — 나뉘어 있으면 어느 쪽이 화면에 뜬 값인지 알 수 없다.
/// </summary>
public sealed class DeskPhoneViewModel : ObservableObject
{
    private readonly CtiServerClient _server;
    private readonly string _extension;
    private readonly Func<DateTimeOffset> _now;

    /// <summary>
    /// 소프트폰으로 통화하는지. false 면 <b>실기기 모드</b> — 책상 전화기가 소리를 맡고
    /// 이 앱은 통화 제어만 한다. 그때 우리 SIP 등록 상태를 보여 주면 거짓말이 된다.
    /// </summary>
    private readonly bool _useSoftphone;

    /// <summary>서버가 내려준 SIP 계정. 실기기 모드에서는 책상 전화기에 넣을 값이 된다.</summary>
    private readonly SoftphoneConfig? _sipConfig;

    private readonly Action<string> _note;
    private readonly Action<Task> _track;

    private bool _isPhoneRegistered;
    private bool _isSipPasswordVisible;
    private string _phoneStatusText;

    /// <summary>
    /// 다음 실기기 등록 확인 시각. 등록 전에는 자주, 등록된 뒤에는 드물게 본다.
    /// 로그인 직후의 첫 조회가 끝나기 전에는 돌지 않는다.
    /// </summary>
    private DateTimeOffset _nextCheck = DateTimeOffset.MaxValue;

    public DeskPhoneViewModel(
        CtiServerClient server,
        string extension,
        Func<DateTimeOffset> now,
        bool useSoftphone,
        SoftphoneConfig? sipConfig,
        Action<string> note,
        Action<Task> track)
    {
        _server = server;
        _extension = extension;
        _now = now;
        _useSoftphone = useSoftphone;
        _sipConfig = sipConfig;
        _note = note;
        _track = track;
        _phoneStatusText = useSoftphone ? "전화 꺼짐" : "전화기 확인 중";

        ToggleSipPasswordCommand = new RelayCommand(() => IsSipPasswordVisible = !IsSipPasswordVisible);
        RecheckDeskPhoneCommand = new RelayCommand(() => _track(RecheckDeskPhoneAsync()));
    }

    public RelayCommand ToggleSipPasswordCommand { get; }

    public RelayCommand RecheckDeskPhoneCommand { get; }

    /// <summary>
    /// PBX 에 전화기가 등록돼 있는지. <b>서버 연결과 다른 것이다.</b>
    /// 웹소켓이 붙어 있어도 SIP 등록이 죽으면 전화는 한 통도 오지 않는다.
    /// 그때 화면이 "연결됨" 하나만 보여 주면 상담원은 원인을 알 수 없다.
    /// </summary>
    public bool IsPhoneRegistered
    {
        get => _isPhoneRegistered;
        private set
        {
            if (!Set(ref _isPhoneRegistered, value)) return;
            Raise(nameof(ShowsDeskPhoneSetup));
        }
    }

    public string PhoneStatusText
    {
        get => _phoneStatusText;
        private set => Set(ref _phoneStatusText, value);
    }

    // ---- 실기기 등록 안내 ----------------------------------------------------
    //
    // 전화기가 등록돼 있지 않으면 전화를 한 통도 못 받는다. 그 자리에서 필요한 것은
    // "대기 중" 안내가 아니라 전화기에 넣을 값이다.

    /// <summary>실기기 모드인데 아직 등록이 안 됐고, 넣을 값을 서버가 내려준 경우.</summary>
    public bool ShowsDeskPhoneSetup
        => !_useSoftphone && !IsPhoneRegistered && _sipConfig is not null && SipServerAddress.Length > 0;

    public string SipServerAddress => _sipConfig?.SipServer?.Trim() ?? string.Empty;

    public string SipUsername
    {
        get
        {
            var name = _sipConfig?.AuthorizationUsername?.Trim();
            return string.IsNullOrEmpty(name) ? _extension : name;
        }
    }

    /// <summary>전화기의 "도메인" 또는 "SIP 영역" 칸에 넣는 값. <c>sip:1001@pbx.local</c> 의 뒷부분이다.</summary>
    public string SipDomain
    {
        get
        {
            var uri = _sipConfig?.SipUri;
            if (string.IsNullOrWhiteSpace(uri)) return string.Empty;

            var at = uri.IndexOf('@');
            return at < 0 ? string.Empty : uri[(at + 1)..].Trim();
        }
    }

    public string SipTransport => (_sipConfig?.Transport ?? "udp").Trim().ToUpperInvariant();

    /// <summary>
    /// 비밀번호는 기본으로 가린다. 상담원 자리 화면은 지나가는 사람에게 그대로 보인다.
    /// 전화기에 넣을 때만 펼친다.
    /// </summary>
    public bool IsSipPasswordVisible
    {
        get => _isSipPasswordVisible;
        private set
        {
            if (!Set(ref _isSipPasswordVisible, value)) return;
            Raise(nameof(SipPasswordDisplay));
        }
    }

    public string SipPasswordDisplay
        => IsSipPasswordVisible ? _sipConfig?.AuthorizationPassword ?? string.Empty : "••••••••";

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

    /// <summary>
    /// 소프트폰을 아예 켜지 못했다. <b>등록 실패와 다르다</b> — 등록을 시도조차 못 한 것이고,
    /// 사유는 서버가 내려준 설정에 있다. 이 말을 안 하면 화면에는 "전화 꺼짐" 만 남아
    /// 상담원은 자기가 뭘 잘못했는지 찾다가 끝난다.
    /// </summary>
    public void OnSoftphoneUnavailable(string reason)
    {
        // 실기기 자리에서는 우리 소프트폰을 안 켜는 것이 정상이다. 올리면 거짓말이 된다.
        if (!_useSoftphone) return;

        IsPhoneRegistered = false;
        PhoneStatusText = $"전화 못 켬: {reason}";
    }

    /// <summary>1초마다 불린다. 상담원이 전화기에 값을 넣는 동안 화면이 그대로면, 등록이 끝났는데도 뭘 잘못한 줄 안다.</summary>
    public void Tick()
    {
        if (_useSoftphone || _now() < _nextCheck) return;

        // 응답이 늦어도 매 초 다시 나가지 않도록 먼저 미뤄 둔다.
        _nextCheck = _now().AddSeconds(5);
        _track(RecheckDeskPhoneAsync());
    }

    /// <summary>
    /// 등록 상태를 다시 확인한다. <b>조용히</b> 실패한다 — 주기 확인이 실패했다고
    /// 화면에 오류를 계속 띄우면 통화 알림이 묻힌다.
    /// </summary>
    public async Task RecheckDeskPhoneAsync(CancellationToken ct = default)
    {
        if (_useSoftphone) return;

        try
        {
            ApplyDirectory(await _server.GetAgentDirectoryAsync(ct));
        }
        catch (Exception ex) when (ex is CtiServerException or HttpRequestException or TaskCanceledException)
        {
            // 다음 차례에 다시 본다.
        }
    }

    /// <summary>
    /// 실기기 모드에서 내 내선의 전화기가 PBX 에 등록돼 있는지 확인해 화면에 올린다.
    /// 등록돼 있지 않으면 전화가 한 통도 오지 않는다 — 로그인 직후에 말해 줘야 한다.
    ///
    /// 내선 목록은 통화 화면이 로그인 직후에 한 번 받아 나눠 준다. 여기서 또 물어보지 않는다.
    /// </summary>
    public void ApplyDirectory(IReadOnlyList<AgentDirectoryEntry> directory)
    {
        if (_useSoftphone) return;

        var mine = directory.FirstOrDefault(entry =>
            string.Equals(entry.Extension?.Trim(), _extension, StringComparison.Ordinal));

        if (mine is null)
        {
            IsPhoneRegistered = false;
            PhoneStatusText = $"내선 {_extension} 을 찾을 수 없다";
            ScheduleNextCheck();
            return;
        }

        IsPhoneRegistered = mine.SipRegistration?.Registered ?? false;
        ScheduleNextCheck();

        PhoneStatusText = IsPhoneRegistered
            ? "전화기 준비됨"
            : $"전화기가 등록되지 않았다 ({mine.SipRegistration?.RegistrationStatus ?? "UNREGISTERED"})";
        _note($"실기기 등록 확인 내선={_extension} 등록={IsPhoneRegistered}");
    }

    /// <summary>
    /// 등록 전에는 5초, 등록된 뒤에는 30초. 값을 넣는 동안에는 바로 반응해야 하고,
    /// 붙은 뒤에는 죽는 것만 알면 된다.
    /// </summary>
    private void ScheduleNextCheck()
        => _nextCheck = _now().AddSeconds(IsPhoneRegistered ? 30 : 5);
}
