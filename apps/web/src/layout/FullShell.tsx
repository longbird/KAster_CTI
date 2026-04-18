import { Input, Select, Spin } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { ControlPanel } from '../components/ControlPanel';
import { CurrentCallPanel } from '../components/CurrentCallPanel';
import { EventLogPanel } from '../components/EventLogPanel';
import { KpiPanel } from '../components/KpiPanel';
import { SideNav } from '../components/SideNav';
import { StatusPanel } from '../components/StatusPanel';
import { TopAppBar } from '../components/TopAppBar';
import { useCtiStore } from '../store/useCtiStore';
import { useUiStore } from '../store/useUiStore';

function formatTime(value?: string) {
  if (!value) return '-';
  return new Date(value).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// "The Precision Curator" 풀 레이아웃.
//   - fixed TopAppBar (h-16)
//   - fixed SideNav (w-64)
//   - main 은 ml-64 + pt-20. 내부는 스크롤 가능.
//   - KPI bento → Active Call (hero) → Control (8) + [Queue + Events] (4)
export function FullShell() {
  const {
    loading,
    agentSession,
    queues,
    activeCalls,
    selectedCallId,
    recentHistory,
    eventLog,
    selectCall,
    init,
    saveMemo,
    pickup,
    toggleMute,
    toggleHold,
    transfer,
    cancelAttendedTransfer,
    completeAttendedTransfer,
    hangup,
  } = useCtiStore();
  const fullSection = useUiStore((s) => s.fullSection);
  const [callQuery, setCallQuery] = useState('');
  const [callStatusFilter, setCallStatusFilter] = useState<'ALL' | string>('ALL');
  const [historyQuery, setHistoryQuery] = useState('');
  const [historyResultFilter, setHistoryResultFilter] = useState<'ALL' | string>('ALL');
  const [selectedQueueId, setSelectedQueueId] = useState<string | null>(null);

  useEffect(() => {
    void init();
  }, [init]);

  const selectedCall = useMemo(
    () => activeCalls.find((call) => call.callId === selectedCallId),
    [activeCalls, selectedCallId],
  );
  const filteredCalls = useMemo(
    () =>
      activeCalls.filter((call) => {
        const keyword = callQuery.trim().toLowerCase();
        const matchesKeyword = keyword
          ? [
              call.customer?.customerName,
              call.ani,
              call.dnis,
              call.queueName,
            ]
              .filter(Boolean)
              .some((value) => String(value).toLowerCase().includes(keyword))
          : true;
        const matchesStatus = callStatusFilter === 'ALL' ? true : call.sessionStatus === callStatusFilter;
        return matchesKeyword && matchesStatus;
      }),
    [activeCalls, callQuery, callStatusFilter],
  );
  const filteredHistory = useMemo(
    () =>
      recentHistory.filter((item) => {
        const keyword = historyQuery.trim().toLowerCase();
        const matchesKeyword = keyword
          ? [item.customerName, item.phoneNumber, item.queueName]
              .filter(Boolean)
              .some((value) => String(value).toLowerCase().includes(keyword))
          : true;
        const matchesResult = historyResultFilter === 'ALL' ? true : item.resultCode === historyResultFilter;
        return matchesKeyword && matchesResult;
      }),
    [recentHistory, historyQuery, historyResultFilter],
  );
  const callStatusOptions = useMemo(
    () => ['ALL', ...new Set(activeCalls.map((call) => call.sessionStatus))],
    [activeCalls],
  );
  const historyResultOptions = useMemo(
    () => ['ALL', ...new Set(recentHistory.map((item) => item.resultCode))],
    [recentHistory],
  );
  const selectedQueue = useMemo(
    () => queues.find((queue) => queue.queueId === selectedQueueId) ?? queues[0] ?? null,
    [queues, selectedQueueId],
  );
  const totalQueueLoad = useMemo(
    () => queues.reduce((sum, queue) => sum + queue.waitingCount + queue.talkingCount + queue.availableAgents, 0),
    [queues],
  );

  useEffect(() => {
    if (!selectedQueueId && queues[0]?.queueId) {
      setSelectedQueueId(queues[0].queueId);
      return;
    }
    if (selectedQueueId && !queues.some((queue) => queue.queueId === selectedQueueId)) {
      setSelectedQueueId(queues[0]?.queueId ?? null);
    }
  }, [queues, selectedQueueId]);

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
          {fullSection === 'overview' ? (
            <>
              <KpiPanel />
              <CurrentCallPanel
                call={selectedCall}
                holdEnabled={agentSession?.callControlCapabilities?.holdEnabled}
                onPickup={pickup}
                onToggleMute={toggleMute}
                onToggleHold={toggleHold}
                onHangup={hangup}
              />
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
            </>
          ) : null}

          {fullSection === 'call' ? (
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
              <section className="rounded-lg bg-surface-container-lowest p-6 shadow-panel lg:col-span-4">
                <div className="mb-5 flex items-center justify-between">
                  <h3 className="font-headline text-lg font-bold text-on-surface">활성 통화</h3>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-outline">
                    {filteredCalls.length}건
                  </span>
                </div>
                <div className="mb-4 space-y-3">
                  <Input
                    value={callQuery}
                    onChange={(event) => setCallQuery(event.target.value)}
                    placeholder="고객명, ANI, DID, 큐 검색"
                    size="large"
                  />
                  <Select
                    value={callStatusFilter}
                    onChange={setCallStatusFilter}
                    size="large"
                    options={callStatusOptions.map((status) => ({
                      value: status,
                      label: status === 'ALL' ? '전체 상태' : status,
                    }))}
                  />
                </div>
                <div className="space-y-3">
                  {filteredCalls.length === 0 ? (
                    <p className="py-10 text-center text-sm text-outline">현재 진행 중인 콜이 없습니다.</p>
                  ) : filteredCalls.map((call) => (
                    <button
                      key={call.callId}
                      type="button"
                      onClick={() => selectCall(call.callId)}
                      className={`w-full rounded-xl border p-4 text-left transition-all ${
                        call.callId === selectedCallId
                          ? 'border-primary/30 bg-primary/5'
                          : 'border-outline-variant/20 hover:border-primary/20 hover:bg-surface-container-low'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-bold text-on-surface">
                            {call.customer?.customerName ?? call.ani ?? '미식별 고객'}
                          </p>
                          <p className="mt-1 text-xs text-outline">{call.queueName || '-'}</p>
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                          {call.sessionStatus}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
              <div className="space-y-8 lg:col-span-8">
                <CurrentCallPanel
                  call={selectedCall}
                  holdEnabled={agentSession?.callControlCapabilities?.holdEnabled}
                  onPickup={pickup}
                  onToggleMute={toggleMute}
                  onToggleHold={toggleHold}
                  onHangup={hangup}
                />
                <ControlPanel
                  call={selectedCall}
                  onSaveMemo={saveMemo}
                  onTransfer={transfer}
                  onCancelAttendedTransfer={cancelAttendedTransfer}
                  onCompleteAttendedTransfer={completeAttendedTransfer}
                  onHangup={hangup}
                />
              </div>
            </div>
          ) : null}

          {fullSection === 'queues' ? (
            <>
              <KpiPanel />
              <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
                <section className="rounded-lg bg-surface-container-lowest p-6 shadow-panel lg:col-span-4">
                  <div className="mb-5 flex items-center justify-between">
                    <h3 className="font-headline text-lg font-bold text-on-surface">큐 목록</h3>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-outline">
                      {queues.length}개
                    </span>
                  </div>
                  <div className="space-y-3">
                    {queues.map((queue) => (
                      <button
                        key={queue.queueId}
                        type="button"
                        onClick={() => setSelectedQueueId(queue.queueId)}
                        className={`w-full rounded-xl border p-4 text-left transition-all ${
                          selectedQueue?.queueId === queue.queueId
                            ? 'border-primary/30 bg-primary/5'
                            : 'border-outline-variant/20 hover:border-primary/20 hover:bg-surface-container-low'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-bold text-on-surface">{queue.queueName}</p>
                            <p className="mt-1 text-xs text-outline">
                              대기 {queue.waitingCount} / 통화 {queue.talkingCount} / 가능 {queue.availableAgents}
                            </p>
                          </div>
                          <span className="text-sm font-bold text-primary">
                            {queue.longestWaitSeconds}s
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
                <div className="space-y-8 lg:col-span-8">
                  <StatusPanel queues={queues} />
                  <section className="rounded-lg bg-surface-container-lowest p-6 shadow-panel">
                    <div className="mb-5 flex items-center justify-between">
                      <div>
                        <h3 className="font-headline text-lg font-bold text-on-surface">
                          {selectedQueue?.queueName ?? '큐 상세'}
                        </h3>
                        <p className="mt-1 text-sm text-outline">
                          선택한 큐의 현재 처리량과 대기 강도를 한 화면에서 봅니다.
                        </p>
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-outline">
                        상세 보기
                      </span>
                    </div>

                    {selectedQueue ? (
                      <>
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                          <div className="rounded-xl border border-outline-variant/20 p-5">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                              대기
                            </p>
                            <p className="mt-3 font-headline text-3xl font-bold text-on-surface">
                              {selectedQueue.waitingCount}
                            </p>
                            <p className="mt-2 text-xs text-outline">
                              전체 큐 부하 대비{' '}
                              {totalQueueLoad > 0
                                ? Math.round((selectedQueue.waitingCount / totalQueueLoad) * 100)
                                : 0}
                              %
                            </p>
                          </div>
                          <div className="rounded-xl border border-outline-variant/20 p-5">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                              통화 중
                            </p>
                            <p className="mt-3 font-headline text-3xl font-bold text-on-surface">
                              {selectedQueue.talkingCount}
                            </p>
                            <p className="mt-2 text-xs text-outline">
                              현재 상담 연결량 기준 실시간 점유
                            </p>
                          </div>
                          <div className="rounded-xl border border-outline-variant/20 p-5">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                              응대 가능
                            </p>
                            <p className="mt-3 font-headline text-3xl font-bold text-on-surface">
                              {selectedQueue.availableAgents}
                            </p>
                            <p className="mt-2 text-xs text-outline">
                              즉시 응대 가능한 상담원 수
                            </p>
                          </div>
                        </div>

                        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
                          <div className="rounded-xl border border-outline-variant/20 p-5">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                              최대 대기
                            </p>
                            <p className="mt-3 font-headline text-3xl font-bold text-primary">
                              {selectedQueue.longestWaitSeconds}s
                            </p>
                            <p className="mt-2 text-xs text-outline">
                              장시간 대기 고객이 있으면 우선 배정 점검이 필요합니다.
                            </p>
                          </div>
                          <div className="rounded-xl border border-outline-variant/20 p-5">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                              부하 비중
                            </p>
                            <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-surface-container">
                              <div
                                className="bg-primary"
                                style={{
                                  width: `${Math.max(
                                    8,
                                    totalQueueLoad > 0
                                      ? (selectedQueue.waitingCount / totalQueueLoad) * 100
                                      : 0,
                                  )}%`,
                                }}
                              />
                              <div
                                className="bg-tertiary"
                                style={{
                                  width: `${Math.max(
                                    8,
                                    totalQueueLoad > 0
                                      ? (selectedQueue.talkingCount / totalQueueLoad) * 100
                                      : 0,
                                  )}%`,
                                }}
                              />
                              <div
                                className="bg-sky-400"
                                style={{
                                  width: `${Math.max(
                                    8,
                                    totalQueueLoad > 0
                                      ? (selectedQueue.availableAgents / totalQueueLoad) * 100
                                      : 0,
                                  )}%`,
                                }}
                              />
                            </div>
                            <div className="mt-3 flex flex-wrap gap-3 text-xs text-outline">
                              <span>대기 {selectedQueue.waitingCount}</span>
                              <span>통화 {selectedQueue.talkingCount}</span>
                              <span>가능 {selectedQueue.availableAgents}</span>
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <p className="py-10 text-center text-sm text-outline">표시할 큐가 없습니다.</p>
                    )}
                  </section>
                </div>
              </div>
            </>
          ) : null}

          {fullSection === 'history' ? (
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
              <section className="rounded-lg bg-surface-container-lowest p-6 shadow-panel lg:col-span-7">
                <div className="mb-5 flex items-center justify-between">
                  <h3 className="font-headline text-lg font-bold text-on-surface">최근 이력</h3>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-outline">
                    {filteredHistory.length}건
                  </span>
                </div>
                <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Input
                    value={historyQuery}
                    onChange={(event) => setHistoryQuery(event.target.value)}
                    placeholder="고객명, 전화번호, 큐 검색"
                    size="large"
                  />
                  <Select
                    value={historyResultFilter}
                    onChange={setHistoryResultFilter}
                    size="large"
                    options={historyResultOptions.map((result) => ({
                      value: result,
                      label: result === 'ALL' ? '전체 결과' : result,
                    }))}
                  />
                </div>
                <div className="space-y-3">
                  {filteredHistory.length === 0 ? (
                    <p className="py-10 text-center text-sm text-outline">최근 통화 이력이 없습니다.</p>
                  ) : filteredHistory.map((item) => (
                    <div key={item.callId} className="rounded-xl border border-outline-variant/20 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-bold text-on-surface">{item.customerName}</p>
                          <p className="mt-1 text-xs text-outline">
                            {item.phoneNumber} · {item.queueName}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-bold uppercase tracking-wider text-primary">
                            {item.resultCode}
                          </p>
                          <p className="mt-1 text-xs text-outline">{formatTime(item.startedAt)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              <section className="rounded-lg bg-surface-container-lowest p-6 shadow-panel lg:col-span-5">
                <div className="mb-5 flex items-center justify-between">
                  <h3 className="font-headline text-lg font-bold text-on-surface">이벤트 기록</h3>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-outline">
                    최신
                  </span>
                </div>
                <div className="space-y-3">
                  {eventLog.length === 0 ? (
                    <p className="py-10 text-center text-sm text-outline">이벤트 로그가 없습니다.</p>
                  ) : eventLog.slice(0, 12).map((item) => (
                    <div key={item.id} className="rounded-xl border border-outline-variant/20 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm text-on-surface">{item.message}</p>
                        <span className="shrink-0 text-xs text-outline">{formatTime(item.timestamp)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
