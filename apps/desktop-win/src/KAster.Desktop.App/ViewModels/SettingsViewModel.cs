using System.Globalization;
using KAster.Desktop.App.Services;
using KAster.Desktop.Core.Storage;
using KAster.Desktop.Softphone.Audio;

namespace KAster.Desktop.App.ViewModels;

/// <summary>
/// 목록에 넣을 장치 한 줄. <see cref="Id"/> 가 null 이면 "시스템 기본" 항목이다 —
/// 고르지 않은 상태를 빈칸이 아니라 뜻이 있는 선택지로 보여 준다.
/// </summary>
public sealed record AudioDeviceChoice(string? Id, string Name)
{
    public override string ToString() => Name;
}

/// <summary>
/// 설정 화면. 서버 주소 · 오디오 장치 · 전역 핫키 · 통화 동작 · 이 앱 자체(버전·업데이트·기록).
///
/// <b>구역마다 열고 닫히는 조건이 다르다.</b> 로그인 전에도 이 화면이 뜨는데(서버 주소를 고쳐야
/// 로그인이 되므로) 그때는 업데이트를 물어볼 서버가 없고, 실기기 모드에는 우리 오디오가 없다.
/// 없는 것은 <b>탭째로 감춘다</b> — 누를 수 없는 것을 보여 주면 상담원은 고장 난 줄 안다.
///
/// 창에 스크롤을 만들지 않기 위해 항목이 늘어난 만큼 탭으로 나눴다.
/// </summary>
public sealed class SettingsViewModel : ObservableObject
{
    private const string DefaultEntryName = "시스템 기본";

    private readonly ISettingsStore<AppSettings> _settings;
    private readonly ISettingsStore<AudioDeviceSelection> _devices;
    private readonly ISettingsStore<HotkeySettings>? _hotkeys;
    private readonly ISettingsStore<CallPreferences>? _callPreferences;
    private readonly Func<HotkeySettings, IReadOnlyList<string>>? _applyHotkeys;
    private readonly Func<string?>? _repairProtocol;
    private readonly string _originalUrl;

    private string _serverBaseUrl;
    private string? _serverUrlError;
    private AudioDeviceChoice? _selectedCapture;
    private AudioDeviceChoice? _selectedCallRender;
    private AudioDeviceChoice? _selectedRingRender;

    private string _answerHotkey = string.Empty;
    private string _hangupHotkey = string.Empty;
    private string _muteHotkey = string.Empty;
    private string? _hotkeyError;
    private string? _hotkeyNotice;

    private string _selfAnswerSeconds = string.Empty;
    private string _pbxWaitSeconds = string.Empty;
    private string? _callSettingsError;

    private string _protocolStatusText = string.Empty;

