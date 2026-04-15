import { Layout, Spin } from 'antd';
import { useEffect, useMemo } from 'react';
import { ControlPanel } from '../components/ControlPanel';
import { CurrentCallPanel } from '../components/CurrentCallPanel';
import { EventLogPanel } from '../components/EventLogPanel';
import { HeaderBar } from '../components/HeaderBar';
import { KpiPanel } from '../components/KpiPanel';
import { LogoutButton } from '../components/LogoutButton';
import { ModeSwitch } from '../components/ModeSwitch';
import { StatusPanel } from '../components/StatusPanel';
import { useCtiStore } from '../store/useCtiStore';

const { Content } = Layout;

// conv 13 Full 모드를 컴팩트하게 재구성.
//   Row 1: HeaderBar + ModeSwitch + Logout
//   Row 2: KpiPanel (compact KPI strip)
//   Row 3: [StatusPanel + EventLogPanel (좌)] | CurrentCallPanel (중앙) | ControlPanel (우)
// AcwPanel 과 BottomPanels 는 ControlPanel / EventLogPanel 로 흡수되어 제거.
export function FullShell() {
  const {
    loading,
    agentSession,
    queues,
    activeCalls,
    selectedCallId,
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
          {/* Row 1: Header */}
          <div className="flex w-full flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <HeaderBar session={agentSession} onChangeStatus={changeStatus} />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <ModeSwitch />
              <LogoutButton />
            </div>
          </div>

          {/* Row 2: KPI strip */}
          <KpiPanel />

          {/* Row 3: 3-column workspace (반응형) */}
          <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[300px_minmax(0,1fr)_380px]">
            {/* 좌: 큐 + 이벤트 로그 */}
            <div className="space-y-4">
              <StatusPanel queues={queues} />
              <EventLogPanel />
            </div>

            {/* 중앙: 현재 통화 (hero) */}
            <CurrentCallPanel call={selectedCall} />

            {/* 우: 콜 제어 (상태 기반) */}
            <ControlPanel
              call={selectedCall}
              onSaveMemo={saveMemo}
              onTransfer={transfer}
              onHangup={hangup}
            />
          </div>
        </div>
      </Content>
    </Layout>
  );
}
