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

    /// <summary>지난번 값이 이미 채워져 있어 비밀번호만 치면 되는 상태.</summary>
    public bool NeedsPasswordOnly =>
        !string.IsNullOrWhiteSpace(_loginId) && !string.IsNullOrWhiteSpace(_extension);

    public bool CanSignIn =>
        !IsBusy &&
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
                }
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
