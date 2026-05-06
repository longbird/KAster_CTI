import { Input, Select, Spin } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { ControlPanel } from '../components/ControlPanel';
import { AnnouncementsPanel } from '../components/AnnouncementsPanel';
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
    announcements,
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
      <div className="flex min-h-screen items-center justify-center" style={{ background: 'var(--bg-0)' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-0)', color: 'var(--fg-1)' }}>
      <TopAppBar />
      <SideNav />

      <main className="ml-64 min-h-screen p-8 pt-24">
        <div className="mx-auto max-w-7xl space-y-8">
          {fullSection === 'overview' ? (
            <>
              <AnnouncementsPanel announcements={announcements} />
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
              <section className="k-panel p-6 lg:col-span-4">
                <div className="mb-5 flex items-center justify-between">
                  <h3 className="text-[15px] font-semibold text-[var(--fg-1)]">활성 통화</h3>
                  <span className="k-eyebrow">
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
                    <p className="py-10 text-center text-xs text-[var(--fg-3)]">현재 진행 중인 콜이 없습니다.</p>
                  ) : filteredCalls.map((call) => (
                    <button
                      key={call.callId}
                      type="button"
                      onClick={() => selectCall(call.callId)}
                      className={`w-full rounded-xl border p-4 text-left transition-all ${
                        call.callId === selectedCallId
                          ? 'border-[var(--signal-dim)] bg-[var(--signal-soft)]'
                          : 'border-[var(--line-1)] hover:border-[var(--line-3)] hover:bg-[var(--bg-2)]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-[var(--fg-1)]">
                            {call.customer?.customerName ?? call.ani ?? '미식별 고객'}
                          </p>
                          <p className="mt-1 text-[11px] text-[var(--fg-3)]">{call.queueName || '-'}</p>
                        </div>
                        <span className="k-mono text-[10px] font-semibold uppercase text-[var(--signal)]">
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
                <section className="k-panel p-6 lg:col-span-4">
                  <div className="mb-5 flex items-center justify-between">
                    <h3 className="text-[15px] font-semibold text-[var(--fg-1)]">큐 목록</h3>
                    <span className="k-eyebrow">
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
                            ? 'border-[var(--signal-dim)] bg-[var(--signal-soft)]'
                            : 'border-[var(--line-1)] hover:border-[var(--line-3)] hover:bg-[var(--bg-2)]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold text-[var(--fg-1)]">{queue.queueName}</p>
                            <p className="mt-1 text-[11px] text-[var(--fg-3)]">
                              대기 {queue.waitingCount} / 통화 {queue.talkingCount} / 가능 {queue.availableAgents}
                            </p>
                          </div>
                          <span className="k-num text-sm font-semibold text-[var(--signal)]">
                            {queue.longestWaitSeconds}s
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
                <div className="space-y-8 lg:col-span-8">
                  <StatusPanel queues={queues} />
                  <section className="k-panel p-6">
                    <div className="mb-5 flex items-center justify-between">
                      <div>
                        <h3 className="text-[15px] font-semibold text-[var(--fg-1)]">
                          {selectedQueue?.queueName ?? '큐 상세'}
                        </h3>
                        <p className="mt-1 text-xs text-[var(--fg-3)]">
                          선택한 큐의 현재 처리량과 대기 강도를 한 화면에서 봅니다.
                        </p>
                      </div>
                      <span className="k-eyebrow">
                        상세 보기
                      </span>
                    </div>

                    {selectedQueue ? (
                      <>
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                          <div className="rounded-md border border-[var(--line-1)] bg-[var(--bg-2)] p-5">
                            <p className="k-eyebrow">
                              대기
                            </p>
                            <p className="mt-3 k-num text-3xl font-semibold text-[var(--fg-1)]">
                              {selectedQueue.waitingCount}
                            </p>
                            <p className="mt-2 text-[11px] text-[var(--fg-3)]">
                              전체 큐 부하 대비{' '}
                              {totalQueueLoad > 0
                                ? Math.round((selectedQueue.waitingCount / totalQueueLoad) * 100)
                                : 0}
                              %
                            </p>
                          </div>
                          <div className="rounded-md border border-[var(--line-1)] bg-[var(--bg-2)] p-5">
                            <p className="k-eyebrow">
                              통화 중
                            </p>
                            <p className="mt-3 k-num text-3xl font-semibold text-[var(--fg-1)]">
                              {selectedQueue.talkingCount}
                            </p>
                            <p className="mt-2 text-[11px] text-[var(--fg-3)]">
                              현재 상담 연결량 기준 실시간 점유
                            </p>
                          </div>
                          <div className="rounded-md border border-[var(--line-1)] bg-[var(--bg-2)] p-5">
                            <p className="k-eyebrow">
                              응대 가능
                            </p>
                            <p className="mt-3 k-num text-3xl font-semibold text-[var(--fg-1)]">
                              {selectedQueue.availableAgents}
                            </p>
                            <p className="mt-2 text-[11px] text-[var(--fg-3)]">
                              즉시 응대 가능한 상담원 수
                            </p>
                          </div>
                        </div>

                        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
                          <div className="rounded-md border border-[var(--line-1)] bg-[var(--bg-2)] p-5">
                            <p className="k-eyebrow">
                              최대 대기
                            </p>
                            <p className="mt-3 k-num text-3xl font-semibold text-[var(--signal)]">
                              {selectedQueue.longestWaitSeconds}s
                            </p>
                            <p className="mt-2 text-[11px] text-[var(--fg-3)]">
                              장시간 대기 고객이 있으면 우선 배정 점검이 필요합니다.
                            </p>
                          </div>
                          <div className="rounded-md border border-[var(--line-1)] bg-[var(--bg-2)] p-5">
                            <p className="k-eyebrow">
                              부하 비중
                            </p>
                            <div className="mt-4 flex h-3 overflow-hidden rounded-sm bg-[var(--bg-2)]">
                              <div
                                className="bg-[var(--signal)]"
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
                                className="bg-[var(--accent-info)]"
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
                                className="bg-[var(--accent-warn)]"
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
                            <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-[var(--fg-3)]">
                              <span>대기 {selectedQueue.waitingCount}</span>
                              <span>통화 {selectedQueue.talkingCount}</span>
                              <span>가능 {selectedQueue.availableAgents}</span>
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <p className="py-10 text-center text-xs text-[var(--fg-3)]">표시할 큐가 없습니다.</p>
                    )}
                  </section>
                </div>
              </div>
            </>
          ) : null}

          {fullSection === 'history' ? (
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
              <section className="k-panel p-6 lg:col-span-7">
                <div className="mb-5 flex items-center justify-between">
                  <h3 className="text-[15px] font-semibold text-[var(--fg-1)]">최근 이력</h3>
                  <span className="k-eyebrow">
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
                    <p className="py-10 text-center text-xs text-[var(--fg-3)]">최근 통화 이력이 없습니다.</p>
                  ) : filteredHistory.map((item) => (
                    <div key={item.callId} className="rounded-xl border border-[var(--line-1)] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-[var(--fg-1)]">{item.customerName}</p>
                          <p className="mt-1 text-[11px] text-[var(--fg-3)]">
                            {item.phoneNumber} · {item.queueName}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="k-mono text-[11px] font-semibold uppercase text-[var(--signal)]">
                            {item.resultCode}
                          </p>
                          <p className="mt-1 text-[11px] text-[var(--fg-3)]">{formatTime(item.startedAt)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              <section className="k-panel p-6 lg:col-span-5">
                <div className="mb-5 flex items-center justify-between">
                  <h3 className="text-[15px] font-semibold text-[var(--fg-1)]">이벤트 기록</h3>
                  <span className="k-eyebrow">
                    최신
                  </span>
                </div>
                <div className="space-y-3">
                  {eventLog.length === 0 ? (
                    <p className="py-10 text-center text-xs text-[var(--fg-3)]">이벤트 로그가 없습니다.</p>
                  ) : eventLog.slice(0, 12).map((item) => (
                    <div key={item.id} className="rounded-xl border border-[var(--line-1)] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm text-on-surface">{item.message}</p>
                        <span className="shrink-0 text-[11px] text-[var(--fg-3)]">{formatTime(item.timestamp)}</span>
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
