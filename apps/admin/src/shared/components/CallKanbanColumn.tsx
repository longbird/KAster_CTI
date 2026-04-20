import { Typography } from 'antd';
import type { KanbanColumn, KanbanColumnMeta } from '../lib/callStatusMap';
import type { CallRow } from '../../features/live-calls/CallDetailDrawer';
import { CallCard } from './CallCard';

export interface CallKanbanColumnProps {
  column: KanbanColumnMeta;
  items: readonly CallRow[];
  now: number;
  variant?: 'mini' | 'full';
  onCardClick?: (call: CallRow) => void;
}

export function CallKanbanColumn({ column, items, now, variant = 'full', onCardClick }: CallKanbanColumnProps) {
  return (
    <div className={`call-kanban-column call-kanban-column--${variant}`}>
      <div className="call-kanban-column__header" style={{ borderTopColor: column.accentVar }}>
        <span className="call-kanban-column__label">{column.label}</span>
        <span className="call-kanban-column__count">{items.length}</span>
      </div>
      <div className="call-kanban-column__body">
        {items.length === 0 ? (
          <Typography.Text type="secondary" className="call-kanban-column__empty">
            {column.emptyText}
          </Typography.Text>
        ) : (
          items.map((call) => (
            <CallCard
              key={call.callId}
              call={call}
              now={now}
              variant={variant}
              onClick={onCardClick}
            />
          ))
        )}
      </div>
    </div>
  );
}

export type { KanbanColumn };
