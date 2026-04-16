import { Button, Input, Space, Table, notification } from 'antd';
import { useEffect, useState } from 'react';
import { getAgentSip, syncAgentSip, updateAgentSipPassword } from '../api/asteriskConfigApi';
import type { AgentSipRow } from '../types/asterisk-config';

export function AgentSipTab() {
  const [rows, setRows] = useState<AgentSipRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [passwords, setPasswords] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    try {
      const data = await getAgentSip();
      setRows(data);
      setPasswords(Object.fromEntries(data.map(r => [r.agentId, r.sipPassword ?? ''])));
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const handlePasswordSave = async (agentId: string) => {
    try {
      await updateAgentSipPassword(agentId, passwords[agentId]);
      notification.success({ message: '비밀번호가 저장되었습니다' });
    } catch {
      notification.error({ message: '저장 실패' });
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await syncAgentSip();
      notification.success({ message: 'PJSIP 동기화 완료 (AMI reload 전송됨)' });
    } catch {
      notification.error({ message: '동기화 실패' });
    } finally { setSyncing(false); }
  };

  const columns = [
    { title: '내선번호', dataIndex: 'extension', width: 100 },
    { title: '상담원명', dataIndex: 'agentName' },
    {
      title: 'SIP 비밀번호',
      render: (_: unknown, row: AgentSipRow) => (
        <Space>
          <Input.Password
            value={passwords[row.agentId] ?? ''}
            onChange={e => setPasswords(prev => ({ ...prev, [row.agentId]: e.target.value }))}
            style={{ width: 180 }}
          />
          <Button size="small" onClick={() => handlePasswordSave(row.agentId)}>저장</Button>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Space style={{ marginBottom: 12 }}>
        <Button type="primary" loading={syncing} onClick={handleSync}>PJSIP 동기화 (전체 reload)</Button>
        <span style={{ color: '#888', fontSize: 12 }}>SIP 비밀번호가 비어있는 내선은 pjsip.conf에서 제외됩니다</span>
      </Space>
      <Table rowKey="agentId" dataSource={rows} columns={columns} loading={loading} pagination={false} size="small" />
    </>
  );
}
