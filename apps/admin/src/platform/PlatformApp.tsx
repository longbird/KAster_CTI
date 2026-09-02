import { RouterProvider } from 'react-router-dom';
import { platformRouter } from './platformRouter';

/**
 * 플랫폼 영역의 진입점. `main.tsx` 가 이 모듈 하나만 `React.lazy` 로 불러오므로
 * 플랫폼 화면·API·스토어가 통째로 별도 청크가 된다 — `/platform` 에 들어오지 않는
 * 일반 관리자는 이 코드를 내려받지 않는다.
 */
export default function PlatformApp() {
  return <RouterProvider router={platformRouter} />;
}
