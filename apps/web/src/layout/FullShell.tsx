import { Layout, Space, Spin } from 'antd';
import { useEffect, useMemo } from 'react';
import { AcwPanel } from '../components/AcwPanel';
import { ActionPanel } from '../components/ActionPanel';
import { BottomPanels } from '../components/BottomPanels';
import { CurrentCallPanel } from '../components/CurrentCallPanel';
import { EventLogPanel } from '../components/EventLogPanel';
import { HeaderBar } from '../components/HeaderBar';
import { KpiPanel } from '../components/KpiPanel';
import { ModeSwitch } from '../components/ModeSwitch';
import { StatusPanel } from '../components/StatusPanel';
import { useCtiStore } from '../store/useCtiStore';

const { Content } = Layout;

// conv 13 Full 모드: CRM 대체 전제. 상단 상담원 정보 / 좌측 상태·큐 /
// 중앙 현재 통화·고객 정보 / 우측 메모·전환·종료 / 하단 이력·알림 구조.
export function FullShell() {
  const {
    loading,
    agentSession,
    queues,
    activeCalls,
    selectedCallId,
    recentHistory,
    notifications,
    init,
    changeStatus,
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
        <Spin size="large" />
      </div>
    );
  }

  return (
    <Layout className="min-h-screen bg-slate-50">
      <Content className="mx-auto w-full max-w-[1800px] p-4 lg:p-6">
        <div className="space-y-4">
          <Space className="w-full justify-between">
            <HeaderBar session={agentSession} />
            <ModeSwitch />
          </Space>

          <KpiPanel />

          <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[320px_minmax(0,1fr)_360px]">
            <StatusPanel currentStatus={agentSession?.statusCode} queues={queues} onChangeStatus={changeStatus} />
            <CurrentCallPanel call={selectedCall} />
            <ActionPanel call={selectedCall} onSaveMemo={saveMemo} onTransfer={transfer} onHangup={hangup} />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <AcwPanel />
            <EventLogPanel />
          </div>

          <BottomPanels history={recentHistory} notifications={notifications} />
        </div>
      </Content>
    </Layout>
  );
}