    /// <param name="applyHotkeys">
    /// 조합을 실제로 윈도우에 건다. 되돌려주는 것은 <b>상담원에게 말해야 하는 실패</b>다 —
    /// 뷰모델이 P/Invoke 를 부르면 테스트가 상담원 PC 의 핫키를 가로챈다.
    /// </param>
    /// <param name="update">로그인 전에는 물어볼 서버가 없어 null 이다.</param>
    /// <param name="repairProtocol">웹 연동 링크를 다시 건다. 실패 사유를 돌려준다.</param>
    public SettingsViewModel(
        ISettingsStore<AppSettings> settings,
        ISettingsStore<AudioDeviceSelection> devices,
        IAudioDeviceEnumerator enumerator,
        bool useSoftphone,
        ISettingsStore<HotkeySettings>? hotkeys = null,
        ISettingsStore<CallPreferences>? callPreferences = null,
        ISettingsStore<TransferHotkeySettings>? transferHotkeys = null,
        Func<HotkeySettings, IReadOnlyList<string>>? applyHotkeys = null,
        UpdateViewModel? update = null,
        bool protocolRegistered = true,
        Func<string?>? repairProtocol = null)
    {
        _settings = settings;
        _devices = devices;
        _hotkeys = hotkeys;
        _callPreferences = callPreferences;
        TransferHotkeys = transferHotkeys is null ? null : new TransferHotkeyEditorViewModel(transferHotkeys);
        _applyHotkeys = applyHotkeys;
        _repairProtocol = repairProtocol;
        Update = update;
        ShowsAudioDevices = useSoftphone;

        _originalUrl = settings.Load().ServerBaseUrl;
        _serverBaseUrl = _originalUrl;

        CaptureDevices = Choices(enumerator, AudioDeviceKind.Capture);
        CallRenderDevices = Choices(enumerator, AudioDeviceKind.Render);
        RingRenderDevices = Choices(enumerator, AudioDeviceKind.Render);

        var chosen = devices.Load();
        _selectedCapture = Match(CaptureDevices, chosen.CaptureDeviceId);
        _selectedCallRender = Match(CallRenderDevices, chosen.CallRenderDeviceId);
        _selectedRingRender = Match(RingRenderDevices, chosen.RingRenderDeviceId);

        if (hotkeys is not null)
        {
            var combos = hotkeys.Load();
            _answerHotkey = combos.Answer;
            _hangupHotkey = combos.Hangup;
            _muteHotkey = combos.ToggleMute;
        }

        if (callPreferences is not null)
        {
            var calls = callPreferences.Load().Sane();
            _selfAnswerSeconds = calls.SelfAnswerWindowSeconds.ToString(CultureInfo.InvariantCulture);
            _pbxWaitSeconds = calls.PbxResponseWaitSeconds.ToString(CultureInfo.InvariantCulture);
        }

        _protocolStatusText = protocolRegistered
            ? "웹에서 넘기는 로그인 링크가 등록됐습니다"
            : "웹에서 넘기는 로그인 링크가 등록되어 있지 않습니다";

        SaveCommand = new RelayCommand(Save, () => CanSave);
        CloseCommand = new RelayCommand(() => Closed?.Invoke(this, EventArgs.Empty));
        OpenLogFolderCommand = new RelayCommand(
            () => FolderRequested?.Invoke(this, AppPaths.Root));
        RepairProtocolCommand = new RelayCommand(RepairProtocol, () => _repairProtocol is not null);
    }

    public event EventHandler? Closed;

    /// <summary>
    /// 이 폴더를 열어 달라. 탐색기를 띄우는 것은 조립 지점이 한다 — 뷰모델이 프로세스를 띄우면
    /// 테스트가 상담원 PC 에서 창을 연다.
    /// </summary>
    public event EventHandler<string>? FolderRequested;

    public RelayCommand SaveCommand { get; }

    public RelayCommand CloseCommand { get; }

    /// <summary>
    /// 진단 로그가 놓인 자리를 연다. 앱이 조용히 멈추면 그 파일이 유일한 단서인데,
    /// 상담원에게 <c>%LOCALAPPDATA%</c> 를 전화로 불러 주는 것은 현장에서 통하지 않는다.
    /// </summary>
    public RelayCommand OpenLogFolderCommand { get; }

    public RelayCommand RepairProtocolCommand { get; }

    /// <summary>새 버전 확인. 로그인 전에는 null 이라 탭이 통째로 없다.</summary>
    public UpdateViewModel? Update { get; }

    public bool ShowsUpdate => Update is not null;

    /// <summary>실기기 모드에는 우리 오디오가 없다. 고를 것을 보여 주면 안 고른 줄 알고 헤맨다.</summary>
    public bool ShowsAudioDevices { get; }

    public bool ShowsHotkeys => _hotkeys is not null;

    /// <summary>통화 중 1~9 편집기. 저장소를 안 넘기면 null 이라 탭이 접힌다.</summary>
    public TransferHotkeyEditorViewModel? TransferHotkeys { get; }

    public bool ShowsTransferHotkeys => TransferHotkeys is not null;

    public bool ShowsCallPreferences => _callPreferences is not null;

    public IReadOnlyList<AudioDeviceChoice> CaptureDevices { get; }

    public IReadOnlyList<AudioDeviceChoice> CallRenderDevices { get; }

    public IReadOnlyList<AudioDeviceChoice> RingRenderDevices { get; }

    public string ServerBaseUrl
    {
        get => _serverBaseUrl;
        set
        {
            if (!Set(ref _serverBaseUrl, value)) return;

            ServerUrlError = Validate(value);
            SaveCommand.RaiseCanExecuteChanged();
            Raise(nameof(ServerUrlChanged));
        }
    }

