import {
  DashboardOutlined,
  DesktopOutlined,
  FileTextOutlined,
  MonitorOutlined,
  NotificationOutlined,
  PhoneOutlined,
  SettingOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import type { ReactNode } from 'react';

export interface MenuConfigItem {
  key: string;
  label: string;
  icon?: ReactNode;
  children?: MenuConfigItem[];
}

export const ADMIN_MENU_CONFIG: MenuConfigItem[] = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: '대시보드' },
  {
    key: 'realtime',
    icon: <MonitorOutlined />,
    label: '실시간 운영',
    children: [
      { key: '/live-calls', label: '통화 현황 조회' },
      { key: '/kpi', label: '업무 현황 조회' },
    ],
  },
  {
    key: 'reports',
    icon: <FileTextOutlined />,
    label: '보고서',
    children: [
      { key: '/reports/calls', label: '통화내역 (CDR)' },
      { key: '/reports/missed', label: '미연결 콜' },
      { key: '/reports/recordings', label: '녹취 목록' },
      { key: '/reports/logs', label: '호 로그' },
    ],
  },
  {
    key: 'settings',
    icon: <SettingOutlined />,
    label: '운영 설정',
    children: [
      { key: '/settings/agents', label: '상담원 설정' },
      { key: '/settings/queues', label: '호 분배룰 설정' },
      { key: '/settings/forwarding', label: '착신전환 설정' },
      { key: '/settings/prompts', label: '멘트 관리' },
      { key: '/settings/branches', label: '지사 관리' },
      { key: '/settings/permissions', label: '권한 관리' },
    ],
  },
  { key: '/announcements', icon: <NotificationOutlined />, label: '공지사항' },
  { key: '/blocklist', icon: <PhoneOutlined />, label: '080 수신거부' },
  { key: '/system', icon: <DesktopOutlined />, label: '시스템 설정' },
  { key: '/queues', icon: <NotificationOutlined />, label: '큐 현황' },
  { key: '/agents', icon: <TeamOutlined />, label: '상담원 현황' },
  { key: '/monitoring', icon: <DesktopOutlined />, label: '시스템 모니터링' },
  { key: '/asterisk', icon: <SettingOutlined />, label: 'PBX 설정' },
];

export function pathToMenuKey(pathname: string) {
  return pathname.replace(/^\//, '') || 'dashboard';
}

export function menuKeyToPath(menuKey: string) {
  return menuKey.startsWith('/') ? menuKey : `/${menuKey}`;
}

export function filterMenuByAllowedPaths(items: MenuConfigItem[], allowedPaths: Set<string>): MenuConfigItem[] {
  return items
    .map((item) => {
      if (item.children?.length) {
        const children = filterMenuByAllowedPaths(item.children, allowedPaths);
        return children.length > 0 ? { ...item, children } : null;
      }
      return allowedPaths.has(item.key) ? item : null;
    })
    .filter((item): item is MenuConfigItem => item !== null);
}

export function allLeafMenuKeys(items: MenuConfigItem[]): string[] {
  return items.flatMap((item) => (item.children?.length ? allLeafMenuKeys(item.children) : [item.key]));
}

export function labelForMenuPath(path: string) {
  const walk = (items: MenuConfigItem[]): string | null => {
    for (const item of items) {
      if (item.key === path) return item.label;
      if (item.children?.length) {
        const hit = walk(item.children);
        if (hit) return hit;
      }
    }
    return null;
  };

  return walk(ADMIN_MENU_CONFIG) ?? path;
}
