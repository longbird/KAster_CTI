namespace KAster.Desktop.Core.Storage;

/// <summary>
/// 다음 로그인 때 미리 채워 둘 값.
///
/// <b>비밀번호는 여기 넣지 않는다.</b> 아이디와 내선은 비밀이 아니지만 비밀번호는 비밀이고,
/// 이 파일은 평문이다. 상담원이 매번 다시 치는 것은 비밀번호 하나뿐이어야 한다.
/// </summary>
public sealed record SavedLogin
{
    public bool Remember { get; init; }
    public string LoginId { get; init; } = string.Empty;
    public string Extension { get; init; } = string.Empty;

    /// <summary>
    /// 이 PC 가 소프트폰으로 통화하는지. 기본은 <b>실기기 모드</b>(false) — 책상 전화기가 통화를 맡는다.
    /// 자리에 전화기가 있는지 없는지는 잘 바뀌지 않으므로 "아이디 저장" 과 무관하게 기억한다.
    /// </summary>
    public bool UseSoftphone { get; init; }

    /// <summary>
    /// 다음에 앱을 켤 때 지난 세션으로 그냥 들어갈지.
    ///
    /// <b>이 값이 켜져도 비밀번호는 저장되지 않는다.</b> 복구에 쓰는 것은 금고에 이미 들어 있는
    /// refresh token 이며, 그것은 DPAPI 로 이 Windows 계정에만 풀리게 묶여 있다. 그래서 이 파일이
    /// 평문이어도 여기 적힌 것은 "그렇게 해도 된다" 는 표시뿐이고, 들고 갈 수 있는 비밀이 아니다.
    ///
    /// 로그아웃하면 금고가 비므로 이 값과 무관하게 다시 물어본다 — 자리를 넘긴 뒤에
    /// 다음 사람이 앞사람 계정으로 들어가면 안 된다.
    /// </summary>
    public bool AutoSignIn { get; init; }
}

/// <summary>
/// 저장 자리. 인터페이스로 끊어 두면 테스트가 실제 사용자 설정 파일을 건드리지 않는다.
/// </summary>
public interface ISavedLoginStore
{
    SavedLogin Load();

    void Save(SavedLogin value);
}

/// <summary>파일에 두는 기본 구현.</summary>
public sealed class SavedLoginStore : ISavedLoginStore
{
    private readonly JsonSettingsStore<SavedLogin> _store;

    public SavedLoginStore(string path) => _store = new JsonSettingsStore<SavedLogin>(path);

    public SavedLogin Load() => _store.Load(new SavedLogin());

    public void Save(SavedLogin value) => _store.Save(value);
}
