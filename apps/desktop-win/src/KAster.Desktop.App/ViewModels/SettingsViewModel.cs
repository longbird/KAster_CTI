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
/// 설정 화면. 서버 주소와 통화 오디오 장치를 정한다.
///
/// 지금까지 서버 주소는 <c>settings.json</c> 을 직접 열어 고쳐야 했고, 오디오 장치는
/// 고를 방법 자체가 없었다. 현장 설치를 상담원이 할 수 없는 상태였다.
/// </summary>
public sealed class SettingsViewModel : ObservableObject
{
    private const string DefaultEntryName = "시스템 기본";

    private readonly ISettingsStore<AppSettings> _settings;
    private readonly ISettingsStore<AudioDeviceSelection> _devices;
    private readonly string _originalUrl;

    private string _serverBaseUrl;
    private string? _serverUrlError;
    private AudioDeviceChoice? _selectedCapture;
    private AudioDeviceChoice? _selectedCallRender;
    private AudioDeviceChoice? _selectedRingRender;

    public SettingsViewModel(
        ISettingsStore<AppSettings> settings,
        ISettingsStore<AudioDeviceSelection> devices,
        IAudioDeviceEnumerator enumerator,
        bool useSoftphone)
    {
        _settings = settings;
        _devices = devices;
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

        SaveCommand = new RelayCommand(Save, () => ServerUrlError is null);
        CloseCommand = new RelayCommand(() => Closed?.Invoke(this, EventArgs.Empty));
        OpenLogFolderCommand = new RelayCommand(
            () => FolderRequested?.Invoke(this, AppPaths.Root));
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

    /// <summary>실기기 모드에는 우리 오디오가 없다. 고를 것을 보여 주면 안 고른 줄 알고 헤맨다.</summary>
    public bool ShowsAudioDevices { get; }

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

    private void Save()
    {
        if (ServerUrlError is not null) return;

        _settings.Save(_settings.Load() with { ServerBaseUrl = _serverBaseUrl.Trim() });
        _devices.Save(new AudioDeviceSelection
        {
            CaptureDeviceId = SelectedCapture?.Id,
            CallRenderDeviceId = SelectedCallRender?.Id,
            RingRenderDeviceId = SelectedRingRender?.Id,
        });

        Closed?.Invoke(this, EventArgs.Empty);
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
