import { Form, Input, Select, Spin, message } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { logout } from '../api';
import { AgentStatusTag } from '../components/AgentStatusTag';
import { useCtiStore } from '../store/useCtiStore';
import { useUiStore } from '../store/useUiStore';
import { formatPhoneNumber } from '../utils/format';

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
      <div className="flex min-h-screen items-center justify-center" style={{ background: 'var(--bg-0)' }}>
        <Spin />
      </div>
    );
  }

  const duration = formatCallDuration(selectedCall?.answeredAt ?? selectedCall?.startedAt);
  const isActive = !!selectedCall;
  const hasOpenConsult = !!selectedCall?.latestTransfer
    && ['REQUESTED', 'CONSULT_RINGING', 'CONSULT_TALKING', 'REBRIDGING'].includes(selectedCall.latestTransfer.phase);

  return (
    <div className="min-h-screen p-3 font-body" style={{ background: 'var(--bg-0)', color: 'var(--fg-1)' }}>
      <div className="mx-auto max-w-[440px] space-y-3">
        {/* Header: 로고 + 에이전트 + 액션 */}
        <div className="k-panel flex items-center justify-between p-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-sm border border-[var(--signal-dim)] bg-[var(--signal-soft)]">
              <span className="material-symbols-outlined text-base" style={{ color: 'var(--signal)' }}>headset_mic</span>
            </div>
            <div className="min-w-0">
              <p className="k-mono text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--signal)' }}>
                KAster CTI
              </p>
              <p className="truncate text-[10px]" style={{ color: 'var(--fg-3)' }}>
                {agentSession?.agentName ?? '-'} · 내선 <span className="k-mono">{agentSession?.extension ?? '-'}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setMode('full')}
              title="Full 모드로 전환"
              className="k-btn k-btn-icon k-btn-sm"
            >
              <span className="material-symbols-outlined text-[16px]">open_in_full</span>
            </button>
            <button
              onClick={() => {
                void onLogout();
              }}
              title="로그아웃"
              className="k-btn k-btn-danger k-btn-icon k-btn-sm"
            >
              <span className="material-symbols-outlined text-[16px]">logout</span>
            </button>
          </div>
        </div>

        {/* Status row */}
        <div className="k-panel flex items-center justify-between p-3">
          <span className="k-eyebrow">현재 상태</span>
          <AgentStatusTag status={agentSession?.statusCode} onChange={changeStatus} />
        </div>

        {/* 현재 콜 — v2 panel with live dot */}
        {isActive ? (
          <div className="k-panel p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="k-dot k-dot-live" style={{ background: 'var(--signal)' }} />
                <span className="k-eyebrow">LIVE</span>
              </div>
              <span className="k-chip is-talking">
                <span className="k-chip-dot" style={{ background: 'var(--accent-info)' }} />
                통화 중<span className="k-chip-code">TALKING</span>
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md border border-[var(--line-2)] bg-[var(--bg-2)]">
                <span className="material-symbols-outlined text-xl text-[var(--fg-2)]">person</span>
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-base font-bold text-[var(--fg-1)]">
                  {selectedCall!.customer?.customerName ?? '미식별 고객'}
                </h3>
                <p className="truncate text-[11px] text-[var(--fg-3)]">
                  <span className="k-mono text-[var(--fg-2)]">{formatPhoneNumber(selectedCall!.ani)}</span>
                  {selectedCall!.customer?.grade && (
                    <span className="ml-1 rounded-sm border border-[var(--line-2)] bg-[var(--bg-2)] px-1.5 py-0.5 text-[9px] font-bold text-[var(--fg-1)]">
                      {selectedCall!.customer.grade}
                    </span>
                  )}
                </p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="k-eyebrow">DURATION</span>
              <div className="flex items-center gap-2">
                <span className="k-num text-lg text-[var(--signal)]">{duration}</span>
                <div className="flex h-4 items-end gap-0.5">
                  <div className="waveform-bar w-0.5 rounded-sm" style={{ background: 'var(--signal)', animationDelay: '0s' }} />
                  <div className="waveform-bar w-0.5 rounded-sm" style={{ background: 'var(--signal)', animationDelay: '0.15s' }} />
                  <div className="waveform-bar w-0.5 rounded-sm" style={{ background: 'var(--signal)', animationDelay: '0.3s' }} />
                  <div className="waveform-bar w-0.5 rounded-sm" style={{ background: 'var(--signal)', animationDelay: '0.45s' }} />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="k-panel flex flex-col items-center gap-2 p-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-md border border-[var(--line-2)] bg-[var(--bg-2)]">
              <span className="material-symbols-outlined text-xl text-[var(--fg-3)]">call</span>
            </div>
            <p className="text-sm font-semibold text-[var(--fg-1)]">통화 없음</p>
            <p className="text-[11px] text-[var(--fg-3)]">새 콜이 배정되면 여기에 표시됩니다</p>
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
        <div className="k-panel p-5">
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
              className="k-btn k-btn-primary w-full"
              style={{ height: 36 }}
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
    'flex flex-col items-center justify-center gap-1 rounded-sm py-3 transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 border';
  const toneClass =
    tone === 'danger'
      ? 'border-[rgba(248,113,113,0.35)] bg-transparent text-[var(--accent-danger)] hover:bg-[var(--accent-danger-soft)]'
      : 'border-[var(--line-1)] bg-[var(--bg-1)] text-[var(--fg-1)] hover:bg-[var(--bg-2)] hover:border-[var(--line-3)]';
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`${base} ${toneClass}`}>
      <span className="material-symbols-outlined text-[20px]">{icon}</span>
      <span className="k-mono text-[10px] font-bold uppercase tracking-wider">{label}</span>
    </button>
  );
}

function MiniLabel({ children }: { children: React.ReactNode }) {
  return <span className="k-eyebrow">{children}</span>;
}
