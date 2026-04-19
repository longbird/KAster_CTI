import { Form, Input, Select, Spin, message } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { logout } from '../api';
import { AgentStatusTag } from '../components/AgentStatusTag';
import { ThemeToggle } from '../components/ThemeToggle';
import { useCtiStore } from '../store/useCtiStore';
import { useUiStore } from '../store/useUiStore';

// "The Precision Curator" Mini 모드.
// 440px 슬림 패널. 대리운전 관리 프로그램과 함께 띄우는 전제.
// 구성: 헤더(로고+에이전트+상태) → 현재 콜 카드(그라디언트) → 컨트롤 버튼 → 메모/결과.

const RESULT_CODES = [
  { value: 'ORDER_COMPLETE', label: '주문 완료' },
  { value: 'CALLBACK', label: '콜백 예정' },
  { value: 'FOLLOW_UP', label: '후속 상담' },
  { value: 'CLAIM', label: '민원 접수' },
  { value: 'OTHER', label: '기타' },
];

function formatCallDuration(iso?: string): string {
  if (!iso) return '00:00';
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function MiniShell() {
  const {
    loading,
    agentSession,
    activeCalls,
    selectedCallId,
    init,
    changeStatus,
    saveMemo,
    pickup,
    toggleMute,
    toggleHold,
    transfer,
    cancelAttendedTransfer,
    completeAttendedTransfer,
    hangup,
  } = useCtiStore();
  const setMode = useUiStore((s) => s.setMode);

  useEffect(() => {
    void init();
  }, [init]);

  const selectedCall = useMemo(
    () => activeCalls.find((call) => call.callId === selectedCallId),
    [activeCalls, selectedCallId],
  );

  // 통화 중일 때 1초 간격 리렌더
  const [, tick] = useState(0);
  useEffect(() => {
    if (!selectedCall?.answeredAt) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [selectedCall?.answeredAt]);

  const [form] = Form.useForm<{
    memo: string;
    resultCode: string;
    transferTarget: string;
    transferMode: 'blind' | 'attended';
  }>();

  useEffect(() => {
    form.setFieldsValue({
      memo: selectedCall?.memo ?? '',
      resultCode: selectedCall?.resultCode ?? 'ORDER_COMPLETE',
      transferTarget: '',
      transferMode: 'blind',
    });
  }, [selectedCall?.callId, form]);

  const onLogout = async () => {
    if (!window.confirm('현재 세션을 종료하시겠습니까?')) return;
    await logout();
    window.location.reload();
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <Spin />
      </div>
    );
  }

  const duration = formatCallDuration(selectedCall?.answeredAt ?? selectedCall?.startedAt);
  const isActive = !!selectedCall;
  const hasOpenConsult = !!selectedCall?.latestTransfer
    && ['REQUESTED', 'CONSULT_RINGING', 'CONSULT_TALKING', 'REBRIDGING'].includes(selectedCall.latestTransfer.phase);
  const summaryItems = [
    {
      label: '근무 상태',
      value: agentSession?.statusCode === 'AVAILABLE' ? '대기' : agentSession?.statusCode ?? '-',
    },
    {
      label: '현재 통화',
      value: isActive ? (selectedCall?.sessionStatus ?? '연결') : '없음',
    },
    {
      label: '큐',
      value: selectedCall?.queueName ?? '직접 콜',
    },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden bg-surface px-3 py-4 font-body text-on-background">
      <div className="mini-shell-grid pointer-events-none absolute inset-0 opacity-50" />
      <div className="pointer-events-none absolute inset-x-[-20%] top-[-15%] h-72 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-10%] right-[-20%] h-64 w-64 rounded-full bg-tertiary/10 blur-3xl" />

      <div className="relative mx-auto max-w-[460px]">
        <div className="overflow-hidden rounded-[30px] border border-outline-variant/20 bg-surface-container-lowest/95 shadow-float backdrop-blur-xl">
          <div className="border-b border-outline-variant/15 px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <span className="material-symbols-outlined text-[22px]">headset_mic</span>
                </div>
                <div className="min-w-0">
                  <p className="font-headline text-sm font-extrabold uppercase tracking-[0.28em] text-primary">
                    KAster CTI
                  </p>
                  <p className="mt-1 truncate text-sm font-semibold text-on-surface">
                    {agentSession?.agentName ?? '-'}
                  </p>
                  <p className="truncate text-[11px] text-on-surface-variant">
                    내선 {agentSession?.extension ?? '-'} · 미니 운영 패널
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <ThemeToggle compact />
                <button
                  onClick={() => setMode('full')}
                  title="전체 모드로 전환"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-container text-on-surface-variant transition-all hover:bg-surface-container-high active:scale-95"
                >
                  <span className="material-symbols-outlined text-[18px]">open_in_full</span>
                </button>
                <button
                  onClick={() => {
                    void onLogout();
                  }}
                  title="로그아웃"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-error-container/50 text-error transition-all hover:bg-error-container active:scale-95"
                >
                  <span className="material-symbols-outlined text-[18px]">logout</span>
                </button>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between rounded-2xl bg-surface-container p-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-on-surface-variant">
                  현재 상태
                </p>
                <p className="mt-1 text-xs text-outline">
                  실시간 변경이 즉시 PBX 상태와 동기화됩니다.
                </p>
              </div>
              <AgentStatusTag status={agentSession?.statusCode} onChange={changeStatus} />
            </div>
          </div>

          <div className="space-y-4 px-4 py-4">
            <section className="grid grid-cols-3 gap-2">
              {summaryItems.map((item) => (
                <div key={item.label} className="rounded-2xl bg-surface-container p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-on-surface-variant">
                    {item.label}
                  </p>
                  <p className="mt-2 text-sm font-bold text-on-surface">{item.value}</p>
                </div>
              ))}
            </section>

            {isActive ? (
              <section
                className="relative overflow-hidden rounded-[28px] p-5 text-white"
                style={{ background: 'linear-gradient(145deg, var(--gradient-primary-from) 0%, var(--gradient-primary-to) 100%)' }}
              >
                <div className="pointer-events-none absolute -left-10 top-6 h-24 w-24 rounded-full bg-white/10 blur-2xl" />
                <div className="pointer-events-none absolute -right-8 bottom-0 h-32 w-32 rounded-full bg-black/10 blur-3xl" />
                <div className="relative z-10">
                  <div className="flex items-start gap-3">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-md">
                      <span className="material-symbols-outlined text-[26px]">person</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-white/80">
                          현재 통화
                        </span>
                        <span className="rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-bold text-white/90">
                          {selectedCall?.queueName ?? '직접 연결'}
                        </span>
                      </div>
                      <h3 className="mt-3 truncate font-headline text-xl font-bold">
                        {selectedCall!.customer?.customerName ?? '미식별 고객'}
                      </h3>
                      <p className="mt-1 truncate text-sm text-blue-100">
                        {selectedCall!.ani ?? '-'} · DID {selectedCall!.dnis ?? '-'}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-white/10 p-3 backdrop-blur-sm">
                      <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/70">통화 시간</p>
                      <div className="mt-2 flex items-center gap-2">
                        <span className="font-headline text-2xl font-bold">{duration}</span>
                        <div className="flex h-4 items-end gap-0.5">
                          <div className="waveform-bar w-0.5 rounded-full bg-tertiary-fixed" style={{ animationDelay: '0s' }} />
                          <div className="waveform-bar w-0.5 rounded-full bg-tertiary-fixed" style={{ animationDelay: '0.15s' }} />
                          <div className="waveform-bar w-0.5 rounded-full bg-tertiary-fixed" style={{ animationDelay: '0.3s' }} />
                          <div className="waveform-bar w-0.5 rounded-full bg-tertiary-fixed" style={{ animationDelay: '0.45s' }} />
                        </div>
                      </div>
                    </div>
                    <div className="rounded-2xl bg-white/10 p-3 backdrop-blur-sm">
                      <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/70">전환 상태</p>
                      <p className="mt-2 text-sm font-bold text-white">
                        {selectedCall?.latestTransfer
                          ? `${selectedCall.latestTransfer.phase} · ${selectedCall.latestTransfer.toExtension ?? '-'}`
                          : '진행 없음'}
                      </p>
                      {selectedCall?.customer?.grade ? (
                        <p className="mt-2 text-[11px] text-white/75">고객 등급 {selectedCall.customer.grade}</p>
                      ) : null}
                    </div>
                  </div>
                </div>
              </section>
            ) : (
              <section className="relative overflow-hidden rounded-[28px] border border-dashed border-outline-variant/30 bg-surface-container p-6 text-center">
                <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-container-lowest text-outline shadow-sm">
                  <span className="material-symbols-outlined text-[26px]">ring_volume</span>
                </div>
                <p className="mt-4 font-headline text-base font-bold text-on-surface">수신 대기 중</p>
                <p className="mt-2 text-sm text-outline">
                  새 콜이 배정되면 고객 정보와 빠른 제어 버튼이 여기에 바로 표시됩니다.
                </p>
              </section>
            )}

            <section className="rounded-[28px] bg-surface-container p-4">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-on-surface-variant">
                    빠른 제어
                  </p>
                  <p className="mt-1 text-xs text-outline">현재 통화에 필요한 기본 동작만 배치했습니다.</p>
                </div>
                {hasOpenConsult ? (
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-primary">
                    상담 전환 진행 중
                  </span>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <MiniCtrlButton
                  icon={isActive && !selectedCall?.answeredAt ? 'phone_in_talk' : 'mic_off'}
                  label={isActive && !selectedCall?.answeredAt ? '당겨받기' : selectedCall?.isMuted ? '음소거 해제' : '음소거'}
                  disabled={!isActive}
                  onClick={async () => {
                    if (selectedCall && !selectedCall.answeredAt) {
                      await pickup();
                      message.success('당겨받기 요청');
                      return;
                    }
                    await toggleMute();
                    message.success(selectedCall?.isMuted ? '음소거 해제 요청' : '음소거 요청');
                  }}
                />
                <MiniCtrlButton
                  icon={selectedCall?.sessionStatus === 'HOLD' ? 'play_arrow' : 'pause'}
                  label={selectedCall?.sessionStatus === 'HOLD' ? '보류 해제' : '보류'}
                  disabled={!isActive || !agentSession?.callControlCapabilities?.holdEnabled}
                  onClick={async () => {
                    await toggleHold();
                    message.success(selectedCall?.sessionStatus === 'HOLD' ? '보류 해제 요청' : '보류 요청');
                  }}
                />
                <MiniCtrlButton
                  icon="phone_forwarded"
                  label="전환"
                  disabled={!isActive}
                  onClick={async () => {
                    const target = form.getFieldValue('transferTarget');
                    const transferMode = form.getFieldValue('transferMode') ?? 'blind';
                    if (!target) {
                      message.warning('아래 내선 입력 필요');
                      return;
                    }
                    await transfer(target, transferMode);
                    message.success(transferMode === 'attended' ? `상담 전환: ${target}` : `전환: ${target}`);
                  }}
                />
                <MiniCtrlButton
                  icon="call_end"
                  label="종료"
                  tone="danger"
                  disabled={!isActive}
                  onClick={async () => {
                    await hangup();
                    message.success('통화 종료 요청');
                  }}
                />
              </div>

              {hasOpenConsult ? (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <MiniCtrlButton
                    icon="merge"
                    label="상담 전환 완료"
                    onClick={async () => {
                      await completeAttendedTransfer();
                      message.success('상담 전환 완료 요청');
                    }}
                  />
                  <MiniCtrlButton
                    icon="close"
                    label="상담 전환 취소"
                    tone="danger"
                    onClick={async () => {
                      await cancelAttendedTransfer();
                      message.success('상담 전환 취소 요청');
                    }}
                  />
                </div>
              ) : null}
            </section>

            <section className="rounded-[28px] bg-surface-container p-4">
              <Form
                form={form}
                layout="vertical"
                onFinish={async (values) => {
                  await saveMemo(values.memo, values.resultCode);
                  message.success('저장 완료');
                }}
              >
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-on-surface-variant">
                      메모 및 후처리
                    </p>
                    <p className="mt-1 text-xs text-outline">전환 내선, 결과 코드, 상담 메모를 한 번에 저장합니다.</p>
                  </div>
                </div>

                <div className="mb-3 grid grid-cols-2 gap-3">
                  <Form.Item name="resultCode" label={<MiniLabel>결과</MiniLabel>} className="!mb-0">
                    <Select options={RESULT_CODES} size="large" />
                  </Form.Item>
                  <Form.Item name="transferTarget" label={<MiniLabel>전환 내선</MiniLabel>} className="!mb-0">
                    <Input placeholder="예: 1002" size="large" />
                  </Form.Item>
                </div>
                <Form.Item name="transferMode" label={<MiniLabel>전환 방식</MiniLabel>} className="!mb-3">
                  <Select
                    size="large"
                    options={[
                      { value: 'blind', label: '블라인드 전환' },
                      { value: 'attended', label: '상담 전환' },
                    ]}
                  />
                </Form.Item>
                <Form.Item name="memo" label={<MiniLabel>메모</MiniLabel>} className="!mb-3">
                  <Input.TextArea rows={4} placeholder="상담 메모" className="!resize-none" />
                </Form.Item>
                <button
                  type="submit"
                  className="btn-primary-gradient w-full rounded-2xl py-3 font-headline text-sm font-bold shadow shadow-primary/20"
                >
                  메모 저장
                </button>
              </Form>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniCtrlButton({
  icon,
  label,
  onClick,
  disabled,
  tone = 'neutral',
}: {
  icon: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'neutral' | 'danger';
}) {
  const base =
    'flex min-h-[88px] flex-col items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-40';
  const toneClass =
    tone === 'danger'
      ? 'border-error/10 bg-error text-white hover:opacity-90 shadow-lg shadow-error/20'
      : 'border-outline-variant/20 bg-surface-container-lowest text-on-surface hover:bg-surface-container-low shadow-panel';
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`${base} ${toneClass}`}>
      <span className="material-symbols-outlined text-[20px]">{icon}</span>
      <span className="text-[11px] font-bold uppercase tracking-[0.16em]">{label}</span>
    </button>
  );
}

function MiniLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
      {children}
    </span>
  );
}
