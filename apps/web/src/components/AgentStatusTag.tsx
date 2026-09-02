import { Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import type { AgentStatusCode } from '../types/cti';
import { AGENT_META, toneColor, toneStyle } from './statusMeta';

// 상담원이 직접 변경 가능한 상태만 노출. RINGING/TALKING/AFTER_CALL_WORK 는
// 시스템(AMI 이벤트)이 유도하는 상태라 수동 선택 금지.
const SELECTABLE_STATUSES: AgentStatusCode[] = [
  'AVAILABLE',
  'BREAK',
  'MEAL',
  'TRAINING',
  'MANUAL_PAUSED',
];

const ANIMATED: Set<AgentStatusCode> = new Set(['AVAILABLE', 'TALKING', 'RINGING']);

interface Props {
  status?: AgentStatusCode;
  onChange?: (next: AgentStatusCode) => void;
}

export function AgentStatusTag({ status, onChange }: Props) {
  const current: AgentStatusCode = status ?? 'MANUAL_PAUSED';
  const meta = AGENT_META[current];
  const label = meta.label;

  const menu: MenuProps = {
    items: SELECTABLE_STATUSES.map((s) => ({
      key: s,
      label: AGENT_META[s].label,
      disabled: s === current,
    })),
    onClick: ({ key }) => {
      onChange?.(key as AgentStatusCode);
    },
  };

  const body = (
    <button
      type="button"
      aria-label="상태 변경"
      className={`flex items-center gap-2 rounded-full px-3 py-1 text-caption font-semibold transition-colors${
        onChange ? ' cursor-pointer hover:scale-105 active:scale-95' : ' cursor-default'
      }`}
      style={toneStyle(meta.tone)}
    >
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: toneColor(meta.tone), animation: ANIMATED.has(current) ? 'pulse 2s infinite' : undefined }}
      />
      {label}
      {onChange && (
        <span
          className="material-symbols-outlined text-sm"
          style={{ fontVariationSettings: "'wght' 500" }}
        >
          expand_more
        </span>
      )}
    </button>
  );

  if (!onChange) return body;
  return (
    <Dropdown menu={menu} trigger={['click']}>
      {body}
    </Dropdown>
  );
}
