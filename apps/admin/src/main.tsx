import React, { Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider, Spin } from 'antd';
import koKR from 'antd/locale/ko_KR';
import { RouterProvider } from 'react-router-dom';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import { router } from './app/router';
import { RequireAuth } from './pages/RequireAuth';
import { isPlatformPath } from './platform/isPlatformPath';
import { themeFor } from './shared/theme/antdTheme';
import { initThemeWatcher, useThemeStore } from './store/useThemeStore';
import './styles.css';

dayjs.locale('ko');

initThemeWatcher();

// 플랫폼 화면은 관리자 번들에 들어가지 않는다. 관리자가 gz 1.4MB 위에 쓰지도 않을
// 코드를 더 내려받지 않도록 진입점 하나만 지연 로드한다.
const PlatformApp = React.lazy(() => import('./platform/PlatformApp'));

function App() {
  const resolved = useThemeStore((s) => s.resolved);
  // 플랫폼 영역은 테넌트 관리자 로그인(RequireAuth) 밖에 있어야 한다 —
  // 관리자 토큰이 없어도 /platform/login 에 들어올 수 있어야 하기 때문이다.
  const platform = isPlatformPath(window.location.pathname);

  return (
    <ConfigProvider locale={koKR} theme={themeFor(resolved)}>
      {platform ? (
        <Suspense
          fallback={
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Spin size="large" />
            </div>
          }
        >
          <PlatformApp />
        </Suspense>
      ) : (
        <RequireAuth>
          <RouterProvider router={router} />
        </RequireAuth>
      )}
    </ConfigProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
