import { Badge, Card, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { apiClient } from '../../shared/lib/apiClient';
import { BranchFilterSelect } from '../../shared/branches/BranchFilterSelect';
import { CallKanbanColumn } from '../../shared/components/CallKanbanColumn';
import { KANBAN_COLUMNS, groupByKanbanColumn } from '../../shared/lib/callStatusMap';
import { useNow } from '../../shared/hooks/useNow';
import { CallDetailDrawer, type CallRow } from './CallDetailDrawer';

export function LiveCallsPage() {
  const [rows, setRows] = useState<CallRow[]>([]);
  const [selected, setSelected] = useState<CallRow | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [branchId, setBranchId] = useState<string | undefined>(undefined);
  const now = useNow(1000);

  const load = async () => {
    try {
      const res = await apiClient.get('/calls/active', {
        params: branchId ? { branchId } : undefined,
      });
      setRows(res.data?.data ?? []);
      setLastUpdated(new Date());
    } catch {
      // keep previous data on error
    }
  };

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 3000);
    return () => window.clearInterval(timer);
  }, [branchId]);

  const grouped = useMemo(() => groupByKanbanColumn(rows), [rows]);

  return (
    <Card bodyStyle={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>통화 현황 조회</Typography.Title>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <BranchFilterSelect value={branchId} onChange={setBranchId} />
          <Typography.Text type="secondary">
            {lastUpdated ? `${lastUpdated.toLocaleTimeString()} 기준` : '로딩 중...'}&nbsp;
            <Badge status="processing" text="3초 갱신" />
          </Typography.Text>
        </div>
      </div>

      <div className="live-calls-page__summary">
        <div className="live-calls-page__summary-item">
          <span>활성</span><span className="value">{rows.length}</span>
        </div>
        {KANBAN_COLUMNS.map((col) => (
          <div key={col.id} className="live-calls-page__summary-item">
            <span>{col.label}</span>
            <span className="value" style={{ color: col.accentVar }}>{grouped[col.id].length}</span>
          </div>
        ))}
      </div>

      <div className="live-calls-page__kanban">
        {KANBAN_COLUMNS.map((col) => (
          <CallKanbanColumn
            key={col.id}
            column={col}
            items={grouped[col.id]}
            now={now}
            variant="full"
            onCardClick={setSelected}
          />
        ))}
      </div>

      <CallDetailDrawer
        call={selected}
        onClose={() => setSelected(null)}
        onHangup={() => void load()}
      />
    </Card>
  );
}
