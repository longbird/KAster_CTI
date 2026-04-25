import { Form, Input, Select, Spin, message } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { logout } from '../api';
import { AgentStatusTag } from '../components/AgentStatusTag';
import { ThemeToggle } from '../components/ThemeToggle';
import { useCtiStore } from '../store/useCtiStore';
import { useUiStore } from '../store/useUiStore';
import { formatPhoneNumber } from '../utils/format';

// MiniShell — 420px dark-pro card (5-section redesign).
// Sections: Header / Summary Grid / Active Call Card / Quick Controls / Notes.
// All store wiring and handler names preserved from original.

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
      <div
        className="flex min-h-screen items-center justify-center"
        style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
      >
        <Spin />
      </div>
    );
  }

  const duration = formatCallDuration(selectedCall?.answeredAt ?? selectedCall?.startedAt);
  const isActive = !!selectedCall;
  const hasOpenConsult =
    !!selectedCall?.latestTransfer &&
    ['REQUESTED', 'CONSULT_RINGING', 'CONSULT_TALKING', 'REBRIDGING'].includes(
      selectedCall.latestTransfer.phase,
    );

  const queuedCount = activeCalls.filter((c) => c.sessionStatus === 'QUEUED').length;
  const STATUS_LABEL: Record<string, string> = {
    AVAILABLE: '대기',
    RINGING: '링 중',
    TALKING: '통화 중',
    AFTER_CALL_WORK: '후처리',
    BREAK: '휴식',
    MEAL: '식사',
    TRAINING: '교육',
    MANUAL_PAUSED: '일시정지',
  };
  const statusLabel = agentSession?.statusCode
    ? (STATUS_LABEL[agentSession.statusCode] ?? agentSession.statusCode)
    : '-';

  const customerName = selectedCall?.customer?.customerName ?? '미식별 고객';
  const customerInitial = customerName.charAt(0).toUpperCase();
  const phone = formatPhoneNumber(selectedCall?.ani);
  const transferStateLabel = selectedCall?.latestTransfer
    ? `${selectedCall.latestTransfer.phase} · ${selectedCall.latestTransfer.toExtension ?? '-'}`
    : '-';

  return (
    <div
      className="mx-auto flex flex-col gap-3 p-3"
      style={{
        width: 420,
        minHeight: '100vh',
        background: 'var(--bg-surface)',
        color: 'var(--text-primary)',
      }}
    >
      {/* ── 1. Header ── */}
      <header
        className="flex items-center gap-3 rounded-lg p-3"
        style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)' }}
      >
        <div
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] text-xs font-extrabold text-white"
          style={{
            background: 'linear-gradient(135deg, var(--accent-strong), var(--accent))',
            boxShadow: '0 0 10px var(--accent-glow)',
          }}
        >
          K
        </div>
        <div className="min-w-0 flex-1">
          <div
            style={{
              color: 'var(--accent)',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            KASTER CTI
          </div>
          <div style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 600 }}>
            {agentSession?.agentName ?? '-'}
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
            내선 {agentSession?.extension ?? '-'} · 미니 패널
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1">
          <ThemeToggle compact />
          <button
            type="button"
            onClick={() => setMode('full')}
            title="전체 모드"
            className="flex h-7 w-7 items-center justify-center rounded"
            style={{
              background: 'var(--bg-elevated)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              open_in_full
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              void onLogout();
            }}
            title="로그아웃"
            className="flex h-7 w-7 items-center justify-center rounded"
            style={{ color: 'var(--status-danger)' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              logout
            </span>
          </button>
        </div>
        <AgentStatusTag status={agentSession?.statusCode} onChange={changeStatus} />
      </header>

      {/* ── 2. Summary Grid (3-col) ── */}
      <section className="grid grid-cols-3 gap-2">
        {[
          { label: '근무 상태', value: statusLabel },
          { label: '활성 통화', value: activeCalls.length },
          { label: '대기 큐', value: queuedCount },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-[9px] p-3 text-center"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
          >
            <div style={{ color: 'var(--text-secondary)', fontSize: 10 }}>{item.label}</div>
            <div
              style={{
                color: 'var(--text-primary)',
                fontWeight: 700,
                fontSize: 14,
                marginTop: 2,
              }}
            >
              {item.value}
            </div>
          </div>
        ))}
      </section>

      {/* ── 3. Active Call Card ── */}
      {isActive ? (
        <section
          className="relative overflow-hidden rounded-lg p-4"
          style={{
            background: 'linear-gradient(135deg, var(--mini-card-from), var(--mini-card-to))',
            border: '1px solid var(--accent-border)',
          }}
        >
          {/* glow blobs */}
          <div
            className="pointer-events-none absolute -left-6 -top-6 h-24 w-24 rounded-full"
            style={{ background: 'var(--accent-glow)', filter: 'blur(30px)' }}
          />
          <div
            className="pointer-events-none absolute -right-6 -bottom-6 h-24 w-24 rounded-full"
            style={{ background: 'var(--accent-glow)', filter: 'blur(30px)' }}
          />

          {/* caller row */}
          <div className="relative flex items-center gap-3">
            <div
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full"
              style={{ background: 'var(--accent-dim)' }}
            >
              <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{customerInitial}</span>
            </div>
            <div className="min-w-0 flex-1">
              <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{customerName}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
                {phone}
                {selectedCall?.dnis ? ` · DID ${formatPhoneNumber(selectedCall.dnis)}` : ''}
              </div>
              {selectedCall?.queueName ? (
                <div style={{ color: 'var(--accent)', fontSize: 10, fontWeight: 600, marginTop: 2 }}>
                  {selectedCall.queueName}
                </div>
              ) : null}
            </div>
          </div>

          {/* duration + transfer state */}
          <div className="relative mt-3 grid grid-cols-2 gap-3">
            <div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 10 }}>통화시간</div>
              <div className="flex items-end gap-2">
                <div
                  style={{
                    color: 'var(--accent)',
                    fontWeight: 700,
                    fontSize: 20,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {duration}
                </div>
                {selectedCall?.answeredAt ? (
                  <div className="flex items-end gap-0.5">
                    {[0, 0.15, 0.3, 0.45].map((delay, i) => (
                      <div
                        key={i}
                        className="waveform-bar rounded-full"
                        style={{
                          width: 3,
                          background: 'var(--accent)',
                          animationDelay: `${delay}s`,
                        }}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
            <div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 10 }}>전환상태</div>
              <div style={{ color: 'var(--text-primary)', fontSize: 13, marginTop: 4 }}>
                {transferStateLabel}
              </div>
              {selectedCall?.customer?.grade ? (
                <div style={{ color: 'var(--text-secondary)', fontSize: 10, marginTop: 2 }}>
                  고객 등급 {selectedCall.customer.grade}
                </div>
              ) : null}
            </div>
          </div>
        </section>
      ) : (
        /* ── Empty state ── */
        <section
          className="rounded-lg p-6 text-center"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
        >
          <div
            className="mx-auto flex h-12 w-12 items-center justify-center rounded-full"
            style={{ background: 'var(--bg-raised)' }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 22, color: 'var(--text-secondary)' }}
            >
              ring_volume
            </span>
          </div>
          <div style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, marginTop: 12 }}>
            수신 대기 중
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 4 }}>
            진행 중인 통화가 없습니다
          </div>
        </section>
      )}

      {/* ── 4. Quick Controls (2x2) ── */}
      <section
        className="rounded-lg p-3"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
      >
        <div className="mb-3 flex items-center justify-between">
          <div
            style={{
              color: 'var(--text-secondary)',
              fontSize: 10,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
            }}
          >
            빠른 제어
          </div>
          {hasOpenConsult ? (
            <span
              style={{
                background: 'var(--accent-dim)',
                color: 'var(--accent)',
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 20,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}
            >
              상담 전환 진행 중
            </span>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-2">
          {/* Pickup / Mute (dual-role) */}
          <QuickCtrlButton
            icon={isActive && !selectedCall?.answeredAt ? 'phone_in_talk' : 'mic_off'}
            label={
              isActive && !selectedCall?.answeredAt
                ? '당겨받기'
                : selectedCall?.isMuted
                  ? '음소거 해제'
                  : '음소거'
            }
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
          {/* Hold */}
          <QuickCtrlButton
            icon={selectedCall?.sessionStatus === 'HOLD' ? 'play_arrow' : 'pause'}
            label={selectedCall?.sessionStatus === 'HOLD' ? '보류 해제' : '보류'}
            disabled={!isActive || !agentSession?.callControlCapabilities?.holdEnabled}
            onClick={async () => {
              await toggleHold();
              message.success(
                selectedCall?.sessionStatus === 'HOLD' ? '보류 해제 요청' : '보류 요청',
              );
            }}
          />
          {/* Transfer */}
          <QuickCtrlButton
            icon="phone_forwarded"
            label="전환"
            disabled={!isActive}
            onClick={async () => {
              const target = form.getFieldValue('transferTarget') as string;
              const transferMode =
                (form.getFieldValue('transferMode') as 'blind' | 'attended') ?? 'blind';
              if (!target) {
                message.warning('아래 내선 입력 필요');
                return;
              }
              await transfer(target, transferMode);
              message.success(
                transferMode === 'attended' ? `상담 전환: ${target}` : `전환: ${target}`,
              );
            }}
          />
          {/* Hangup */}
          <QuickCtrlButton
            icon="call_end"
            label="종료"
            danger
            disabled={!isActive}
            onClick={async () => {
              await hangup();
              message.success('통화 종료 요청');
            }}
          />
        </div>

        {/* Attended-transfer completion controls */}
        {hasOpenConsult ? (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <QuickCtrlButton
              icon="merge"
              label="상담 전환 완료"
              onClick={async () => {
                await completeAttendedTransfer();
                message.success('상담 전환 완료 요청');
              }}
            />
            <QuickCtrlButton
              icon="close"
              label="상담 전환 취소"
              danger
              onClick={async () => {
                await cancelAttendedTransfer();
                message.success('상담 전환 취소 요청');
              }}
            />
          </div>
        ) : null}
      </section>

      {/* ── 5. Notes Section ── */}
      <section
        className="rounded-lg p-3"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
      >
        <div
          style={{
            color: 'var(--text-secondary)',
            fontSize: 10,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            marginBottom: 10,
          }}
        >
          메모 및 후처리
        </div>
        <Form
          form={form}
          layout="vertical"
          onFinish={async (values) => {
            await saveMemo(values.memo, values.resultCode);
            message.success('저장 완료');
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            <Form.Item name="resultCode" label={<MiniLabel>결과</MiniLabel>} className="!mb-2">
              <Select options={RESULT_CODES} size="small" />
            </Form.Item>
            <Form.Item name="transferTarget" label={<MiniLabel>전환 내선</MiniLabel>} className="!mb-2">
              <Input placeholder="예: 1002" size="small" />
            </Form.Item>
          </div>
          <Form.Item name="transferMode" label={<MiniLabel>전환 방식</MiniLabel>} className="!mb-2">
            <Select
              size="small"
              options={[
                { value: 'blind', label: '블라인드 전환' },
                { value: 'attended', label: '상담 전환' },
              ]}
            />
          </Form.Item>
          <Form.Item name="memo" label={<MiniLabel>메모</MiniLabel>} className="!mb-2">
            <Input.TextArea rows={4} placeholder="상담 메모" className="!resize-none" />
          </Form.Item>
          <button
            type="submit"
            className="btn-primary-gradient w-full rounded-md py-2 text-sm font-semibold"
          >
            메모 저장
          </button>
        </Form>
      </section>
    </div>
  );
}

// ── Sub-components ──

function QuickCtrlButton({
  icon,
  label,
  onClick,
  disabled,
  danger = false,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center justify-center rounded-md py-3 transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
      style={{
        minHeight: 70,
        background: danger ? 'rgba(248,81,73,0.08)' : 'var(--bg-raised)',
        border: `1px solid ${danger ? 'rgba(248,81,73,0.3)' : 'var(--border-subtle)'}`,
        color: danger ? 'var(--status-danger)' : 'var(--text-primary)',
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 22 }}>
        {icon}
      </span>
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginTop: 4,
        }}
      >
        {label}
      </span>
    </button>
  );
}

function MiniLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: 'var(--text-secondary)',
      }}
    >
      {children}
    </span>
  );
}
