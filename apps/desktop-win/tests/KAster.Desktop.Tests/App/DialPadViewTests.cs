using System.Runtime.ExceptionServices;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Data;
using KAster.Desktop.App.Views;

namespace KAster.Desktop.Tests.App;

public sealed class DialPadViewTests : SoftphoneViewModelTestBase
{
    [Fact]
    public void Digits_edit_the_bound_number_without_dialing_or_sending_dtmf() => Sta(() =>
    {
        var (vm, _, phone, stub) = Build();
        var target = BoundNumber(vm.Dial);
        var pad = new DialPadView { Target = target };
        Click(pad, "Digit1");
        Click(pad, "Digit0");
        Click(pad, "DigitStar");
        Click(pad, "DigitHash");
        Assert.Equal("10*#", vm.Dial.DialNumber);
        Assert.Equal(4, target.CaretIndex);
        Assert.Empty(stub.Requests);
        Assert.Empty(phone.Digits);
    });

    [Fact]
    public void Selected_digits_are_replaced_and_backspace_deletes_at_the_caret() => Sta(() =>
    {
        var (vm, _, _, _) = Build();
        vm.Dial.DialNumber = "0101234";
        var target = BoundNumber(vm.Dial);
        var pad = new DialPadView { Target = target };
        target.Select(3, 2);
        Click(pad, "Digit9");
        Assert.Equal("010934", vm.Dial.DialNumber);
        Click(pad, "BackspaceButton");
        Assert.Equal("01034", vm.Dial.DialNumber);
        target.Select(0, 3);
        Click(pad, "BackspaceButton");
        Assert.Equal("34", vm.Dial.DialNumber);
        Click(pad, "ClearButton");
        Assert.Equal("", vm.Dial.DialNumber);
        Click(pad, "BackspaceButton");
        Assert.Equal("", vm.Dial.DialNumber);
    });

    [Fact]
    public void Disabled_or_readonly_fields_cannot_be_edited() => Sta(() =>
    {
        var target = new TextBox { Text = "1001", IsReadOnly = true };
        var pad = new DialPadView { Target = target };
        Click(pad, "Digit1"); Click(pad, "ClearButton");
        Assert.Equal("1001", target.Text);
        target.IsReadOnly = false; target.IsEnabled = false;
        Click(pad, "BackspaceButton");
        Assert.Equal("1001", target.Text);
    });

    private static TextBox BoundNumber(object dial)
    {
        var target = new TextBox();
        target.SetBinding(TextBox.TextProperty, new Binding("DialNumber")
        {
            Source = dial, Mode = BindingMode.TwoWay, UpdateSourceTrigger = UpdateSourceTrigger.PropertyChanged
        });
        return target;
    }

    private static void Click(DialPadView pad, string name) =>
        ((Button)pad.FindName(name)).RaiseEvent(new RoutedEventArgs(Button.ClickEvent));

    private static void Sta(Action action)
    {
        Exception? failure = null;
        var thread = new Thread(() => { try { action(); } catch (Exception e) { failure = e; } });
        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
        Assert.True(thread.Join(TimeSpan.FromSeconds(10)), "WPF number editing did not finish.");
        if (failure is not null) ExceptionDispatchInfo.Capture(failure).Throw();
    }
}
