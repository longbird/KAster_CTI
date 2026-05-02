import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider } from 'antd';
import koKR from 'antd/locale/ko_KR';
import { RouterProvider } from 'react-router-dom';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import { router } from './app/router';
import { RequireAuth } from './pages/RequireAuth';
import { themeFor } from './shared/theme/antdTheme';
import { initThemeWatcher, useThemeStore } from './store/useThemeStore';
import './styles.css';

dayjs.locale('ko');

initThemeWatcher();

function App() {
  const resolved = useThemeStore((s) => s.resolved);
  return (
    <ConfigProvider locale={koKR} theme={themeFor(resolved)}>
      <RequireAuth>
        <RouterProvider router={router} />
      </RequireAuth>
    </ConfigProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
