using KAster.Desktop.Core.Contracts;
using Xunit;

namespace KAster.Desktop.Tests.Contracts;

public class PhoneNumberFormatTests
{
    [Theory]
    [InlineData("01034623453", "010-3462-3453")]
    [InlineData("0101234567", "010-123-4567")]
    [InlineData("07052346380", "070-5234-6380")]
    [InlineData("08012345678", "080-1234-5678")]
    public void Mobile_and_internet_numbers_split_after_the_prefix(string raw, string expected)
        => Assert.Equal(expected, PhoneNumberFormat.ForDisplay(raw));

    /// <summary>서울만 지역번호가 두 자리다.</summary>
    [Theory]
    [InlineData("0212345678", "02-1234-5678")]
    [InlineData("021234567", "02-123-4567")]
    public void Seoul_keeps_its_two_digit_area_code(string raw, string expected)
        => Assert.Equal(expected, PhoneNumberFormat.ForDisplay(raw));

    [Theory]
    [InlineData("0311234567", "031-123-4567")]
    [InlineData("03112345678", "031-1234-5678")]
    [InlineData("0511234567", "051-123-4567")]
    public void Other_areas_use_three_digits(string raw, string expected)
        => Assert.Equal(expected, PhoneNumberFormat.ForDisplay(raw));

    /// <summary>1588 같은 대표번호는 지역번호가 없다.</summary>
    [Theory]
    [InlineData("15881234", "1588-1234")]
    [InlineData("16441234", "1644-1234")]
    public void Representative_numbers_split_in_half(string raw, string expected)
        => Assert.Equal(expected, PhoneNumberFormat.ForDisplay(raw));

    /// <summary>내선과 긴급번호는 나누지 않는다. 나누면 오히려 못 알아본다.</summary>
    [Theory]
    [InlineData("1001")]
    [InlineData("119")]
    [InlineData("112")]
    [InlineData("114")]
    public void Short_numbers_are_left_alone(string raw)
        => Assert.Equal(raw, PhoneNumberFormat.ForDisplay(raw));

    /// <summary>사람이 이미 하이픈을 넣었어도 결과는 같아야 한다.</summary>
    [Fact]
    public void Separators_already_typed_do_not_change_the_result()
        => Assert.Equal("010-3462-3453", PhoneNumberFormat.ForDisplay(" 010-3462-3453 "));

    /// <summary>모르는 모양은 건드리지 않는다. 잘못 나누느니 원문이 낫다.</summary>
    [Theory]
    [InlineData("")]
    [InlineData("00821034623453")]
    [InlineData("abc")]
    public void An_unknown_shape_is_shown_as_it_came(string raw)
        => Assert.Equal(raw.Trim(), PhoneNumberFormat.ForDisplay(raw));
}
