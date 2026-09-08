using System.Windows;

namespace KAster.Desktop.App.Views;

public partial class CloseChoiceWindow : Window
{
    public CloseChoiceWindow() => InitializeComponent();
    public bool QuitRequested { get; private set; }
    private void HideClicked(object sender, RoutedEventArgs e) => DialogResult = true;
    private void QuitClicked(object sender, RoutedEventArgs e)
    {
        QuitRequested = true;
        DialogResult = true;
    }
}
