import type { ThemeConfig } from 'antd';
import { theme as antdTheme } from 'antd';

const baseToken = {
  colorPrimary: '#4ade80',
  colorInfo: '#60a5fa',
  colorSuccess: '#4ade80',
  colorWarning: '#fbbf24',
  colorError: '#f87171',
  borderRadius: 8,
  borderRadiusSM: 4,
  borderRadiusLG: 8,
  borderRadiusXS: 4,
  fontSize: 13,
  fontFamily:
    '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
  controlHeight: 30,
  controlHeightSM: 24,
  wireframe: true,
};

export const darkTheme: ThemeConfig = {
  algorithm: antdTheme.darkAlgorithm,
  token: {
    ...baseToken,
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
  },
  components: {
    Card: { headerFontSize: 14, headerBg: 'transparent' },
    Table: { headerBg: '#14161a', rowHoverBg: '#14161a' },
    Button: { primaryShadow: 'none', defaultShadow: 'none' },
    Menu: {
      itemBg: 'transparent',
      subMenuItemBg: 'transparent',
      itemSelectedBg: '#14161a',
      itemSelectedColor: '#4ade80',
    },
  },
};

export const lightTheme: ThemeConfig = {
  algorithm: antdTheme.defaultAlgorithm,
  token: {
    ...baseToken,
    colorPrimary: '#15803d',
    colorSuccess: '#15803d',
    colorBgBase: '#fafafa',
    colorBgLayout: '#fafafa',
    colorBgContainer: '#ffffff',
    colorBgElevated: '#ffffff',
    colorBorder: 'rgba(10,11,13,0.10)',
    colorBorderSecondary: 'rgba(10,11,13,0.06)',
    colorText: '#0a0b0d',
    colorTextSecondary: '#3f4149',
    colorTextTertiary: '#6b6f7a',
    colorTextQuaternary: '#9ea3ae',
  },
  components: {
    Card: { headerFontSize: 14, headerBg: 'transparent' },
    Table: { headerBg: '#f5f5f6', rowHoverBg: '#f5f5f6' },
    Button: { primaryShadow: 'none', defaultShadow: 'none' },
    Menu: {
      itemBg: 'transparent',
      subMenuItemBg: 'transparent',
      itemSelectedBg: '#eef7ef',
      itemSelectedColor: '#15803d',
    },
  },
};

export const appTheme = darkTheme;

export function themeFor(resolved: 'light' | 'dark'): ThemeConfig {
  return resolved === 'light' ? lightTheme : darkTheme;
}
