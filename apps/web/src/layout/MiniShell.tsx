import { Form, Input, Select, Spin, message } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { logout } from '../api';
import { AgentStatusTag } from '../components/AgentStatusTag';
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

  return (
    <div className="min-h-screen bg-surface p-3 font-body text-on-background">
      <div className="mx-auto max-w-[440px] space-y-3">
        {/* Header: 로고 + 에이전트 + 액션 */}
        <div className="flex items-center justify-between rounded-lg bg-surface-container-lowest p-3 shadow-panel">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <span className="material-symbols-outlined text-base text-primary">headset_mic</span>
            </div>
            <div className="min-w-0">
              <p className="font-headline text-[11px] font-extrabold uppercase tracking-widest text-primary">
                KAster CTI
              </p>
              <p className="truncate text-[10px] font-medium text-on-surface-variant">
                {agentSession?.agentName ?? '-'} · 내선 {agentSession?.extension ?? '-'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setMode('full')}
              title="Full 모드로 전환"
              className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant transition-all hover:bg-surface-container-low active:scale-95"
            >
              <span className="material-symbols-outlined text-[18px]">open_in_full</span>
            </button>
            <button
              onClick={() => {
                void onLogout();
              }}
              title="로그아웃"
              className="flex h-8 w-8 items-center justify-center rounded-full text-error transition-all hover:bg-error-container/20 active:scale-95"
            >
              <span className="material-symbols-outlined text-[18px]">logout</span>
            </button>
          </div>
        </div>

        {/* Status row */}
        <div className="flex items-center justify-between rounded-lg bg-surface-container-lowest p-3 shadow-panel">
          <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
            현재 상태
          </span>
          <AgentStatusTag status={agentSession?.statusCode} onChange={changeStatus} />
        </div>

        {/* 현재 콜 — hero 그라디언트 (active) 또는 회색 empty */}
        {isActive ? (
          <div
            className="relative overflow-hidden rounded-xl p-5 text-white shadow-panel"
            style={{ background: 'linear-gradient(135deg, #003fb1 0%, #1a56db 100%)' }}
          >
            <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/5 blur-2xl" />
            <div className="relative z-10">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/10 backdrop-blur-md">
                  <span className="material-symbols-outlined text-2xl">person</span>
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-headline text-lg font-bold">
                    {selectedCall!.customer?.customerName ?? '미식별 고객'}
                  </h3>
                  <p className="truncate text-xs text-blue-100">
                    {selectedCall!.ani ?? '-'}
                    {selectedCall!.customer?.grade && (
                      <span className="ml-1 rounded-full bg-white/20 px-1.5 py-0.5 text-[9px] font-bold">
                        {selectedCall!.customer.grade}
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="rounded-full bg-tertiary-fixed px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-tertiary">
                  진행 중
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-headline text-base font-bold">{duration}</span>
                  <div className="flex h-4 items-end gap-0.5">
                    <div
                      className="waveform-bar w-0.5 rounded-full bg-tertiary-fixed"
                      style={{ animationDelay: '0s' }}
                    />
                    <div
                      className="waveform-bar w-0.5 rounded-full bg-tertiary-fixed"
                      style={{ animationDelay: '0.15s' }}
                    />
                    <div
                      className="waveform-bar w-0.5 rounded-full bg-tertiary-fixed"
                      style={{ animationDelay: '0.3s' }}
                    />
                    <div
                      className="waveform-bar w-0.5 rounded-full bg-tertiary-fixed"
                      style={{ animationDelay: '0.45s' }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 rounded-lg bg-surface-container-lowest p-8 text-center shadow-panel">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-container">
              <span className="material-symbols-outlined text-xl text-outline">call</span>
            </div>
            <p className="font-headline text-sm font-semibold text-on-surface">통화 없음</p>
            <p className="text-[11px] text-outline">새 콜이 배정되면 여기에 표시됩니다</p>
          </div>
        )}

        {/* 컨트롤 버튼 — 4개 그리드 */}
        <div className="grid grid-cols-4 gap-2">
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
              message.success(
                selectedCall?.sessionStatus === 'HOLD'
                  ? '보류 해제 요청'
                  : '보류 요청',
              );
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
              message.success(
                transferMode === 'attended'
                  ? `상담 전환: ${target}`
                  : `전환: ${target}`,
              );
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
          <div className="grid grid-cols-2 gap-2">
            <MiniCtrlButton
              icon="merge"
              label="완료"
              onClick={async () => {
                await completeAttendedTransfer();
                message.success('상담 전환 완료 요청');
              }}
            />
            <MiniCtrlButton
              icon="close"
              label="취소"
              tone="danger"
              onClick={async () => {
                await cancelAttendedTransfer();
                message.success('상담 전환 취소 요청');
              }}
            />
          </div>
        ) : null}

        {/* 메모 / 후처리 */}
        <div className="rounded-lg bg-surface-container-lowest p-5 shadow-panel">
          <Form
            form={form}
            layout="vertical"
            onFinish={async (values) => {
              await saveMemo(values.memo, values.resultCode);
              message.success('저장 완료');
            }}
          >
            <div className="mb-3 grid grid-cols-2 gap-3">
              <Form.Item name="resultCode" label={<MiniLabel>결과</MiniLabel>} className="!mb-0">
                <Select options={RESULT_CODES} size="middle" />
              </Form.Item>
              <Form.Item
                name="transferTarget"
                label={<MiniLabel>전환 내선</MiniLabel>}
                className="!mb-0"
              >
                <Input placeholder="예: 1002" size="middle" />
              </Form.Item>
            </div>
            <Form.Item name="transferMode" label={<MiniLabel>전환 방식</MiniLabel>} className="!mb-3">
              <Select
                size="middle"
                options={[
                  { value: 'blind', label: '블라인드 전환' },
                  { value: 'attended', label: '상담 전환' },
                ]}
              />
            </Form.Item>
            <Form.Item name="memo" label={<MiniLabel>메모</MiniLabel>} className="!mb-3">
              <Input.TextArea rows={3} placeholder="상담 메모" className="!resize-none" />
            </Form.Item>
            <button
              type="submit"
              className="btn-primary-gradient w-full rounded-xl py-2.5 font-headline text-sm font-bold shadow shadow-primary/20"
            >
              저장
            </button>
          </Form>
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
    'flex flex-col items-center justify-center gap-1 rounded-lg py-3 transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-40';
  const toneClass =
    tone === 'danger'
      ? 'bg-error text-white hover:opacity-90 shadow-lg shadow-error/20'
      : 'bg-surface-container-lowest text-on-surface hover:bg-surface-container-low shadow-panel';
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`${base} ${toneClass}`}>
      <span className="material-symbols-outlined text-[20px]">{icon}</span>
      <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
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
