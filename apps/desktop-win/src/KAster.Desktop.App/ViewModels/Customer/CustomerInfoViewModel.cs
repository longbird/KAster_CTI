using KAster.Desktop.Core.Contracts;
using KAster.Desktop.Core.State;

namespace KAster.Desktop.App.ViewModels;

/// <summary>
/// 지금 통화 중인 고객.
///
/// <b>서버에 물어보지 않는다.</b> <c>GET customers/*</c> 는 컨트롤러가 클래스 레벨로
/// supervisor/admin 을 걸어 둬 상담원 역할에게 전부 403 이다. 그리는 것은 스크린팝
/// (<c>screenpop.customer</c>)이 이미 실어 보낸 것뿐이고, 그것을 서버가 통화 상태에 붙여 준다.
///
/// 그래서 <b>스크린팝이 안 오는 통화가 있다.</b> 그때는 열 것이 없다고 말한다 —
/// 빈 칸을 "-" 나 "알 수 없음" 으로 채우면 없는 정보를 있는 것처럼 읽게 된다.
/// </summary>
public sealed class CustomerInfoViewModel : ObservableObject
{
    private readonly CallStateStore _store;

    private CustomerInfo? _customer;
    private string _branchName = string.Empty;
    private bool _isOpen;

    public CustomerInfoViewModel(CallStateStore store)
    {
        _store = store;
        _store.CurrentCallChanged += (_, call) => OnCurrentCallChanged(call);

        OpenCommand = new RelayCommand(Open, () => HasCustomerInfo);
        CloseCommand = new RelayCommand(Close);
    }

    /// <summary>고객 정보를 띄웠다.</summary>
    public event EventHandler? Opened;

    /// <summary>고객 정보를 닫았다. 통화가 끝나 스스로 닫히는 경로도 여기로 온다.</summary>
    public event EventHandler? Closed;

    public RelayCommand OpenCommand { get; }

    public RelayCommand CloseCommand { get; }

    public bool IsOpen
    {
        get => _isOpen;
        private set => Set(ref _isOpen, value);
    }

    /// <summary>스크린팝이 무언가를 실어 왔는가. 버튼을 열지 말지가 이 값 하나로 정해진다.</summary>
    public bool HasCustomerInfo => _customer is not null;

    public string CustomerName => _customer?.CustomerName?.Trim() ?? string.Empty;

    public bool HasCustomerName => CustomerName.Length > 0;

    public string PhoneNumber => PhoneNumberFormat.ForDisplay(_customer?.PhoneNumber);

    public bool HasPhoneNumber => PhoneNumber.Length > 0;

    public string CompanyName => _customer?.CompanyName?.Trim() ?? string.Empty;

    public bool HasCompanyName => CompanyName.Length > 0;

    public string Memo => _customer?.Memo?.Trim() ?? string.Empty;

    public bool HasMemo => Memo.Length > 0;

    /// <summary>
    /// 고객 등급. 서버가 <c>NORMAL</c> 을 기본으로 넣으므로 그것은 굳이 띄우지 않는다 —
    /// 등급이 뜻을 가지는 것은 보통과 다를 때뿐이다.
    /// </summary>
    public string Grade => _customer?.Grade?.Trim() ?? string.Empty;

    public bool HasGrade => Grade.Length > 0 && !string.Equals(Grade, "NORMAL", StringComparison.OrdinalIgnoreCase);

    /// <summary>고객이 건 지사. 스크린팝이 아니라 통화 자체에 붙어 오는 값이다.</summary>
    public string BranchName
    {
        get => _branchName;
        private set => Set(ref _branchName, value);
    }

    public bool HasBranchName => BranchName.Length > 0;

    /// <summary>
    /// 볼 것이 없을 때 그 사실을 적는다. 빈 창을 띄우면 상담원은 조회가 실패한 줄 알고 기다린다.
    /// </summary>
    public string EmptyText => "이 통화에는 고객 정보가 오지 않았습니다.";

    /// <summary>창이 닫혔다. 상담원이 X 로 닫은 경로도 여기로 온다.</summary>
    public void Close()
    {
        if (!IsOpen) return;

        IsOpen = false;
        Closed?.Invoke(this, EventArgs.Empty);
    }

    private void Open()
    {
        if (IsOpen)
        {
            Opened?.Invoke(this, EventArgs.Empty);
            return;
        }

        IsOpen = true;
        Opened?.Invoke(this, EventArgs.Empty);
    }

    /// <summary>
    /// 통화가 바뀌었다. 앞 고객이 창에 남아 있으면 다음 통화에서 상담원은 그 사람을 지금 상대로
    /// 읽는다. 통화가 통째로 사라지면 창도 닫는다 — 빈 창이 남아 있을 이유가 없다.
    /// </summary>
    private void OnCurrentCallChanged(CurrentCall? call)
    {
        var server = call?.Server;

        _customer = server?.Customer;
        BranchName = server?.BranchName?.Trim() ?? string.Empty;

        Raise(nameof(HasCustomerInfo));
        Raise(nameof(CustomerName));
        Raise(nameof(HasCustomerName));
        Raise(nameof(PhoneNumber));
        Raise(nameof(HasPhoneNumber));
        Raise(nameof(CompanyName));
        Raise(nameof(HasCompanyName));
        Raise(nameof(Memo));
        Raise(nameof(HasMemo));
        Raise(nameof(Grade));
        Raise(nameof(HasGrade));
        Raise(nameof(HasBranchName));
        OpenCommand.RaiseCanExecuteChanged();

        if (!HasCustomerInfo) Close();
    }
}
