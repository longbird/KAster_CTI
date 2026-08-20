namespace KAster.Desktop.Core.Storage;

/// <summary>
/// 토큰 보관소. 실제 구현은 DPAPI 를 쓰는 <see cref="TokenVault"/> 이고,
/// 테스트는 디스크를 건드리지 않는 대역을 끼운다.
/// </summary>
public interface ITokenStore
{
    TokenPair? Load();
    void Save(TokenPair pair);
    void Clear();
}
