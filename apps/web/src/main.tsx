import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider, theme } from 'antd';
import koKR from 'antd/locale/ko_KR';
import App from './App';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={koKR}
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#4ade80',
          colorInfo: '#60a5fa',
          colorSuccess: '#4ade80',
          colorWarning: '#fbbf24',
          colorError: '#f87171',
          colorBgBase: '#0a0b0d',
          colorBgLayout: '#0a0b0d',
          colorBgContainer: '#0f1013',
          colorBgElevated: '#14161a',
          colorBorder: 'rgba(255,255,255,0.10)',
          colorBorderSecondary: 'rgba(255,255,255,0.06)',
          colorText: '#f5f6f7',
          colorTextSecondary: '#b7bcc4',
          colorTextTertiary: '#7b8290',
          colorTextQuaternary: '#4a5060',
          borderRadius: 8,
          borderRadiusSM: 4,
          borderRadiusLG: 8,
          borderRadiusXS: 4,
          fontSize: 13,
          fontFamily: '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
          controlHeight: 30,
          controlHeightSM: 24,
          wireframe: true,
        },
        components: {
          Button: { primaryShadow: 'none', defaultShadow: 'none' },
          Card: { headerBg: 'transparent' },
          Table: { headerBg: '#14161a' },
        },
      }}
    >
      <App />
    </ConfigProvider>
  </React.StrictMode>,
);
