using System.Net.Http;
using KAster.Desktop.Core.Server;
using KAster.Desktop.Core.Storage;

namespace KAster.Desktop.App.ViewModels;

/// <summary>
/// 로그인 화면. 비밀번호는 메모리에만 두고 어디에도 저장하지 않는다.
/// 실패하면 비밀번호만 지운다 — 아이디와 내선까지 지우면 상담원이 매번 다시 타야 한다.
/// </summary>
public sealed class LoginViewModel : ObservableObject
{
    private readonly AuthClient _auth;
    private readonly ITokenStore _tokens;
    private readonly ISavedLoginStore _savedLogin;

    private string _loginId = string.Empty;
    private string _password = string.Empty;
    private string _extension = string.Empty;
    private string? _errorMessage;
    private bool _isBusy;
    private bool _rememberMe;
    private bool _useSoftphone;
    private bool _autoSignIn;
    private bool _isResuming;

    public LoginViewModel(AuthClient auth, ITokenStore tokens, ISavedLoginStore savedLogin)
    {
        _auth = auth;
        _tokens = tokens;
        _savedLogin = savedLogin;
        SignInCommand = new RelayCommand(() => _ = SignInAsync(), () => CanSignIn);
        OpenSettingsCommand = new RelayCommand(() => SettingsRequested?.Invoke(this, EventArgs.Empty));

        var saved = savedLogin.Load();

        // 모드는 자리의 성질이라 "아이디 저장" 과 무관하게 이어진다.
        _useSoftphone = saved.UseSoftphone;
        _autoSignIn = saved.AutoSignIn;

        if (!saved.Remember) return;

        _loginId = saved.LoginId;
        _extension = saved.Extension;
        _rememberMe = true;
    }

    public event EventHandler<LoginResult>? SignedIn;

    public RelayCommand SignInCommand { get; }

    public RelayCommand OpenSettingsCommand { get; }

    /// <summary>서버 주소는 로그인 전에 고칠 수 있어야 한다. 못 붙는 주소면 로그인 자체가 안 된다.</summary>
    public event EventHandler? SettingsRequested;

    public string LoginId
    {
        get => _loginId;
        set { if (Set(ref _loginId, value)) OnFormChanged(); }
    }

    public string Password
    {
        get => _password;
        set { if (Set(ref _password, value)) OnFormChanged(); }
    }

    public string Extension
    {
        get => _extension;
        set { if (Set(ref _extension, value)) OnFormChanged(); }
    }

    public string? ErrorMessage
    {
        get => _errorMessage;
        private set
        {
            if (Set(ref _errorMessage, value)) Raise(nameof(HasError));
        }
    }

    public bool HasError => !string.IsNullOrEmpty(_errorMessage);

    public bool IsBusy
    {
        get => _isBusy;
        private set { if (Set(ref _isBusy, value)) OnFormChanged(); }
    }

    /// <summary>아이디와 내선을 다음에도 채워 둘지. 비밀번호는 저장 대상이 아니다.</summary>
    public bool RememberMe
    {
        get => _rememberMe;
        set => Set(ref _rememberMe, value);
    }

    /// <summary>
    /// 이 PC 가 소프트폰으로 통화하는지. 끄면 <b>실기기 모드</b>이고, 지정된 내선의 책상 전화기가
    /// 이미 PBX 에 등록돼 있어야 한다. 기본은 실기기 모드다.
    /// </summary>
    public bool UseSoftphone
    {
        get => _useSoftphone;
        set => Set(ref _useSoftphone, value);
    }

    /// <summary>
    /// 다음에 켤 때 지난 세션으로 그냥 들어갈지. <b>비밀번호는 저장하지 않는다</b> —
    /// 금고에 이미 있는 refresh token 으로 되살릴 뿐이다.
    /// </summary>
    public bool AutoSignIn
    {
        get => _autoSignIn;
        set => Set(ref _autoSignIn, value);
    }

    /// <summary>지난 세션을 되살리는 중. 이때 빈 로그인 칸을 보여 주면 상담원이 비밀번호를 치기 시작한다.</summary>
    public bool IsResuming
    {
        get => _isResuming;
        private set { if (Set(ref _isResuming, value)) OnFormChanged(); }
    }

