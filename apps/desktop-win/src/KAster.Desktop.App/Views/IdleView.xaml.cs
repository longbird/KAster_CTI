using System.Windows;
using System.Windows.Controls;

namespace KAster.Desktop.App.Views;

public partial class IdleView : UserControl
{
    public IdleView() => InitializeComponent();

    private void OnOpenDialPad(object sender, RoutedEventArgs e) => DialPadPopup.IsOpen = true;

    private void OnCloseDialPad(object? sender, EventArgs e) => DialPadPopup.IsOpen = false;

    private void OnDialPadOpened(object? sender, EventArgs e) => ((Button)DialPad.FindName("Digit1")).Focus();

    private void OnDialPadClosed(object? sender, EventArgs e) => DialNumberField.Focus();

    private void OnUnloaded(object sender, RoutedEventArgs e) => DialPadPopup.IsOpen = false;
}
