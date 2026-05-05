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
      token: {
        colorPrimary: themeMode === 'dark' ? '#7aa2ff' : '#2563eb',
        colorBgBase: themeMode === 'dark' ? '#0f141c' : '#f8f9fa',
        colorTextBase: themeMode === 'dark' ? '#edf2ff' : '#191c1d',
        colorBorder: themeMode === 'dark' ? '#313948' : '#c3c5d7',
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
