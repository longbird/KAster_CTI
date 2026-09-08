using System.IO;
using System.Net.Http;
using KAster.Desktop.Core.Server;
using KAster.Desktop.Core.Updates;
using KAster.Desktop.Core.Storage;

namespace KAster.Desktop.App.ViewModels;

/// <summary>
/// 새 버전이 있는지 확인하고 <b>상담원에게 알린다</b>.
///
/// <para>
/// 다운로드는 상담원이 시작한다. 검증 후 통화가 없으면 설치 프로그램을 실행한다.
/// 통화 도중에는 설치를 보류하고, 통화 종료 후 사용자가 다시 실행한다.
/// </para>
///
/// <para>
/// <b>파일도 스스로 받지 않는다.</b> 설치 파일은 수십 MB 이고 상담원 PC 의 회선은 통화 음성이
/// 흐르는 그 회선이다. 새 릴리스가 올라온 날 아침 전 상담원이 동시에 내려받으면 그날 통화 품질이
/// 통째로 나빠진다. 상담원이 누를 때, 그리고 <b>통화가 없을 때만</b> 받는다.
/// </para>
///
/// <para>
/// 실행 직전 지문과 통화 상태를 다시 검사한다. 실제 프로세스 실행은 조립 지점에서 처리한다.
/// </para>
/// </summary>
public sealed class UpdateViewModel : ObservableObject
{
    /// <summary>
    /// 스스로 다시 확인하는 주기. 릴리스는 하루에 몇 번씩 올라오는 것이 아니고,
    /// 자주 물어봐야 얻는 것이 없다.
    /// </summary>
    public const int CheckIntervalHours = 6;

    private readonly UpdateClient _client;
    private readonly string _currentVersion;
    private readonly string _channel;
    private readonly string _downloadFolder;
    private readonly Func<DateTimeOffset> _now;
    private readonly Func<bool> _isFree;
    private readonly Action<Task> _track;
    private readonly Action<string> _announce;
    private readonly ISettingsStore<UpdateAvailability>? _requirementStore;

    private UpdateAvailability _found = UpdateAvailability.None;
    private DateTimeOffset? _checkedAt;
    private string _statusText = "아직 확인하지 않았습니다";
    private bool _isBusy;
    private string? _readyFilePath;

    /// <summary>받아 둔 파일이 어느 버전인지. 새 릴리스가 올라오면 그 파일은 더 이상 최신이 아니다.</summary>
    private string? _readyVersion;

    /// <param name="isFree">통화가 걸려 있지 않은가. 받기를 여는 유일한 조건이다.</param>
    /// <param name="announce">상담원 화면의 알림 자리. 업데이트도 그 한 자리를 쓴다.</param>
    public UpdateViewModel(
        UpdateClient client,
        string currentVersion,
        string channel,
        string downloadFolder,
        Func<DateTimeOffset> now,
        Func<bool> isFree,
        Action<Task> track,
        Action<string> announce,
        ISettingsStore<UpdateAvailability>? requirementStore = null)
    {
        _client = client;
        _currentVersion = currentVersion;
        _channel = channel;
        _downloadFolder = downloadFolder;
        _now = now;
        _isFree = isFree;
        _track = track;
        _announce = announce;
        _requirementStore = requirementStore;
        var saved = requirementStore?.Load();
        if (saved is { IsRequired: true } && AppVersion.IsNewer(saved.LatestVersion, currentVersion))
        {
            _found = saved;
            _statusText = "필수 업데이트를 설치해야 새 통화를 시작할 수 있습니다.";
        }

        CheckCommand = new RelayCommand(() => _track(CheckAsync()), () => !IsBusy);
        DownloadCommand = new RelayCommand(
            () => _track(DownloadAsync()),
            () => HasUpdate && !HasFile && !IsBusy && _isFree());
        OpenDownloadFolderCommand = new RelayCommand(
            () => FolderRequested?.Invoke(this, _downloadFolder));
        InstallCommand = new RelayCommand(() => _track(InstallAsync()), () => HasFile && !IsBusy && _isFree());
    }

    /// <summary>이 폴더를 열어 달라. 탐색기를 띄우는 일은 조립 지점이 한다.</summary>
    public event EventHandler<string>? FolderRequested;
    public event EventHandler<string>? InstallRequested;
    public RelayCommand InstallCommand { get; }

