using System.Text;
using KAster.Desktop.Core.Storage;
using Xunit;

namespace KAster.Desktop.Tests.Storage;

public class TokenVaultTests : IDisposable
{
    private readonly string _path = Path.Combine(Path.GetTempPath(), $"kaster-vault-{Guid.NewGuid():N}.bin");

    [Fact]
    public void Round_trips_a_token_pair()
    {
        var vault = new TokenVault(_path);

        vault.Save(new TokenPair("access-abc", "refresh-xyz"));
        var loaded = vault.Load();

        Assert.Equal("access-abc", loaded!.AccessToken);
        Assert.Equal("refresh-xyz", loaded.RefreshToken);
    }

    [Fact]
    public void Does_not_write_the_token_in_clear_text()
    {
        var vault = new TokenVault(_path);

        vault.Save(new TokenPair("access-abc", "refresh-xyz"));
        var raw = Encoding.UTF8.GetString(File.ReadAllBytes(_path));

        Assert.DoesNotContain("refresh-xyz", raw);
    }

    [Fact]
    public void Clear_removes_the_file()
    {
        var vault = new TokenVault(_path);
        vault.Save(new TokenPair("a", "b"));

        vault.Clear();

        Assert.Null(vault.Load());
    }

    public void Dispose()
    {
        if (File.Exists(_path)) File.Delete(_path);
    }
}
