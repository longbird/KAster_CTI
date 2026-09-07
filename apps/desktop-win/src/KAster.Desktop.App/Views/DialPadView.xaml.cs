using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;

namespace KAster.Desktop.App.Views;

/// <summary>Edits the existing number field; never originates calls or sends DTMF.</summary>
public partial class DialPadView : UserControl
{
    public static readonly DependencyProperty TargetProperty = DependencyProperty.Register(
        nameof(Target), typeof(TextBox), typeof(DialPadView));

    public TextBox? Target { get => (TextBox?)GetValue(TargetProperty); set => SetValue(TargetProperty, value); }
    public event EventHandler? CloseRequested;

    public DialPadView() => InitializeComponent();

    private bool CanEdit => Target is { IsEnabled: true, IsReadOnly: false };

    private void ReplaceSelection(string text)
    {
        if (!CanEdit) return;
        var target = Target!;
        var caret = target.SelectionStart;
        target.SelectedText = text;
        target.Select(caret + text.Length, 0);
        target.GetBindingExpression(TextBox.TextProperty)?.UpdateSource();
    }

    private void OnDigit(object sender, RoutedEventArgs e)
    {
        if (sender is Button { Tag: string digit } && digit.Length == 1 && "0123456789*#".Contains(digit))
            ReplaceSelection(digit);
    }

    private void OnBackspace(object sender, RoutedEventArgs e)
    {
        if (!CanEdit) return;
        var target = Target!;
        if (target.SelectionLength == 0 && target.CaretIndex > 0)
            target.Select(target.CaretIndex - 1, 1);
        ReplaceSelection("");
    }

    private void OnClear(object sender, RoutedEventArgs e)
    {
        if (!CanEdit) return;
        Target!.SelectAll();
        ReplaceSelection("");
    }

    private void OnClose(object sender, RoutedEventArgs e) => CloseRequested?.Invoke(this, EventArgs.Empty);

    private void OnPreviewKeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.Escape)
        {
            CloseRequested?.Invoke(this, EventArgs.Empty);
            e.Handled = true;
        }
        else if (e.Key == Key.Back)
        {
            OnBackspace(sender, e);
            e.Handled = true;
        }
    }

    private void OnPreviewTextInput(object sender, TextCompositionEventArgs e)
    {
        if (e.Text.Length > 0 && e.Text.All(c => "0123456789*#".Contains(c)))
        {
            ReplaceSelection(e.Text);
            e.Handled = true;
        }
    }
}
