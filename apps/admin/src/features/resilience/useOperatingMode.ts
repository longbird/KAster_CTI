import { useHealthData } from '../monitoring/hooks/useHealthData';
import { toOperatingModeView, type OperatingModeView } from './operatingMode';

/**
 * 전역 배너와 설정 저장 버튼 잠금이 같은 출처를 보게 한다.
 *
 * 폴링 주기를 30초로 둔 이유: 이 훅은 관리자 앱 전체에서 항상 살아 있다. 모니터링
 * 화면의 10초 주기를 그대로 쓰면 모든 화면이 상시 폴링하게 된다. 장애 배너가 20초
 * 늦게 뜨는 것은 감수할 만하다.
 */
export function useOperatingMode(intervalMs = 30_000): OperatingModeView {
  const { data } = useHealthData({ intervalMs });
  return toOperatingModeView(data);
}
