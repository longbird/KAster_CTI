using System.Runtime.Versioning;
using Forms = System.Windows.Forms;

namespace KAster.Desktop.App.Services;

/// <summary>
/// 트레이 아이콘. <b>판정은 하지 않는다</b> — <see cref="TrayPresentation"/> 이 정한 것을 그리고,
/// <see cref="AlertDelivery"/> 가 정한 수단만 실행한다.
///
/// 창을 앞으로 끌어내는 길은 상담원이 <b>스스로 누른 경로</b>(더블클릭·메뉴·풍선 클릭)에만 있다.
/// 전화가 왔다고 창이 튀어나오면 하던 작업이 가려진다.
/// </summary>
[SupportedOSPlatform("windows")]
public sealed class TrayIconService : IDisposable
{
    /// <summary>풍선이 떠 있는 시간(ms). 큐가 물어보는 시간이 10초 남짓이라 그보다 짧을 이유가 없다.</summary>
    private const int BalloonMilliseconds = 10_000;

    private readonly Forms.NotifyIcon _icon = new();
    private readonly TrayIconArt _art;

    /// <summary>지금 그려 둔 것. 같은 값을 다시 밀어 넣어 아이콘을 매초 갈아 치우지 않는다.</summary>
    private TrayState? _shown;

    /// <param name="restore">상담원이 창을 불렀다. 최소화돼 있으면 되돌리고 앞으로 가져온다.</param>
    /// <param name="quit">트레이에서 종료. 로그아웃·정리는 조립 지점이 한다.</param>
    public TrayIconService(TrayIconArt art, Action restore, Action quit)
    {
        _art = art;

        var menu = new Forms.ContextMenuStrip();
        menu.Items.Add("창 열기", null, (_, _) => restore());
        menu.Items.Add(new Forms.ToolStripSeparator());
        menu.Items.Add("종료", null, (_, _) => quit());

        _icon.ContextMenuStrip = menu;
        _icon.DoubleClick += (_, _) => restore();

        // 풍선을 눌렀다는 것은 그 전화를 보러 가겠다는 뜻이다. 이것은 상담원이 부른 것이다.
        _icon.BalloonTipClicked += (_, _) => restore();

        _icon.Icon = _art.For(TrayStatus.Disconnected);
        _icon.Visible = true;
    }

    /// <summary>상태를 바꾼다. 1초 타이머가 매번 불러도 값이 그대로면 아무 일도 하지 않는다.</summary>
    public void Show(TrayState state)
    {
        if (_shown == state) return;

        _shown = state;
        _icon.Icon = _art.For(state.Status, state.Attention);

        // 툴팁은 63자를 넘기면 윈도우가 통째로 버린다. 잘라서라도 보여 준다.
        _icon.Text = state.Tooltip.Length > 63 ? state.Tooltip[..63] : state.Tooltip;
    }

    /// <summary>
    /// 풍선을 띄운다. 알릴지 말지는 <see cref="AlertDelivery"/> 가 이미 정했고 여기서는 그리기만 한다.
    /// </summary>
    public void Balloon(Alert alert)
        => _icon.ShowBalloonTip(BalloonMilliseconds, alert.Title, alert.Body, Forms.ToolTipIcon.Info);

    public void Dispose()
    {
        // Visible 을 안 내리면 프로세스가 죽어도 아이콘이 트레이에 남는다.
        _icon.Visible = false;
        _icon.ContextMenuStrip?.Dispose();
        _icon.Dispose();
        _art.Dispose();
    }
}
