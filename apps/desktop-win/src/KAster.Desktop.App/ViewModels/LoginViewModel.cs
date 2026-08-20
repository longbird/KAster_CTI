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

    private string _loginId = string.Empty;
    private string _password = string.Empty;
    private string _extension = string.Empty;
    private string? _errorMessage;
    private bool _isBusy;

    public LoginViewModel(AuthClient auth, ITokenStore tokens)
    {
        _auth = auth;
        _tokens = tokens;
        SignInCommand = new RelayCommand(() => _ = SignInAsync(), () => CanSignIn);
    }

    public event EventHandler<LoginResult>? SignedIn;

    public RelayCommand SignInCommand { get; }

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
