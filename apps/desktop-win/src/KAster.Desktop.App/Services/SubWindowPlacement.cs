namespace KAster.Desktop.App.Services;

/// <summary>서브 창을 띄우는 순간의 메인 창 자리.</summary>
public sealed record OwnerBounds(double Left, double Top, double Width, double Height);

/// <summary>
/// 서브 창을 어디에 띄울지 정한다. <see cref="WindowBounds"/> 와 같은 이유로 순수 함수다 —
/// WPF 타입을 쓰면 이 계산을 확인할 방법이 없다.
///
/// 메인 창 위에 겹쳐 띄우면 서브 창을 여는 순간 통화 화면이 가려져 상담원이 울리는 전화를
/// 못 본다. 그래서 옆에 세우고, 옆이 없으면 그때만 겹친다.
/// </summary>
public static class SubWindowPlacement
{
    /// <summary>메인 창과 서브 창 사이 틈. 붙여 놓으면 두 창의 경계가 안 보인다.</summary>
    private const double Gap = 12;

    /// <summary>겹칠 수밖에 없을 때 미는 양. 제목 표시줄이 보일 만큼만 민다.</summary>
    private const double CascadeStep = 28;

    /// <param name="alreadyOpen">이미 열려 있는 서브 창 수. 새 창이 그것들과 정확히 포개지지 않게 한다.</param>
    public static WindowPosition For(
        WorkArea screen,
        OwnerBounds owner,
        double width,
        double height,
        int alreadyOpen)
    {
        var left = HorizontalStart(screen, owner, width, alreadyOpen);
        var top = owner.Top + (CascadeStep * alreadyOpen);

        return Clamp(screen, width, height, left, top);
    }

    private static double HorizontalStart(WorkArea screen, OwnerBounds owner, double width, int alreadyOpen)
    {
        var right = owner.Left + owner.Width + Gap;
        if (right + width <= screen.Left + screen.Width) return right;

        var left = owner.Left - Gap - width;
        if (left >= screen.Left) return left;

        // 양옆에 자리가 없다. 겹치되 메인 창 제목 표시줄은 남긴다.
        return owner.Left + (CascadeStep * (alreadyOpen + 1));
    }

    /// <summary>작업 영역 밖으로 나간 창을 안으로 당긴다. 규칙은 <see cref="WindowBounds"/> 와 같다.</summary>
    private static WindowPosition Clamp(WorkArea screen, double width, double height, double left, double top)
    {
        var maxLeft = screen.Left + screen.Width - width;
        var maxTop = screen.Top + screen.Height - height;

        // 작업 영역이 창보다 작으면 오른쪽 한계가 왼쪽 한계보다 앞선다. 이때는 왼쪽 위에 붙인다.
        return new WindowPosition(
            maxLeft < screen.Left ? screen.Left : Math.Clamp(left, screen.Left, maxLeft),
            maxTop < screen.Top ? screen.Top : Math.Clamp(top, screen.Top, maxTop));
    }
}
