namespace KAster.Desktop.Softphone;

/// <summary>
/// 화면이 소프트폰에 시키는 일. 뷰모델이 하드웨어 없이 테스트될 수 있게 얇게 끊어 둔다.
/// </summary>
public interface ISoftphoneControl
{
    /// <summary>마이크 끄기. 회선은 그대로 두고 무음을 보낸다.</summary>
    bool IsMuted { get; set; }

    Task<bool> AnswerAsync();

    /// <summary>
    /// 통화 중에 키패드를 누른다. ARS 를 타고 들어간 곳에서 내선을 누르거나
    /// 인증번호를 넣을 때 쓴다. 통화 중이 아니면 아무 일도 하지 않는다.
    /// </summary>
    Task SendDigitAsync(char digit);

    void Hangup();
}
