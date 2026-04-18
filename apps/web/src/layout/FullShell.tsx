import { Spin } from 'antd';
import { useEffect, useMemo } from 'react';
import { ControlPanel } from '../components/ControlPanel';
import { CurrentCallPanel } from '../components/CurrentCallPanel';
import { EventLogPanel } from '../components/EventLogPanel';
import { KpiPanel } from '../components/KpiPanel';
import { SideNav } from '../components/SideNav';
import { StatusPanel } from '../components/StatusPanel';
import { TopAppBar } from '../components/TopAppBar';
import { useCtiStore } from '../store/useCtiStore';

// "The Precision Curator" 풀 레이아웃.
//   - fixed TopAppBar (h-16)
//   - fixed SideNav (w-64)
//   - main 은 ml-64 + pt-20. 내부는 스크롤 가능.
//   - KPI bento → Active Call (hero) → Control (8) + [Queue + Events] (4)
export function FullShell() {
  const {
    loading,
    queues,
    activeCalls,
    selectedCallId,
    init,
    saveMemo,
    pickup,
    toggleMute,
    transfer,
    cancelAttendedTransfer,
    completeAttendedTransfer,
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
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface text-on-background">
      <TopAppBar />
      <SideNav />

      <main className="ml-64 min-h-screen p-8 pt-24">
        <div className="mx-auto max-w-7xl space-y-8">
          {/* KPI Bento */}
          <KpiPanel />

          {/* Active Call (전체 너비 hero) */}
          <CurrentCallPanel
            call={selectedCall}
            onPickup={pickup}
            onToggleMute={toggleMute}
            onHangup={hangup}
          />

          {/* 12-col grid: 좌 8 = Control / 우 4 = Queue + Events */}
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
            <div className="lg:col-span-8">
              <ControlPanel
                call={selectedCall}
                onSaveMemo={saveMemo}
                onTransfer={transfer}
                onCancelAttendedTransfer={cancelAttendedTransfer}
                onCompleteAttendedTransfer={completeAttendedTransfer}
                onHangup={hangup}
              />
            </div>
            <div className="space-y-6 lg:col-span-4">
              <StatusPanel queues={queues} />
              <EventLogPanel />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
