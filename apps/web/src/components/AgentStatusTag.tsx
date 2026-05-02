import { Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import type { AgentStatusCode } from '../types/cti';

const SELECTABLE_STATUSES: AgentStatusCode[] = [
  'AVAILABLE',
  'BREAK',
  'MEAL',
  'TRAINING',
  'MANUAL_PAUSED',
];

const LABEL: Record<AgentStatusCode, { ko: string; en: string }> = {
  AVAILABLE:       { ko: '대기',      en: 'AVAILABLE' },
  RINGING:         { ko: '벨 울림',   en: 'RINGING' },
  TALKING:         { ko: '통화 중',   en: 'TALKING' },
  AFTER_CALL_WORK: { ko: '후처리',    en: 'ACW' },
  BREAK:           { ko: '휴식',      en: 'BREAK' },
  MEAL:            { ko: '식사',      en: 'MEAL' },
  TRAINING:        { ko: '교육',      en: 'TRAINING' },
  MANUAL_PAUSED:   { ko: '일시중지',  en: 'PAUSED' },
};

// v2 Operator — map each status to a --status-* token.
const TONE: Record<AgentStatusCode, { token: string; live?: boolean }> = {
  AVAILABLE:       { token: 'var(--status-available)', live: true },
  RINGING:         { token: 'var(--status-ringing)',   live: true },
  TALKING:         { token: 'var(--status-talking)',   live: true },
  AFTER_CALL_WORK: { token: 'var(--status-acw)' },
  BREAK:           { token: 'var(--status-break)' },
  MEAL:            { token: 'var(--accent-warn)' },
  TRAINING:        { token: 'var(--status-training)' },
  MANUAL_PAUSED:   { token: 'var(--status-offline)' },
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
      label: `${LABEL[s].ko} · ${LABEL[s].en}`,
      disabled: s === current,
    })),
    onClick: ({ key }) => {
      onChange?.(key as AgentStatusCode);
    },
  };

  const body = (
    <button
      type="button"
      className={`k-chip ${onChange ? 'cursor-pointer' : 'cursor-default'}`}
      style={{
        borderColor: tone.token,
        color: tone.token,
        background: 'transparent',
      }}
    >
      <span
        className={`k-dot ${tone.live ? 'k-dot-live' : ''}`}
        style={{ background: tone.token }}
      />
      <span className="text-[11px] font-semibold text-[var(--fg-1)]">{label.ko}</span>
      <span className="k-mono text-[9px] tracking-widest" style={{ color: tone.token }}>
        {label.en}
      </span>
      {onChange && (
        <span
          className="material-symbols-outlined text-[14px] text-[var(--fg-3)]"
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
