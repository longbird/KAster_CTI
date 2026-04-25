import { Tag, Tooltip, Typography } from 'antd';
import type { CSSProperties, MouseEvent } from 'react';
import type { CallRow } from '../../features/live-calls/CallDetailDrawer';
import { toKanbanColumn, KANBAN_COLUMNS } from '../lib/callStatusMap';
import { formatElapsed, secondsSince } from '../hooks/useNow';
import { formatPhoneNumber } from '../lib/format';

const TRANSFER_PHASE_LABEL: Record<string, string> = {
  REQUESTED: '요청됨',
  CONSULT_RINGING: '협의 호출',
  CONSULT_TALKING: '협의 통화',
  REBRIDGING: '재연결 중',
  COMPLETED: '완료',
  FAILED: '실패',
  EXPIRED: '만료',
};

const TRANSFER_PHASE_COLOR: Record<string, string> = {
  REQUESTED: 'default',
  CONSULT_RINGING: 'gold',
  CONSULT_TALKING: 'blue',
  REBRIDGING: 'cyan',
  COMPLETED: 'green',
  FAILED: 'red',
  EXPIRED: 'orange',
};

function borderColorForElapsed(seconds: number): string {
  if (seconds <= 30) return '#10b981';
  if (seconds <= 60) return '#f59e0b';
  return '#f5222d';
}

function elapsedForCard(call: CallRow, now: number): number {
  const col = toKanbanColumn(call.sessionStatus);
  if (col === 'talking' && call.answeredAt) return secondsSince(call.answeredAt, now);
  if (col === 'queued' && call.queuedAt) return secondsSince(call.queuedAt, now);
  if (col === 'ringing' && call.queuedAt) return secondsSince(call.queuedAt, now);
  return call.talkSeconds ?? call.waitSeconds ?? 0;
}

export interface CallCardProps {
  call: CallRow;
  now: number;
  variant?: 'mini' | 'full';
  onClick?: (call: CallRow) => void;
}

export function CallCard({ call, now, variant = 'full', onClick }: CallCardProps) {
  const col = toKanbanColumn(call.sessionStatus);
  const colMeta = KANBAN_COLUMNS.find((c) => c.id === col)!;
  const elapsed = elapsedForCard(call, now);
  const borderColor = col === 'acw' ? colMeta.accentVar : borderColorForElapsed(elapsed);
  const transferPhase = call.latestTransfer?.phase;

  const handleClick = (e: MouseEvent) => {
    e.stopPropagation();
    onClick?.(call);
  };

  const style: CSSProperties = {
    borderLeft: `3px solid ${borderColor}`,
  };

  if (variant === 'mini') {
    return (
      <div className="call-card call-card--mini" style={style} onClick={handleClick}>
        <div className="call-card__row">
          <Typography.Text strong className="call-card__ani">{formatPhoneNumber(call.ani)}</Typography.Text>
          <Typography.Text className="call-card__elapsed">{formatElapsed(elapsed)}</Typography.Text>
        </div>
        <Typography.Text type="secondary" className="call-card__sub">
          {call.agentName || call.primaryAgentId || call.queueName || '-'}
        </Typography.Text>
        {transferPhase ? (
          <Tag color={TRANSFER_PHASE_COLOR[transferPhase] ?? 'default'} style={{ marginTop: 4 }}>
            {TRANSFER_PHASE_LABEL[transferPhase] ?? transferPhase}
          </Tag>
        ) : null}
      </div>
    );
  }

  return (
    <div className="call-card call-card--full" style={style} onClick={handleClick}>
      <div className="call-card__row">
        <Tooltip title={`Linked ${call.linkedid}`}>
          <Typography.Text strong className="call-card__ani">{formatPhoneNumber(call.ani)}</Typography.Text>
        </Tooltip>
        <Typography.Text className="call-card__elapsed">{formatElapsed(elapsed)}</Typography.Text>
      </div>
      <div className="call-card__meta">
        <Typography.Text type="secondary">
          {call.queueName ?? '-'}
        </Typography.Text>
        <Typography.Text type="secondary">
          {call.agentName || call.primaryAgentId || '미배정'}
        </Typography.Text>
      </div>
      {call.representativeNumber || call.didNumber || call.dnis ? (
        <Typography.Text type="secondary" className="call-card__did">
          {formatPhoneNumber(call.representativeNumber ?? call.didNumber ?? call.dnis)}
        </Typography.Text>
      ) : null}
      {transferPhase ? (
        <Tag color={TRANSFER_PHASE_COLOR[transferPhase] ?? 'default'} style={{ marginTop: 4 }}>
          {TRANSFER_PHASE_LABEL[transferPhase] ?? transferPhase}
          {call.latestTransfer?.toExtension ? ` · ${call.latestTransfer.toExtension}` : ''}
        </Tag>
      ) : null}
    </div>
  );
}