    /// <summary>
    /// 지난 세션을 되살린다. 앱이 켜질 때 <b>한 번</b> 부른다.
    ///
    /// 되살리는 재료는 금고의 refresh token 이다. 비밀번호를 어디에도 두지 않는 이유가 여기 있다 —
    /// 이 토큰은 DPAPI 로 이 Windows 계정에만 풀리고, 쓰는 순간 서버가 회수하며 새 것으로 바꾼다.
    /// 파일을 통째로 훔쳐 가도 다른 PC 에서는 열리지 않고, 열렸다면 그건 이미 그 계정을 쥔 것이다.
    ///
    /// <b>실패는 조용히 넘긴다.</b> 토큰이 만료됐거나 관리자가 회수한 것은 상담원이 뭘 잘못한 게
    /// 아니므로 빨간 오류를 띄울 일이 아니다. 다만 못 쓰는 토큰은 지운다 — 남겨 두면 켤 때마다
    /// 실패하는 요청을 한 번씩 더 보낸다.
    /// </summary>
    /// <returns>되살렸으면 true. false 면 평소처럼 로그인 화면에서 받는다.</returns>
    public async Task<bool> TryResumeAsync(CancellationToken ct = default)
    {
        if (!_autoSignIn || IsBusy || IsResuming) return false;

        var refreshToken = _tokens.Load()?.RefreshToken;
        if (string.IsNullOrWhiteSpace(refreshToken)) return false;

        IsResuming = true;
        ErrorMessage = null;

        try
        {
            var result = await _auth.RefreshAsync(refreshToken, ct);
            _tokens.Save(result.Tokens);
            SignedIn?.Invoke(this, await WithSipConfigAsync(result, ct));
            return true;
        }
        catch (CtiServerException)
        {
            // 서버가 이 토큰을 거절했다. 다시 쓸 일이 없다.
            _tokens.Clear();
            return false;
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or InvalidOperationException)
        {
            // 서버에 못 닿은 것뿐이다. 토큰은 멀쩡하므로 남겨 둔다 — 지우면 잠깐 끊긴 것 때문에
            // 상담원이 비밀번호를 다시 쳐야 한다.
            return false;
        }
        finally
        {
            IsResuming = false;
        }
    }

    /// <summary>
    /// SIP 설정을 데스크톱 세션에서 받아 채운다.
    ///
    /// refresh 응답에는 SIP 비밀번호가 없다 — 웹 클라이언트도 같은 응답을 받으므로 서버가
    /// credential 을 싣지 않는다. 그래서 자동 로그인만으로 들어가면 소프트폰 자리는 전화를
    /// 한 통도 못 받고, 실기기 자리는 전화기에 넣을 값을 화면에서 잃는다.
    ///
    /// <b>못 받아도 로그인은 살린다</b> — 전화를 못 걸 뿐이고, 여기서 막으면 상담원은
    /// 아무것도 못 한다. 사유는 소프트폰이 안 켜질 때 그 자리에서 말한다.
    /// </summary>
    private async Task<LoginResult> WithSipConfigAsync(LoginResult result, CancellationToken ct)
    {
        try
        {
            var session = await _auth.GetDesktopSessionAsync(result.Tokens.AccessToken, ct);
            return result with { Session = result.Session with { SoftphoneConfig = session.SoftphoneConfig } };
        }
        catch (Exception ex) when (ex is CtiServerException or HttpRequestException or TaskCanceledException)
        {
            return result;
        }
    }

    /// <summary>지난번 값이 이미 채워져 있어 비밀번호만 치면 되는 상태.</summary>
    public bool NeedsPasswordOnly =>
        !string.IsNullOrWhiteSpace(_loginId) && !string.IsNullOrWhiteSpace(_extension);

    public bool CanSignIn =>
        !IsBusy &&
        !IsResuming &&
        !string.IsNullOrWhiteSpace(_loginId) &&
        !string.IsNullOrWhiteSpace(_password) &&
        !string.IsNullOrWhiteSpace(_extension);

    public async Task SignInAsync(CancellationToken ct = default)
    {
        if (IsBusy) return;

        IsBusy = true;
        ErrorMessage = null;

        try
        {
            var result = await _auth.LoginAsync(_loginId.Trim(), _password, _extension.Trim(), ct);
            _tokens.Save(result.Tokens);

            // 로그인이 된 뒤에만 저장한다. 틀린 아이디가 굳어 버리면 매번 지우고 다시 쳐야 한다.
            // 체크를 풀었으면 남아 있던 것도 지운다 — 공용 PC 에서 중요하다.
            _savedLogin.Save(RememberMe
                ? new SavedLogin
                {
                    Remember = true,
                    LoginId = _loginId.Trim(),
                    Extension = _extension.Trim(),
                    UseSoftphone = UseSoftphone,
                    AutoSignIn = AutoSignIn,
                }
                // 체크를 풀었으면 자동 로그인도 같이 꺼진다. 공용 PC 에서 아이디는 안 남기면서
                // 세션만 되살아나면, 다음 사람이 앞사람 계정으로 그냥 들어간다.
                : new SavedLogin { UseSoftphone = UseSoftphone });

            Password = string.Empty;
            SignedIn?.Invoke(this, result);
        }
        catch (CtiServerException ex)
        {
            Fail(ex.Message);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or InvalidOperationException)
        {
            Fail($"서버에 연결할 수 없다: {ex.Message}");
        }
        finally
        {
            IsBusy = false;
        }
    }

    private void Fail(string message)
    {
        ErrorMessage = message;
        Password = string.Empty;
    }

    private void OnFormChanged()
    {
        Raise(nameof(CanSignIn));
        SignInCommand.RaiseCanExecuteChanged();
    }
}