    /// <summary>주소가 왜 못 쓰는지. null 이면 쓸 수 있다.</summary>
    public string? ServerUrlError
    {
        get => _serverUrlError;
        private set => Set(ref _serverUrlError, value);
    }

    /// <summary>바뀐 주소는 다음 로그인부터 쓰인다. 지금 붙어 있는 연결은 그대로다.</summary>
    public bool ServerUrlChanged
        => !string.Equals(_serverBaseUrl?.Trim(), _originalUrl?.Trim(), StringComparison.Ordinal);

    public string ProtocolStatusText
    {
        get => _protocolStatusText;
        private set => Set(ref _protocolStatusText, value);
    }

    public AudioDeviceChoice? SelectedCapture
    {
        get => _selectedCapture;
        set => Set(ref _selectedCapture, value);
    }

    public AudioDeviceChoice? SelectedCallRender
    {
        get => _selectedCallRender;
        set => Set(ref _selectedCallRender, value);
    }

    public AudioDeviceChoice? SelectedRingRender
    {
        get => _selectedRingRender;
        set => Set(ref _selectedRingRender, value);
    }

    public string AnswerHotkey
    {
        get => _answerHotkey;
        set { if (Set(ref _answerHotkey, value)) OnHotkeyChanged(); }
    }

    public string HangupHotkey
    {
        get => _hangupHotkey;
        set { if (Set(ref _hangupHotkey, value)) OnHotkeyChanged(); }
    }

    public string MuteHotkey
    {
        get => _muteHotkey;
        set { if (Set(ref _muteHotkey, value)) OnHotkeyChanged(); }
    }

    /// <summary>읽을 수 없거나 서로 겹치는 조합. 있으면 저장을 막는다.</summary>
    public string? HotkeyError
    {
        get => _hotkeyError;
        private set => Set(ref _hotkeyError, value);
    }

    /// <summary>
    /// 윈도우가 등록을 거부했다. <b>저장을 누른 뒤에만 채워진다</b> — 한 글자 칠 때마다
    /// 걸었다 내리면 그동안 진짜 핫키가 안 먹는다.
    /// </summary>
    public string? HotkeyNotice
    {
        get => _hotkeyNotice;
        private set => Set(ref _hotkeyNotice, value);
    }

    public string SelfAnswerSeconds
    {
        get => _selfAnswerSeconds;
        set { if (Set(ref _selfAnswerSeconds, value)) OnCallSettingChanged(); }
    }

    public string PbxWaitSeconds
    {
        get => _pbxWaitSeconds;
        set { if (Set(ref _pbxWaitSeconds, value)) OnCallSettingChanged(); }
    }

    public string? CallSettingsError
    {
        get => _callSettingsError;
        private set => Set(ref _callSettingsError, value);
    }

    private bool CanSave => ServerUrlError is null && HotkeyError is null && CallSettingsError is null;

    private void Save()
    {
        if (!CanSave) return;

        _settings.Save(_settings.Load() with { ServerBaseUrl = _serverBaseUrl.Trim() });
        _devices.Save(new AudioDeviceSelection
        {
            CaptureDeviceId = SelectedCapture?.Id,
            CallRenderDeviceId = SelectedCallRender?.Id,
            RingRenderDeviceId = SelectedRingRender?.Id,
        });

        _callPreferences?.Save(ReadCallPreferences().Sane());

        // 전환 대상이 전화번호가 아니면 여기서 멈춘다. 그대로 저장하면 통화 중에 눌렀을 때
        // 아무 데도 안 걸리고, 상담원은 키가 고장 난 줄 안다.
        TransferHotkeys?.Save();
        if (TransferHotkeys?.Error is not null) return;

        // 등록이 거부돼도 적은 것은 저장한다. 안 그러면 고치려고 처음부터 다시 타야 한다.
        var combos = ReadHotkeys();
        _hotkeys?.Save(combos);

        HotkeyNotice = _applyHotkeys is null
            ? null
            : Services.HotkeyNotice.For(_applyHotkeys(combos));

        // 안 먹는 핫키를 남긴 채 창이 닫히면 상담원은 되는 줄 알고 계속 누른다. 그 자리에서 알린다.
        if (HotkeyNotice is not null) return;

        Closed?.Invoke(this, EventArgs.Empty);
    }

