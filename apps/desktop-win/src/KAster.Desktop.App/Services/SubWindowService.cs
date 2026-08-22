using System.Windows;
using System.Windows.Media;

namespace KAster.Desktop.App.Services;

/// <summary>
/// 서브 창 한 종류의 규격. 크기를 <see cref="WindowBounds"/> 의 <c>Sizes</c> 에 넣지 않는 이유는,
/// 그 표의 키가 <see cref="WindowMode"/> — 즉 <b>통화 단계</b>이기 때문이다. 서브 창은 통화 단계가
/// 아니므로 enum 을 늘리면 통화 상태 기계의 switch 마다 뜻 없는 가지가 생기고, 반대로 안 늘리고
/// 그 표를 쓰면 모르는 모드가 조용히 대기 크기(440×560)로 떨어지는 폴백에 걸린다.
/// </summary>
public sealed record SubWindowSpec(
    string Key,
    string Title,
    double Width,
    double Height,
    double MinWidth,
    double MinHeight);

/// <summary>
/// 서브 창을 띄우고 정리한다. 메인 화면은 고정하고 필요한 화면만 옆에 띄우기 위한 것이다.
///
/// 뷰모델은 이 서비스를 모른다 — 이 코드베이스에서 창을 만지는 일은 <c>MainWindow</c> 만 한다.
/// </summary>
public sealed class SubWindowService
{
    private readonly Window _owner;
    private readonly SubWindowLedger<Window> _ledger = new();

    public SubWindowService(Window owner) => _owner = owner;

    public int OpenCount => _ledger.Count;

    /// <summary>이미 열려 있으면 그 창을 앞으로 가져오고, 없으면 만든다.</summary>
    /// <param name="createContent">
    /// 창이 없을 때만 불린다. 이미 열려 있는데 화면과 뷰모델을 새로 만들면 상담원이 보고 있던
    /// 창은 옛 뷰모델을 든 채 남고, 새로 만든 쪽에만 값이 들어간다.
    /// </param>
    /// <param name="onClosed">
    /// 창이 실제로 닫힌 뒤에 불린다. <b>상담원이 제목 표시줄 X 로 닫은 경로도 여기를 지난다</b> —
    /// 화면 안쪽 닫기 버튼만 듣고 있으면, X 로 닫은 창의 주기 조회가 아무도 안 보는 채로 계속 돈다.
    /// 이미 열려 있는 창을 다시 요청한 경우에는 걸지 않는다 — 두 번 걸면 한 번 닫을 때 두 번 불린다.
    /// </param>
    public void Open(SubWindowSpec spec, Func<object> createContent, Action? onClosed = null)
        => _ledger.OpenOrSurface(spec.Key, () => Create(spec, createContent(), onClosed), Surface);

    /// <summary>화면 안쪽 버튼으로 닫는 경로. 창의 Closed 가 장부에서 자기를 지운다.</summary>
    public void Close(string key)
    {
        if (_ledger.TryGet(key, out var window)) window!.Close();
    }

    /// <summary>
    /// 로그아웃과 종료에서 부른다. 안 부르면 로그아웃한 뒤에도 앞 상담원의 화면이 떠 있다.
    /// </summary>
    public void CloseAll()
    {
        foreach (var window in _ledger.Drain()) window.Close();
    }

    private Window Create(SubWindowSpec spec, object content, Action? onClosed)
    {
        var window = new Window
        {
            Title = spec.Title,
            Content = content,

            // Owner 를 안 걸면 메인 창을 닫아도 이 창이 남아 프로세스가 죽지 않는다.
            // 종료 처리는 MainWindow.Closed → ShutdownAsync 하나뿐이라 그 경로가 영영 안 돈다.
            Owner = _owner,

            // 서브 창이 작업 표시줄에 따로 뜨면 상담원이 그것을 앱 본체로 착각해 거기서 닫는다.
            ShowInTaskbar = false,

            WindowStartupLocation = WindowStartupLocation.Manual,
            Width = spec.Width,
            Height = spec.Height,
            MinWidth = spec.MinWidth,
            MinHeight = spec.MinHeight,
        };

        // 테마는 App.xaml 이 앱 레벨에 머지해 둔 Tokens.xaml 에서 그대로 온다.
        if (_owner.TryFindResource("FontUi") is FontFamily font) window.FontFamily = font;
        if (_owner.TryFindResource("BrushBackground") is Brush background) window.Background = background;

        var at = SubWindowPlacement.For(
            CurrentWorkArea(), CurrentOwnerBounds(), spec.Width, spec.Height, _ledger.Count);
        window.Left = at.Left;
        window.Top = at.Top;

        // 상담원이 X 로 닫은 창을 장부에 남겨 두면 그 창은 영영 다시 안 열린다.
        // 장부를 먼저 비운다 — onClosed 가 뷰모델을 닫으면 그쪽이 다시 이 창을 닫으러 온다.
        window.Closed += (_, _) =>
        {
            _ledger.Forget(spec.Key);
            onClosed?.Invoke();
        };

        window.Show();
        return window;
    }

    private static void Surface(Window window)
    {
        if (window.WindowState == WindowState.Minimized) window.WindowState = WindowState.Normal;
        window.Activate();
    }

    private WorkArea CurrentWorkArea()
    {
        var area = SystemParameters.WorkArea;
        return new WorkArea(area.Left, area.Top, area.Width, area.Height);
    }

    /// <summary>
    /// 최소화·최대화 중에는 <c>Left</c>/<c>Top</c> 이 화면 밖 값(-32000)이라 서브 창이 보이지 않는
    /// 곳에 뜬다. 복원 위치는 어느 상태에서든 실제 자리를 말한다.
    /// </summary>
    private OwnerBounds CurrentOwnerBounds()
    {
        var restore = _owner.RestoreBounds;

        return restore.IsEmpty
            ? new OwnerBounds(_owner.Left, _owner.Top, _owner.Width, _owner.Height)
            : new OwnerBounds(restore.Left, restore.Top, restore.Width, restore.Height);
    }
}
