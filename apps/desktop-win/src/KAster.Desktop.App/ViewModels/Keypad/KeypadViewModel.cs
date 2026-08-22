using KAster.Desktop.Softphone;

namespace KAster.Desktop.App.ViewModels;

/// <summary>
/// 통화 중 키패드. ARS 내선 입력이나 인증번호에 쓴다.
/// </summary>
public sealed class KeypadViewModel : ObservableObject
{
    private readonly ISoftphoneControl _phone;
    private readonly Action<Task> _track;

    /// <summary>
    /// 소프트폰으로 통화하는지. 실기기 모드에서는 전화기의 키패드가 진짜다 —
    /// 화면에 키패드를 띄우면 눌러도 아무 데도 가지 않는데 상담원은 눌렀다고 믿는다.
    /// </summary>
    private readonly bool _useSoftphone;

    private bool _isKeypadOpen;

    public KeypadViewModel(ISoftphoneControl phone, bool useSoftphone, Action<Task> track)
    {
        _phone = phone;
        _useSoftphone = useSoftphone;
        _track = track;

        ToggleKeypadCommand = new RelayCommand(() => IsKeypadOpen = !IsKeypadOpen);
        SendDigitCommand = new RelayCommand<string>(key => _track(SendDigitAsync(key)));
    }

    /// <summary>통화 중 키패드를 보여 줄 것인가.</summary>
    public bool ShowsKeypad => _useSoftphone;

    /// <summary>키패드가 열려 있는가. 메모와 같은 자리를 쓰므로 둘 중 하나만 보인다.</summary>
    public bool IsKeypadOpen
    {
        get => _isKeypadOpen;
        private set => Set(ref _isKeypadOpen, value);
    }

    public RelayCommand ToggleKeypadCommand { get; }

    public RelayCommand<string> SendDigitCommand { get; }

    /// <summary>통화 중에 키를 하나 보낸다. ARS 내선 입력이나 인증번호에 쓴다.</summary>
    public async Task SendDigitAsync(string? key)
    {
        var digit = key?.Trim();
        if (string.IsNullOrEmpty(digit)) return;

        await _phone.SendDigitAsync(digit[0]);
    }
}
