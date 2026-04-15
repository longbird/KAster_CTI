import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider } from 'antd';
import koKR from 'antd/locale/ko_KR';
import { RouterProvider } from 'react-router-dom';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import { router } from './app/router';
import { RequireAuth } from './pages/RequireAuth';
import { appTheme } from './shared/theme/antdTheme';
import './styles.css';

dayjs.locale('ko');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider locale={koKR} theme={appTheme}>
      <RequireAuth>
        <RouterProvider router={router} />
      </RequireAuth>
    </ConfigProvider>
  </React.StrictMode>,
);
