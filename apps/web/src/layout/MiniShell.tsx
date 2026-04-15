import { Space, Spin } from 'antd';
import { useEffect, useMemo } from 'react';
import { ControlPanel } from '../components/ControlPanel';
import { HeaderBar } from '../components/HeaderBar';
import { LogoutButton } from '../components/LogoutButton';
import { ModeSwitch } from '../components/ModeSwitch';
import { useCtiStore } from '../store/useCtiStore';

// conv 13 Mini 모드: 대리운전 관리 프로그램과 함께 띄우는 작은 패널.
//   - 최소한의 상담원 정보 + 상태 변경 (HeaderBar dropdown)
//   - 현재 콜 기반 ControlPanel (상태에 따라 자동 전환)
export function MiniShell() {
  const {
    loading,
    agentSession,
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
        <Spin />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[440px] space-y-3 p-3">
      <div className="flex items-center justify-end gap-2">
        <ModeSwitch />
        <LogoutButton />
      </div>

      <HeaderBar session={agentSession} onChangeStatus={changeStatus} />

      <ControlPanel
        call={selectedCall}
        onSaveMemo={saveMemo}
        onTransfer={transfer}
        onHangup={hangup}
      />
    </div>
  );
}