    private void RepairProtocol()
    {
        if (_repairProtocol is null) return;

        var failure = _repairProtocol();
        ProtocolStatusText = failure ?? "웹에서 넘기는 로그인 링크가 등록됐습니다";
    }

    private HotkeySettings ReadHotkeys() => new()
    {
        Answer = _answerHotkey.Trim(),
        Hangup = _hangupHotkey.Trim(),
        ToggleMute = _muteHotkey.Trim(),
    };

    private CallPreferences ReadCallPreferences() => new()
    {
        SelfAnswerWindowSeconds = Seconds(_selfAnswerSeconds) ?? new CallPreferences().SelfAnswerWindowSeconds,
        PbxResponseWaitSeconds = Seconds(_pbxWaitSeconds) ?? new CallPreferences().PbxResponseWaitSeconds,
    };

    private void OnHotkeyChanged()
    {
        // 판정은 실제 등록과 같은 계획을 쓴다. 두 벌로 두면 화면이 되는 조합을 안 된다고 말한다.
        HotkeyError = HotkeyPlan.For(ReadHotkeys())
            .Select(assignment => assignment.Error)
            .FirstOrDefault(error => error is not null);

        // 고치는 중에 옛 실패 문구가 남아 있으면 방금 고친 것이 여전히 안 되는 것처럼 보인다.
        HotkeyNotice = null;
        SaveCommand.RaiseCanExecuteChanged();
    }

    private void OnCallSettingChanged()
    {
        CallSettingsError = Range(
                _selfAnswerSeconds,
                CallPreferences.MinSelfAnswerWindowSeconds,
                CallPreferences.MaxSelfAnswerWindowSeconds,
                "자동응답 대기")
            ?? Range(
                _pbxWaitSeconds,
                CallPreferences.MinPbxResponseWaitSeconds,
                CallPreferences.MaxPbxResponseWaitSeconds,
                "PBX 응답 대기");

        SaveCommand.RaiseCanExecuteChanged();
    }

    private static int? Seconds(string text)
        => int.TryParse(text?.Trim(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var value)
            ? value
            : null;

    /// <summary>
    /// 범위를 화면에서 막는다. 읽는 자리(<see cref="CallPreferences.Sane"/>)도 좁히지만,
    /// 거기서 조용히 바뀌면 상담원은 자기가 넣은 값이 안 쓰이는 이유를 알 수 없다.
    /// </summary>
    private static string? Range(string text, int min, int max, string label)
    {
        var value = Seconds(text);
        if (value is null) return $"{label} 시간을 숫자로 입력해야 한다";

        return value < min || value > max
            ? $"{label} 시간은 {min}초에서 {max}초 사이여야 한다"
            : null;
    }

    /// <summary>
    /// 주소가 틀리면 앱이 아무 서버에도 못 붙는다. 저장 전에 막는다 —
    /// 저장하고 나면 다시 파일을 열어 고치는 수밖에 없다.
    /// </summary>
    private static string? Validate(string? value)
    {
        var trimmed = value?.Trim();
        if (string.IsNullOrEmpty(trimmed)) return "서버 주소를 입력해야 한다";

        if (!Uri.TryCreate(trimmed, UriKind.Absolute, out var uri))
            return "주소 형식이 아니다 (예: http://서버주소:3000/api/v1/)";

        return uri.Scheme is "http" or "https"
            ? null
            : "http 또는 https 주소여야 한다";
    }

    private static IReadOnlyList<AudioDeviceChoice> Choices(
        IAudioDeviceEnumerator enumerator,
        AudioDeviceKind kind)
    {
        var choices = new List<AudioDeviceChoice> { new(null, DefaultEntryName) };
        choices.AddRange(enumerator.List(kind).Select(device => new AudioDeviceChoice(device.Id, device.Name)));
        return choices;
    }

    /// <summary>
    /// 골라 둔 장치를 목록에서 찾는다. 뽑혀서 없어진 장치면 기본 항목으로 되돌린다 —
    /// 없는 장치를 고른 채로 두면 통화가 엉뚱한 곳으로 나간다.
    /// </summary>
    private static AudioDeviceChoice Match(IReadOnlyList<AudioDeviceChoice> choices, string? id)
        => choices.FirstOrDefault(choice => choice.Id == id) ?? choices[0];
}