    public RelayCommand CheckCommand { get; }

    public RelayCommand DownloadCommand { get; }

    public RelayCommand OpenDownloadFolderCommand { get; }

    public string CurrentVersion => _currentVersion;

    public bool HasUpdate => _found.HasUpdate;

    /// <summary>센터가 필수로 지정했거나 하한보다 낮아 새 통화를 제한한다.</summary>
    public bool IsRequired => _found.IsRequired;

    public string LatestVersion => _found.LatestVersion;

    public string? Notes => _found.Notes;

    public string StatusText
    {
        get => _statusText;
        private set => Set(ref _statusText, value);
    }

    public bool IsBusy
    {
        get => _isBusy;
        private set
        {
            if (!Set(ref _isBusy, value)) return;
            RaiseCommands();
        }
    }

    /// <summary>지문까지 맞춘 설치 파일. <b>설치했다는 뜻이 아니다.</b></summary>
    public string? ReadyFilePath
    {
        get => _readyFilePath;
        private set
        {
            if (!Set(ref _readyFilePath, value)) return;
            Raise(nameof(HasFile));
            RaiseCommands();
        }
    }

    public bool HasFile => !string.IsNullOrEmpty(_readyFilePath);

    /// <summary>1초마다 불린다. 주기가 안 됐으면 그대로 돌아간다.</summary>
    public void Tick()
    {
        DownloadCommand.RaiseCanExecuteChanged();
        InstallCommand.RaiseCanExecuteChanged();
        if (IsBusy) return;
        if (_checkedAt is { } last && _now() - last < TimeSpan.FromHours(CheckIntervalHours)) return;

        _track(CheckAsync());
    }

    /// <summary>
    /// 승인된 릴리스를 물어본다. <b>확인 실패와 최신은 다르게 말한다</b> —
    /// 못 물어본 것을 "최신입니다" 로 적으면 상담원은 낡은 클라이언트를 쓰는 줄 영영 모른다.
    /// </summary>
    public async Task CheckAsync(CancellationToken ct = default)
    {
        if (IsBusy) return;

        IsBusy = true;
        try
        {
            var session = await _client.StartSessionAsync(_currentVersion, ct);
            var manifest = await _client.GetManifestAsync(session, _currentVersion, _channel, ct);

            Apply(UpdateAvailability.For(manifest, _currentVersion));

            if (!_found.HasUpdate)
            {
                StatusText = $"최신 버전입니다 ({_currentVersion})";
                return;
            }

            StatusText = _found.Headline;
            _announce(_found.Headline);

            await _client.ReportAsync(
                Report(UpdateEvents.UpdateAvailable, new Dictionary<string, object>
                {
                    ["mandatory"] = _found.IsRequired,
                }),
                ct);
        }
        catch (Exception ex) when (IsExpected(ex))
        {
            StatusText = $"업데이트를 확인하지 못했습니다: {ex.Message}";
        }
        finally
        {
            _checkedAt = _now();
            IsBusy = false;
        }
    }

