using System.IO;
using KAster.Desktop.App.Services;
using Xunit;

namespace KAster.Desktop.Tests.App;

public class AppPathsTests
{
    [Fact]
    public void Keeps_everything_under_the_user_folder_by_default()
    {
        var root = AppPaths.ResolveRoot(null, @"C:\Users\someone\AppData\Local");

        Assert.Equal(@"C:\Users\someone\AppData\Local\KAsterCti", root);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Ignores_an_empty_profile_so_a_blank_variable_cannot_scatter_files(string profile)
    {
        var root = AppPaths.ResolveRoot(profile, @"C:\Users\someone\AppData\Local");

        Assert.Equal(@"C:\Users\someone\AppData\Local\KAsterCti", root);
    }

    // 한 PC 에서 상담원 둘을 띄워 시험할 때 쓴다. 토큰 보관소가 한 파일이면
    // 두 앱이 서로의 토큰을 덮어써서 한쪽이 남의 계정으로 요청을 보낸다.
    [Fact]
    public void Puts_a_named_profile_in_its_own_folder()
    {
        var root = AppPaths.ResolveRoot("agent1002", @"C:\Users\someone\AppData\Local");

        Assert.Equal(Path.Combine(@"C:\Users\someone\AppData\Local\KAsterCti", "profiles", "agent1002"), root);
    }

    // 프로필 이름은 사람이 명령줄에 적는 값이다. 경로 조각이 들어오면
    // 설정과 토큰이 엉뚱한 디렉터리에 놓인다.
    [Theory]
    [InlineData(@"..\..\elsewhere")]
    [InlineData("a/b")]
    [InlineData(@"C:\somewhere")]
    public void Refuses_a_profile_name_that_walks_out_of_the_folder(string profile)
    {
        Assert.Throws<System.ArgumentException>(() => AppPaths.ResolveRoot(profile, @"C:\Users\someone\AppData\Local"));
    }
}
