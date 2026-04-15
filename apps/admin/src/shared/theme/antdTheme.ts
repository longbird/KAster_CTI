import type { ThemeConfig } from 'antd';

export const appTheme: ThemeConfig = {
  token: {
    colorPrimary: '#1677ff',
    borderRadius: 12,
    colorBgLayout: '#f4f7fb',
    colorBgContainer: '#ffffff',
    fontFamily: 'Inter, Pretendard, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
  },
  components: {
    Card: {
      headerFontSize: 16,
    },
    Table: {
      headerBg: '#f8fafc',
    },
  },
};
