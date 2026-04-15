// 백엔드 AllExceptionsFilter 가 내려주는 envelope 에서 사용자에게 보여줄
// 메시지를 안전하게 뽑는다. 형태:
//   { success:false, data:null, error: { code, message, details? } }
// 만약 envelope 이 아니거나 네트워크 에러면 err.message 로 폴백.
export function extractErrorMessage(err: any, fallback = '요청 처리 중 오류가 발생했습니다.'): string {
  const enveloped = err?.response?.data?.error?.message;
  if (enveloped) return enveloped;
  const flatMessage = err?.response?.data?.message;
  if (flatMessage) return flatMessage;
  if (err?.message) return err.message;
  return fallback;
}
