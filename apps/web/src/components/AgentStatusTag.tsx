import { DownOutlined } from '@ant-design/icons';
import { Dropdown, Tag } from 'antd';
import type { MenuProps } from 'antd';
import type { AgentStatusCode } from '../types/cti';
import { AGENT_META } from './statusMeta';

// 상담원이 직접 변경 가능한 상태만 노출. RINGING/TALKING/AFTER_CALL_WORK 는
// 시스템(AMI 이벤트)이 유도하는 상태라 수동 선택 금지.
const SELECTABLE_STATUSES: AgentStatusCode[] = [
  'AVAILABLE',
  'BREAK',
  'MEAL',
  'TRAINING',
  'MANUAL_PAUSED',
];

interface AgentStatusTagProps {
  status?: AgentStatusCode;
  onChange?: (next: AgentStatusCode) => void;
  size?: 'default' | 'small';
}

// HeaderBar 와 MiniShell 에서 공유하는 클릭 가능한 상태 태그.
// onChange 가 없으면 읽기 전용 Tag 로 렌더.
export function AgentStatusTag({ status, onChange, size = 'default' }: AgentStatusTagProps) {
  const current = status ?? 'MANUAL_PAUSED';
  const meta = AGENT_META[current];

  const menu: MenuProps = {
    items: SELECTABLE_STATUSES.map((s) => ({
      key: s,
      label: `${AGENT_META[s].label} (${s})`,
      disabled: s === current,
    })),
    onClick: ({ key }) => {
      onChange?.(key as AgentStatusCode);
    },
  };

  const tag = (
    <Tag
      color={meta.color}
      className={`!m-0 ${size === 'small' ? '!text-xs' : ''}`}
      style={{
        cursor: onChange ? 'pointer' : 'default',
        userSelect: 'none',
      }}
    >
      {current} {onChange && <DownOutlined className="text-[10px]" />}
    </Tag>
  );

  if (!onChange) return tag;
  return (
    <Dropdown menu={menu} trigger={['click']}>
      {tag}
    </Dropdown>
  );
}
