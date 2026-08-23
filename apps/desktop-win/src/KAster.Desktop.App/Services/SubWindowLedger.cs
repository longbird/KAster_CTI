namespace KAster.Desktop.App.Services;

/// <summary>
/// 열려 있는 서브 창 장부. 창 형식을 모르는 채로 다루므로 WPF 없이 테스트한다 —
/// "두 번 열지 않는다" 와 "로그아웃하면 다 닫는다" 는 창을 띄우지 않고 확인할 수 있어야 한다.
/// </summary>
public sealed class SubWindowLedger<TWindow>
    where TWindow : class
{
    private readonly Dictionary<string, TWindow> _open = new(StringComparer.Ordinal);

    public int Count => _open.Count;

    /// <summary>지금 열려 있는 창들. 테마가 바뀌면 이미 뜬 창에도 적용해야 한다.</summary>
    public IEnumerable<TWindow> Open => _open.Values.ToArray();

    /// <summary>
    /// 없으면 만들고, 있으면 그 창을 앞으로 가져온다. 두 번 만들면 뒤엣것만 갱신되고
    /// 앞엣것은 옛 값을 든 채 화면에 남는다.
    /// </summary>
    public TWindow OpenOrSurface(string key, Func<TWindow> create, Action<TWindow> surface)
    {
        if (_open.TryGetValue(key, out var existing))
        {
            surface(existing);
            return existing;
        }

        var created = create();
        _open[key] = created;
        return created;
    }

    /// <summary>화면 안쪽 버튼으로 특정 창을 닫는 경로에서 쓴다.</summary>
    public bool TryGet(string key, out TWindow? window) => _open.TryGetValue(key, out window);

    /// <summary>창이 스스로 닫혔다. 장부에 남겨 두면 그 창은 영영 다시 안 열린다.</summary>
    public void Forget(string key) => _open.Remove(key);

    /// <summary>
    /// 열린 창을 모두 넘기고 장부를 비운다. 창을 닫으면 그 창의 Closed 처리기가 같은 장부에서
    /// 자기를 지우므로, 장부를 돌면서 닫으면 그 자리에서 컬렉션이 바뀌어 터진다.
    /// </summary>
    public IReadOnlyList<TWindow> Drain()
    {
        var all = _open.Values.ToArray();
        _open.Clear();
        return all;
    }
}
