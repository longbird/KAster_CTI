import { Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import type { AgentStatusCode } from '../types/cti';

// 상담원이 직접 변경 가능한 상태만 노출. RINGING/TALKING/AFTER_CALL_WORK 는
// 시스템(AMI 이벤트)이 유도하는 상태라 수동 선택 금지.
const SELECTABLE_STATUSES: AgentStatusCode[] = [
  'AVAILABLE',
  'BREAK',
  'MEAL',
  'TRAINING',
  'MANUAL_PAUSED',
];

const LABEL: Record<AgentStatusCode, string> = {
  AVAILABLE: 'Available',
  RINGING: 'Ringing',
  TALKING: 'Talking',
  AFTER_CALL_WORK: 'ACW',
  BREAK: 'Break',
  MEAL: 'Meal',
  TRAINING: 'Training',
  MANUAL_PAUSED: 'Paused',
};

// 디자인 시스템의 색 매핑. dot + text color + bg tint.
const TONE: Record<AgentStatusCode, { dot: string; text: string; bg: string; pulse?: string }> = {
  AVAILABLE: { dot: 'bg-tertiary', text: 'text-tertiary', bg: 'bg-tertiary/10', pulse: 'pulse-available' },
  RINGING: { dot: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50' },
  TALKING: { dot: 'bg-primary', text: 'text-primary', bg: 'bg-primary/10' },
  AFTER_CALL_WORK: { dot: 'bg-secondary', text: 'text-secondary', bg: 'bg-surface-container-low' },
  BREAK: { dot: 'bg-error', text: 'text-error', bg: 'bg-error-container/30', pulse: 'pulse-busy' },
  MEAL: { dot: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50' },
  TRAINING: { dot: 'bg-sky-500', text: 'text-sky-700', bg: 'bg-sky-50' },
  MANUAL_PAUSED: { dot: 'bg-outline', text: 'text-on-surface-variant', bg: 'bg-surface-container' },
};

interface Props {
  status?: AgentStatusCode;
  onChange?: (next: AgentStatusCode) => void;
}

export function AgentStatusTag({ status, onChange }: Props) {
  const current = status ?? 'MANUAL_PAUSED';
  const tone = TONE[current];
  const label = LABEL[current];

  const menu: MenuProps = {
    items: SELECTABLE_STATUSES.map((s) => ({
      key: s,
      label: LABEL[s],
      disabled: s === current,
    })),
    onClick: ({ key }) => {
      onChange?.(key as AgentStatusCode);
    },
  };

  const body = (
    <button
      type="button"
      className={`inline-flex items-center gap-2 rounded-full border border-outline-variant/20 px-3 py-1.5 ${tone.bg} ${
        onChange ? 'cursor-pointer transition-transform hover:scale-105 active:scale-95' : 'cursor-default'
      }`}
    >
      <span className={`relative h-2 w-2 rounded-full ${tone.dot} ${tone.pulse ?? ''}`} />
      <span className={`font-label text-[11px] font-bold uppercase tracking-wider ${tone.text}`}>
        {label}
      </span>
      {onChange && (
        <span
          className="material-symbols-outlined text-[14px]"
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
