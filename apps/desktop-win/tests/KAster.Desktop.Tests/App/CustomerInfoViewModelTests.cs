using KAster.Desktop.Core.Contracts;
using Xunit;

namespace KAster.Desktop.Tests.App;

/// <summary>
/// 고객 정보 서브 창.
///
/// <b>서버에 물어보지 않는다.</b> <c>GET /customers/*</c> 는 상담원 역할에게 전부 403 이라
/// (컨트롤러가 클래스 레벨로 supervisor/admin 을 걸어 뒀다) 부를 수 있는 경로가 없다.
/// 그리는 것은 스크린팝이 이미 실어 보낸 것뿐이고, 그것이 없는 통화도 있다.
/// </summary>
public class CustomerInfoViewModelTests : SoftphoneViewModelTestBase
{
    private static ActiveCall CallWith(CustomerInfo? customer) => new()
    {
        CallId = "c-1",
        Linkedid = "l-1",
        Ani = "01011112222",
        SessionStatus = SessionStatus.Talking,
        StartedAt = new DateTimeOffset(2026, 8, 20, 4, 0, 0, TimeSpan.Zero),
        AnsweredAt = new DateTimeOffset(2026, 8, 20, 4, 0, 0, TimeSpan.Zero),
        PrimaryAgentId = "a-1",
        BranchName = "강남지사",
        Customer = customer,
    };

    [Fact]
    public void What_the_screen_pop_carried_is_what_the_window_shows()
    {
        var (vm, store, _, _) = Build();

        store.Apply(new CallCreatedEvent(CallWith(new CustomerInfo
        {
            CustomerId = "cu-1",
            CustomerName = "홍길동",
            Grade = "VIP",
            PhoneNumber = "01011112222",
            CompanyName = "가나상사",
            Memo = "지난주 요금 문의",
        })));

        Assert.True(vm.Customer.HasCustomerInfo);
        Assert.Equal("홍길동", vm.Customer.CustomerName);
        Assert.Equal("010-1111-2222", vm.Customer.PhoneNumber);
        Assert.Equal("가나상사", vm.Customer.CompanyName);
        Assert.Equal("지난주 요금 문의", vm.Customer.Memo);
        Assert.Equal("VIP", vm.Customer.Grade);
        Assert.Equal("강남지사", vm.Customer.BranchName);
    }

    /// <summary>
    /// 스크린팝이 안 오는 통화가 있다. 그때 빈 창을 띄우면 상담원은 조회가 실패한 줄 알고 기다린다 —
    /// 열 것 자체가 없다는 것이 사실이다.
    /// </summary>
    [Fact]
    public void A_call_without_a_screen_pop_has_nothing_to_open()
    {
        var (vm, store, _, _) = Build();

        store.Apply(new CallCreatedEvent(CallWith(null)));

        Assert.False(vm.Customer.HasCustomerInfo);
        Assert.False(vm.Customer.OpenCommand.CanExecute(null));
        Assert.NotEmpty(vm.Customer.EmptyText);
    }

    /// <summary>없는 칸을 "-" 나 "알 수 없음" 으로 채우면, 없는 정보를 있는 것처럼 읽게 된다.</summary>
    [Fact]
    public void Fields_the_server_did_not_send_are_not_invented()
    {
        var (vm, store, _, _) = Build();

        store.Apply(new CallCreatedEvent(CallWith(new CustomerInfo
        {
            CustomerId = "cu-1",
            CustomerName = "홍길동",
            PhoneNumber = "01011112222",
        })));

        Assert.False(vm.Customer.HasCompanyName);
        Assert.Equal(string.Empty, vm.Customer.CompanyName);
        Assert.False(vm.Customer.HasMemo);
        Assert.Equal(string.Empty, vm.Customer.Memo);
    }

    /// <summary>고객명을 서버가 모르는 경우가 더 많다. 이름이 없어도 번호와 메모는 볼 값이 있다.</summary>
    [Fact]
    public void A_customer_with_no_name_still_counts_as_information()
    {
        var (vm, store, _, _) = Build();

        store.Apply(new CallCreatedEvent(CallWith(new CustomerInfo
        {
            CustomerId = "cu-1",
            PhoneNumber = "01011112222",
            Memo = "야간 배차 요청",
        })));

        Assert.True(vm.Customer.HasCustomerInfo);
        Assert.False(vm.Customer.HasCustomerName);
        Assert.True(vm.Customer.HasMemo);
    }

    /// <summary>스크린팝은 통화가 잡힌 뒤에 따로 온다. 그때 창이 이미 떠 있으면 그 자리에서 채워져야 한다.</summary>
    [Fact]
    public void A_screen_pop_that_arrives_later_fills_the_window_in_place()
    {
        var (vm, store, _, _) = Build();
        store.Apply(new CallCreatedEvent(CallWith(null)));

        store.Apply(new ScreenPopEvent("c-1", new CustomerInfo
        {
            CustomerId = "cu-1",
            CustomerName = "홍길동",
            PhoneNumber = "01011112222",
        }));

        Assert.True(vm.Customer.HasCustomerInfo);
        Assert.Equal("홍길동", vm.Customer.CustomerName);
    }

    /// <summary>
    /// 통화가 끝났는데 앞 고객이 창에 남아 있으면, 다음 통화에서 상담원은 그 사람을 지금 상대로 읽는다.
    /// 창도 함께 닫는다 — 빈 창이 화면에 남아 있을 이유가 없다.
    /// </summary>
    [Fact]
    public void The_previous_customer_does_not_linger_after_the_call_ends()
    {
        var (vm, store, _, _) = Build();
        store.Apply(new CallCreatedEvent(CallWith(new CustomerInfo
        {
            CustomerId = "cu-1",
            CustomerName = "홍길동",
            PhoneNumber = "01011112222",
        })));

        var closed = 0;
        vm.Customer.Closed += (_, _) => closed++;
        vm.Customer.OpenCommand.Execute(null);

        store.Apply(new CallEndedEvent(CallWith(null)));

        Assert.False(vm.Customer.HasCustomerInfo);
        Assert.Equal(string.Empty, vm.Customer.CustomerName);
        Assert.Equal(1, closed);
    }
}
