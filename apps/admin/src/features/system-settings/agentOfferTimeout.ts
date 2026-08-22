/**
 * 상담원에게 "받으시겠습니까" 를 묻고 기다리는 시간의 허용 범위(초).
 *
 * 서버 `src/common/call-routing.constants.ts` 의
 * `MIN_AGENT_OFFER_TIMEOUT_SECONDS` / `MAX_AGENT_OFFER_TIMEOUT_SECONDS` 와 **같아야 한다.**
 * 여기가 더 넓으면 관리자가 저장한 값이 dialplan → AGI 를 타고 서버에 도착했을 때
 * 검증에 걸려 거부되고, AGI 는 실패하면 ACCEPT 로 열어버린다 —
 * 전 상담원이 묻지도 않고 자동 수락되어 수락/거절 기능이 통째로 무력화된다.
 *
 * 두 값이 갈리면 `agentOfferTimeout.test.ts` 가 서버 상수 파일을 직접 읽어 실패시킨다.
 */
export const AGENT_OFFER_TIMEOUT_MIN_SECONDS = 1;
export const AGENT_OFFER_TIMEOUT_MAX_SECONDS = 60;
