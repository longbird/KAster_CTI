/**
 * 서버가 준 메시지를 화면에 그대로 보여주기 위한 추출기.
 *
 * 자격 변경은 서버가 이유를 붙여 거부한다 (되돌릴 수 없는 기능 끄기 409, 확인 없는 켜기 400).
 * 그 이유를 "저장하지 못했습니다" 로 덮어버리면 운영자가 무엇을 잘못했는지 알 수 없다.
 * 그래서 서버 메시지가 있으면 항상 그것을 먼저 쓴다.
 */
export function serverErrorMessage(error: unknown, fallback: string): string {
  const message = (error as { response?: { data?: { error?: { message?: unknown } } } })?.response?.data?.error
    ?.message;
  if (typeof message === 'string' && message.trim().length > 0) return message;

  const axiosMessage = (error as { message?: unknown })?.message;
  if (typeof axiosMessage === 'string' && axiosMessage.trim().length > 0) return axiosMessage;

  return fallback;
}
