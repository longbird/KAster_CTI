import { DesktopOutlined, MoonOutlined, SunOutlined } from '@ant-design/icons';
import { Segmented } from 'antd';
import { useThemeStore, type ThemePref } from '../store/useThemeStore';

export function ThemeModeSwitch() {
  const pref = useThemeStore((state) => state.pref);
  const setPref = useThemeStore((state) => state.setPref);

  return (
    <Segmented
      className="theme-mode-switch"
      size="small"
      value={pref}
      onChange={(value) => setPref(value as ThemePref)}
      options={[
        { label: <span><DesktopOutlined /> 시스템</span>, value: 'system' },
        { label: <span><SunOutlined /> 라이트</span>, value: 'light' },
        { label: <span><MoonOutlined /> 다크</span>, value: 'dark' },
      ]}
    />
  );
}
