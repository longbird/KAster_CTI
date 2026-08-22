namespace KAster.Desktop.App.ViewModels;

/// <summary>
/// 돌려주기 화면이 지금 어느 단계인가.
///
/// 이 단계가 <b>순서를 강제한다</b>. 서버는 협의를 열지 않은 채 완료나 취소를 받으면 무조건
/// 400 을 던지므로, 눌러 놓고 오류를 보여 주는 대신 그 자리에서 버튼을 잠근다.
///
/// 단계 이름이 "요청" 과 "확인" 을 나눠 쓰는 이유는, 완료·취소가 feature code 를 DTMF 로
/// 넣는 방식이라 <b>서버조차 성공 여부를 모르기 때문</b>이다. 보낸 것과 된 것은 다른 단계다.
/// </summary>
public enum TransferStage
{
    /// <summary>화면이 닫혀 있다. 통화 화면에서 "돌려주기" 를 누르면 열린다.</summary>
    Closed,

    /// <summary>대상을 고르는 중. 바로 넘기기(blind)와 협의 걸기 둘 다 여기서 시작한다.</summary>
    ChoosingTarget,

    /// <summary>협의를 걸어 달라고 서버에 요청했고 아직 접수 답을 못 받았다.</summary>
    ConsultRequested,

    /// <summary>
    /// 서버가 협의를 접수했다 — 이제 완료와 취소를 받아 준다.
    /// <b>상대가 받았는지는 여기서 알 수 없다.</b> 서버가 협의 단계를 클라이언트에 보내지 않는다.
    /// </summary>
    Consulting,

    /// <summary>연결(완료)을 요청했고 PBX 가 먹었는지 기다리는 중.</summary>
    CompleteRequested,

    /// <summary>협의 취소를 요청했고 원 통화로 돌아오는지 기다리는 중.</summary>
    CancelRequested,
}
