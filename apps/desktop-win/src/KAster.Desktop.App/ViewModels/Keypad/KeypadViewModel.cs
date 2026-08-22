using KAster.Desktop.Core.Server;
using KAster.Desktop.Softphone;

namespace KAster.Desktop.App.ViewModels;

/// <summary>
/// 통화 중 키패드. ARS 내선 입력이나 인증번호에 쓴다.
///
/// 키가 나가는 길이 모드마다 다르다. 소프트폰은 <b>자기 SIP 다이얼로그로 직접</b> 보내고,
/// 실기기는 우리에게 채널이 없어 <b>서버가 상담원 leg 에 넣어 준다</b>.
/// </summary>
public sealed class KeypadViewModel : ObservableObject
{
    /// <summary>
    /// 한 요청에 실을 수 있는 자릿수. 서버가 같은 값으로 막는다 (<c>SendDtmfDto.DTMF_MAX_DIGITS</c>) —
    /// 한 자리마다 AMI 액션이 하나씩 나가 그동안 채널이 톤 재생에 붙잡히기 때문이다.
    /// 넘겨서 400 을 받느니 화면에서 말해 주는 편이 낫다.
    /// </summary>
    public const int MaxDigits = 32;

    private readonly ISoftphoneControl _phone;
    private readonly CtiServerClient _server;
    private readonly Action<string?> _notify;
    private readonly Action<Task> _track;

    /// <summary>
    /// 소프트폰으로 통화하는지. 실기기 모드에서는 우리가 열어 둔 SIP 다이얼로그가 없어
    /// 서버를 거쳐야 상대에게 들린다.
    /// </summary>
    private readonly bool _useSoftphone;

    /// <summary>지금 통화. 실기기 경로는 이 값 없이는 보낼 곳이 없다.</summary>
    private readonly Func<string?> _currentCallId;

    private bool _isKeypadOpen;
    private string _enteredDigits = string.Empty;

    /// <summary>키패드를 비운 기준이 되는 통화. 같은 통화의 갱신으로는 비우지 않는다.</summary>
    private string? _keypadCallId;

    public KeypadViewModel(
        ISoftphoneControl phone,
        CtiServerClient server,
        bool useSoftphone,
        Func<string?> currentCallId,
        Action<string?> notify,
        Action<Task> track)
    {
        _phone = phone;
        _server = server;
        _useSoftphone = useSoftphone;
        _currentCallId = currentCallId;
        _notify = notify;
        _track = track;

        ToggleKeypadCommand = new RelayCommand(() => IsKeypadOpen = !IsKeypadOpen);
        SendDigitCommand = new RelayCommand<string>(key => _track(SendDigitAsync(key)));
    }

    /// <summary>
    /// 통화 중 키패드를 보여 줄 것인가. 실기기 모드에서는 서버로 보낼 통화가 있어야 뜻이 있다 —
    /// 통화가 없으면 눌러도 아무 데도 가지 않는데 상담원은 눌렀다고 믿는다.
    /// </summary>
    public bool ShowsKeypad => _useSoftphone || _currentCallId() is not null;

    /// <summary>키패드가 열려 있는가. 메모와 같은 자리를 쓰므로 둘 중 하나만 보인다.</summary>
    public bool IsKeypadOpen
    {
        get => _isKeypadOpen;
        private set => Set(ref _isKeypadOpen, value);
    }

    /// <summary>
    /// 이 통화에서 <b>실제로 나간</b> 자리. ARS 안에서는 무엇이 들어갔는지가 다음 행동을 정한다.
    /// 화면이 넘치지 않도록 뒤쪽 <see cref="MaxDigits"/> 자리만 남긴다.
    /// </summary>
    public string EnteredDigits
    {
        get => _enteredDigits;
        private set => Set(ref _enteredDigits, value);
    }

    public RelayCommand ToggleKeypadCommand { get; }

    public RelayCommand<string> SendDigitCommand { get; }

    /// <summary>
    /// 통화가 바뀌었다. 앞 통화에서 누른 것이 다음 통화 화면에 남아 있으면 상담원은
    /// 지금 통화에서 넣은 값으로 읽는다. 같은 통화의 갱신으로는 건드리지 않는다 —
    /// 누르는 도중에 키패드가 닫히면 안 된다.
    /// </summary>
    public void OnCallChanged()
    {
        var callId = _currentCallId();
        Raise(nameof(ShowsKeypad));

        if (string.Equals(callId, _keypadCallId, StringComparison.Ordinal)) return;

        _keypadCallId = callId;
        IsKeypadOpen = false;
        EnteredDigits = string.Empty;
    }

    /// <summary>통화 중에 키를 보낸다. ARS 내선 입력이나 인증번호에 쓴다.</summary>
    public async Task SendDigitAsync(string? key, CancellationToken ct = default)
    {
        var digits = key?.Trim();
        if (string.IsNullOrEmpty(digits)) return;

        if (digits.Length > MaxDigits)
        {
            _notify($"한 번에 보낼 수 있는 것은 {MaxDigits}자리까지다.");
            return;
        }

        if (_useSoftphone)
        {
            // 소프트폰은 우리가 다이얼로그를 들고 있다. 서버를 거치면 왕복만 늘고 늦는다.
            foreach (var digit in digits) await _phone.SendDigitAsync(digit);
            Remember(digits);
            return;
        }

        // 실기기는 우리에게 채널이 없다. 서버가 상담원 leg 에 PlayDTMF 로 넣는다.
        var callId = _currentCallId();
        if (callId is null) return;

        var ack = await ServerCall.SendAsync(() => _server.SendDtmfAsync(callId, digits, ct), _notify);

        // 나간 것만 쌓는다. 거부된 자리를 보낸 것처럼 보여 주면 상담원은 다시 누르지 않는다.
        if (ack is not null) Remember(digits);
    }

    private void Remember(string digits)
    {
        var shown = EnteredDigits + digits;
        EnteredDigits = shown.Length > MaxDigits ? shown[^MaxDigits..] : shown;
    }
}
