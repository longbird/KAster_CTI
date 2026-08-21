using System.Windows;
using System.Windows.Controls;
using KAster.Desktop.App.ViewModels;

namespace KAster.Desktop.App.Views;

public partial class LoginView : UserControl
{
    public LoginView()
    {
        InitializeComponent();

        // 지난번 아이디·내선이 이미 채워져 있으면 칠 것은 비밀번호뿐이다. 커서를 거기 둔다.
        Loaded += (_, _) =>
        {
            if (DataContext is LoginViewModel { NeedsPasswordOnly: true }) PasswordField.Focus();
        };
    }

    /// <summary>
    /// PasswordBox 는 보안상 Password 를 바인딩하지 않는다. 값을 옮기는 이 한 줄이 코드비하인드의 전부다.
    /// </summary>
    private void OnPasswordChanged(object sender, RoutedEventArgs e)
    {
        if (DataContext is LoginViewModel vm) vm.Password = PasswordField.Password;
    }
}
