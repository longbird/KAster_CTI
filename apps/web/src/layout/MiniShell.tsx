import { Card, Space, Spin, Tag, Typography } from 'antd';
import { useEffect, useMemo } from 'react';
import { ActionPanel } from '../components/ActionPanel';
import { ModeSwitch } from '../components/ModeSwitch';
import { useCtiStore } from '../store/useCtiStore';

// conv 13 Mini 모드 와이어프레임 요약:
//   - 항상 위 작은 창
//   - 콜 제어 버튼 중심, 고객 핵심 정보만
//   - 상세 이력/팝업은 없음
// 너비는 약 380px 을 기준으로 컴포넌트를 재배치한다.
export function MiniShell() {
  const {
    loading,
    agentSession,
    activeCalls,
    selectedCallId,
    init,
    saveMemo,
    transfer,
    hangup,
  } = useCtiStore();

  useEffect(() => {
    void init();
  }, [init]);

  const selectedCall = useMemo(
    () => activeCalls.find((call) => call.callId === selectedCallId),
    [activeCalls, selectedCallId],
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Spin />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[420px] p-3">
      <Card
        size="small"
        className="shadow-panel"
        title={
          <Space className="w-full justify-between">
            <span className="text-xs text-slate-500">KAster CTI</span>
            <ModeSwitch />
          </Space>
        }
      >
        <Space direction="vertical" size={8} className="w-full">
          <div className="flex items-center justify-between">
            <div>
              <Typography.Text strong>{agentSession?.agentName ?? '-'}</Typography.Text>
              <div className="text-xs text-slate-500">내선 {agentSession?.extension ?? '-'}</div>
            </div>
            <Tag color={agentSession?.statusCode === 'TALKING' ? 'green' : 'blue'}>
              {agentSession?.statusCode ?? '-'}
            </Tag>
          </div>

          <Card size="small" bodyStyle={{ padding: 12 }}>
            {selectedCall ? (
              <Space direction="vertical" size={2}>
                <Typography.Text strong>{selectedCall.customer?.customerName ?? selectedCall.ani}</Typography.Text>
                <Typography.Text type="secondary" className="text-xs">
                  {selectedCall.ani} · {selectedCall.sessionStatus}
                </Typography.Text>
                {selectedCall.customer?.grade && (
                  <Tag color="gold">{selectedCall.customer.grade}</Tag>
                )}
              </Space>
            ) : (
              <Typography.Text type="secondary">진행 중 통화 없음</Typography.Text>
            )}
          </Card>

          <ActionPanel
            call={selectedCall}
            onSaveMemo={saveMemo}
            onTransfer={transfer}
            onHangup={hangup}
          />
        </Space>
      </Card>
    </div>
  );
}
