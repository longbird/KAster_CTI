namespace KAster.Desktop.Softphone;

/// <summary>
/// 화면이 소프트폰에 시키는 일. 뷰모델이 하드웨어 없이 테스트될 수 있게 얇게 끊어 둔다.
/// </summary>
public interface ISoftphoneControl
{
    /// <summary>마이크 끄기. 회선은 그대로 두고 무음을 보낸다.</summary>
    bool IsMuted { get; set; }

    Task<bool> AnswerAsync();

    void Hangup();
}