    /// <summary>
    /// 설치 파일을 받아 <b>지문을 맞춘다</b>. 맞지 않으면 파일은 남지 않는다 —
    /// 손상됐거나 바꿔치기된 설치 파일을 남겨 두면 상담원이 그것을 두 번 눌러 실행한다.
    /// </summary>
    public async Task DownloadAsync(CancellationToken ct = default)
    {
        if (IsBusy || !_found.HasUpdate || _found.Artifact is null) return;

        // 버튼은 이미 닫혀 있지만, 누른 뒤 통화가 잡힐 수도 있고 핫키로도 들어올 수 있다.
        if (!_isFree())
        {
            StatusText = "통화 중에는 설치 파일을 받지 않습니다. 통화를 마친 뒤 눌러 주세요.";
            return;
        }

        var artifact = _found.Artifact;
        var downloaded = false;
        IsBusy = true;

        try
        {
            await _client.ReportAsync(Report(UpdateEvents.DownloadStarted), ct);

            // 세션 토큰은 재사용할 수 있지만 600초짜리다. 확인한 지 오래됐을 수 있어 새로 받는다.
            var session = await _client.StartSessionAsync(_currentVersion, ct);
            var ticket = await _client.StartDownloadAsync(session, artifact.ArtifactId, _currentVersion, ct);

            var target = Path.Combine(_downloadFolder, UpdateFileName.SafeFor(artifact.FileName, artifact.Version));
            var saved = await _client.FetchArtifactAsync(ticket, target, ct);

            _readyVersion = _found.LatestVersion;
            ReadyFilePath = saved;

            StatusText = "설치 파일을 받았습니다. 통화가 없을 때 실행하세요.";
            await _client.ReportAsync(Report(UpdateEvents.DownloadVerified), ct);
            downloaded = true;
        }
        catch (UpdateException ex)
        {
            // 우리가 거부한 것이다. 지문이 안 맞거나 받을 수 없는 주소였다.
            StatusText = ex.Message;
            await _client.ReportAsync(
                Report(UpdateEvents.DownloadRejected, new Dictionary<string, object>
                {
                    ["reason"] = ex.Message,
                }),
                ct);
        }
        catch (Exception ex) when (IsExpected(ex))
        {
            StatusText = $"설치 파일을 받지 못했습니다: {ex.Message}";
            await _client.ReportAsync(
                Report(UpdateEvents.DownloadFailed, new Dictionary<string, object>
                {
                    ["reason"] = ex.Message,
                }),
                ct);
        }
        finally
        {
            IsBusy = false;
        }
        if (downloaded) await InstallAsync(ct);
    }

    public async Task InstallAsync(CancellationToken ct = default)
    {
        if (IsBusy || !HasFile) return;
        if (!_isFree()) { StatusText = "통화가 끝난 뒤 ‘설치 실행’을 눌러 주세요."; return; }
        IsBusy = true;
        try
        {
            // 실행 직전 다시 검증하며 실행 요청까지 읽기 핸들을 유지해 교체를 막는다.
            using var file = File.OpenRead(ReadyFilePath!);
            var hash = Convert.ToHexString(await System.Security.Cryptography.SHA256.HashDataAsync(file, ct));
            if (!string.Equals(hash, _found.Artifact?.Sha256, StringComparison.OrdinalIgnoreCase))
            {
                ReadyFilePath = null;
                StatusText = "설치 파일이 변경되었습니다. 다시 다운로드해 주세요.";
                return;
            }
            if (!_isFree()) { StatusText = "통화가 끝난 뒤 ‘설치 실행’을 눌러 주세요."; return; }
            InstallRequested?.Invoke(this, ReadyFilePath!);
            StatusText = "설치 프로그램을 실행했습니다.";
        }
        catch (Exception ex) when (IsExpected(ex) || ex is System.ComponentModel.Win32Exception or InvalidOperationException)
        {
            StatusText = $"설치 프로그램을 실행하지 못했습니다: {ex.Message}";
        }
        finally { IsBusy = false; }
    }

    private void Apply(UpdateAvailability found)
    {
        _found = found;

        // 그사이 다른 버전이 올라왔으면 받아 둔 파일은 이제 최신이 아니다.
        // "받았습니다" 를 그대로 두면 상담원이 옛 설치 파일을 실행한다.
        if (!found.HasUpdate || !string.Equals(found.LatestVersion, _readyVersion, StringComparison.Ordinal))
        {
            _readyVersion = null;
            ReadyFilePath = null;
        }

        Raise(nameof(HasUpdate));
        Raise(nameof(IsRequired));
        Raise(nameof(LatestVersion));
        Raise(nameof(Notes));
        RaiseCommands();
        _requirementStore?.Save(found.IsRequired ? found : UpdateAvailability.None);
    }

    private UpdateReport Report(string eventType, IReadOnlyDictionary<string, object>? metadata = null) => new()
    {
        EventType = eventType,
        CurrentAppVersion = _currentVersion,
        TargetVersion = _found.HasUpdate ? _found.LatestVersion : null,
        ArtifactId = _found.Artifact?.ArtifactId,
        Metadata = metadata,
    };

    private void RaiseCommands()
    {
        CheckCommand.RaiseCanExecuteChanged();
        DownloadCommand.RaiseCanExecuteChanged();
        InstallCommand.RaiseCanExecuteChanged();
    }

    private static bool IsExpected(Exception ex)
        => ex is CtiServerException or HttpRequestException or TaskCanceledException or IOException or UnauthorizedAccessException;
}
