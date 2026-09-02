import React, { useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider, theme } from 'antd';
import koKR from 'antd/locale/ko_KR';
import App from './App';
import './styles/index.css';
import { useUiStore } from './store/useUiStore';

function RootProviders() {
  const themeMode = useUiStore((s) => s.themeMode);

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    document.documentElement.classList.toggle('dark', themeMode === 'dark');
  }, [themeMode]);

  const themeConfig = useMemo(
    () => ({
      algorithm: themeMode === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
      // 이 값들은 styles/index.css 의 토큰과 같아야 한다. 예전에는 여기만 파랑(#2563eb ·
      // #7aa2ff)이라, 같은 화면에서 antd 컴포넌트만 다른 브랜드 색으로 떴다.
      // colorSuccess ~ colorError 는 --tone-* 와 짝이다.
      token: {
        colorPrimary: themeMode === 'dark' ? '#34d399' : '#047857',
        colorSuccess: themeMode === 'dark' ? '#34d399' : '#047857',
        colorInfo: themeMode === 'dark' ? '#58a6ff' : '#2563eb',
        colorWarning: themeMode === 'dark' ? '#d29922' : '#b45309',
        colorError: themeMode === 'dark' ? '#f85149' : '#ba1a1a',
        colorBgBase: themeMode === 'dark' ? '#0d1117' : '#f8f9fa',
        colorTextBase: themeMode === 'dark' ? '#e6edf3' : '#191c1d',
        colorBorder: themeMode === 'dark' ? '#30363d' : '#c3c5d7',
        borderRadius: 12,
        fontSize: 14,
      },
    }),
    [themeMode],
  );

  return (
    <ConfigProvider locale={koKR} theme={themeConfig}>
      <App />
    </ConfigProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RootProviders />
  </React.StrictMode>,
);
