using System.Windows.Input;

namespace KAster.Desktop.App.ViewModels;

/// <summary>
/// 값을 하나 받는 커맨드. 목록의 한 줄을 누르는 경우처럼 "어느 것인지"가 필요할 때 쓴다.
/// 값이 없거나 형이 다르면 아무것도 하지 않는다 — 바인딩이 어긋났다고 앱이 죽으면 안 된다.
/// </summary>
public sealed class RelayCommand<T> : ICommand
    where T : class
{
    private readonly Action<T> _execute;
    private readonly Func<T, bool>? _canExecute;

    public RelayCommand(Action<T> execute, Func<T, bool>? canExecute = null)
    {
        _execute = execute;
        _canExecute = canExecute;
    }

    public event EventHandler? CanExecuteChanged;

    public bool CanExecute(object? parameter)
        => parameter is T value && (_canExecute?.Invoke(value) ?? true);

    public void Execute(object? parameter)
    {
        if (parameter is T value) _execute(value);
    }

    public void RaiseCanExecuteChanged() => CanExecuteChanged?.Invoke(this, EventArgs.Empty);
}
