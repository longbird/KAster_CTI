using System.Runtime.Versioning;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using KAster.Desktop.Core.Serialization;

namespace KAster.Desktop.Core.Storage;

public sealed record TokenPair(string AccessToken, string RefreshToken);

/// <summary>
/// 토큰을 DPAPI(현재 사용자 범위)로 암호화해 보관한다. 다른 계정이 파일을 가져가도 풀 수 없다.
/// </summary>
[SupportedOSPlatform("windows")]
public sealed class TokenVault
{
    private static readonly byte[] Entropy = Encoding.UTF8.GetBytes("KAster.Desktop.TokenVault.v1");
    private readonly string _path;
    private readonly object _gate = new();

    public TokenVault(string path) => _path = path;

    public void Save(TokenPair pair)
    {
        lock (_gate)
        {
            var dir = Path.GetDirectoryName(_path);
            if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);

            var plain = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(pair, JsonDefaults.Options));
            var cipher = ProtectedData.Protect(plain, Entropy, DataProtectionScope.CurrentUser);
            File.WriteAllBytes(_path, cipher);
        }
    }

    public TokenPair? Load()
    {
        lock (_gate)
        {
            try
            {
                if (!File.Exists(_path)) return null;
                var plain = ProtectedData.Unprotect(File.ReadAllBytes(_path), Entropy, DataProtectionScope.CurrentUser);
                return JsonSerializer.Deserialize<TokenPair>(plain, JsonDefaults.Options);
            }
            catch (Exception ex) when (ex is CryptographicException or IOException or JsonException)
            {
                // 다른 계정에서 만든 파일이거나 깨진 경우. 재로그인으로 보낸다.
                return null;
            }
        }
    }

    public void Clear()
    {
        lock (_gate)
        {
            if (File.Exists(_path)) File.Delete(_path);
        }
    }
}
