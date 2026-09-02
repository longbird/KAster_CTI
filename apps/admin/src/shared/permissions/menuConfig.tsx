import {
  DashboardOutlined,
  FileTextOutlined,
  MonitorOutlined,
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
      { key: '/trends', label: '추이 분석' },
      { key: '/queues', label: '큐 현황' },
      { key: '/agents', label: '상담원 현황' },
      { key: '/monitoring/agents', label: '상담원 라이브 모니터' },
      { key: '/monitoring', label: '시스템 모니터링' },
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
      { key: '/reports/ivr-failures', label: 'IVR 실패' },
      { key: '/reports/logs', label: '호 로그' },
      { key: '/history', label: '통화 이력' },
    ],
  },
  {
    key: 'settings',
    icon: <SettingOutlined />,
    label: '운영 설정',
    children: [
      { key: '/settings/branches', label: '지사 관리' },
      { key: '/settings/agents', label: '상담원 설정' },
      { key: '/settings/agent-groups', label: '상담원 그룹' },
      { key: '/settings/queues', label: '호 분배룰 설정' },
      { key: '/settings/forwarding', label: '착신전환 설정' },
      { key: '/settings/holidays', label: '공휴일 설정' },
      { key: '/settings/outbound-rules', label: '아웃바운드 발신번호' },
      { key: '/settings/share-rules', label: '공유규칙 (호 분배)' },
      { key: '/settings/prompts', label: '멘트 관리' },
      { key: '/settings/sms-templates', label: '문자 템플릿 관리' },
      { key: '/settings/consult-categories', label: '상담분류 관리' },
      { key: '/settings/permissions', label: '권한 관리' },
      { key: '/announcements', label: '공지사항' },
      { key: '/numbers', label: 'DID / 내선' },
      { key: '/integrations', label: '연동' },
      { key: '/asterisk', label: 'PBX 설정' },
      { key: '/system', label: '시스템 설정' },
      { key: '/system/packet-capture', label: '패킷 캡처' },
    ],
  },
  {
    key: 'customers-group',
    icon: <TeamOutlined />,
    label: '고객 관리',
    children: [
      { key: '/customers', label: '고객 관리' },
      { key: '/opt-out-customers', label: '수신거부 고객 관리' },
      { key: '/blocklist', label: '블랙리스트 관리' },
    ],
  },
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

export function allGroupMenuKeys(items: MenuConfigItem[]): string[] {
  return items.flatMap((item) =>
    item.children?.length ? [item.key, ...allGroupMenuKeys(item.children)] : [],
  );
}

export function openMenuGroupKeysForPath(
  path: string,
  items: MenuConfigItem[] = ADMIN_MENU_CONFIG,
  ancestors: string[] = [],
): string[] {
  for (const item of items) {
    if (item.key === path) {
      return ancestors;
    }

    if (item.children?.length) {
      const hit = openMenuGroupKeysForPath(path, item.children, [...ancestors, item.key]);
      if (hit.length > 0 || item.children.some((child) => child.key === path)) {
        return hit;
      }
    }
  }

  return [];
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
