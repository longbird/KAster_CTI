import { message } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { AGENT_META } from './statusMeta';
import type { AgentDirectoryItem, CallCapabilities } from '../types/cti';
import { formatPhoneNumber } from '../utils/format';

const LS_CALLER_ID_KEY = 'kaster.outbound_caller_id';

interface Props {
  agents: AgentDirectoryItem[];
  callerIds: string[];
  defaultCallerId: string | null;
  callCapabilities?: CallCapabilities | null;
  minimized: boolean;
  onMinimize: () => void;
  onRestore: () => void;
  onOriginateExternal: (phoneNumber: string, callerId?: string) => Promise<void>;
  onOriginateInternal: (agent: AgentDirectoryItem) => Promise<void>;
}

type Tab = 'external' | 'internal';

export function FloatingDialerWindow({
  agents,
  callerIds,
  defaultCallerId,
  callCapabilities,
  minimized,
  onMinimize,
  onRestore,
  onOriginateExternal,
  onOriginateInternal,
}: Props) {
  const [tab, setTab] = useState<Tab>('external');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [agentQuery, setAgentQuery] = useState('');
  const [selectedCallerId, setSelectedCallerId] = useState('');

  useEffect(() => {
    const persisted = localStorage.getItem(LS_CALLER_ID_KEY) ?? '';
    const next = persisted && callerIds.includes(persisted)
      ? persisted
      : defaultCallerId && callerIds.includes(defaultCallerId)
        ? defaultCallerId
        : callerIds[0] ?? '';
    setSelectedCallerId(next);
  }, [callerIds, defaultCallerId]);

  useEffect(() => {
    if (selectedCallerId) {
      localStorage.setItem(LS_CALLER_ID_KEY, selectedCallerId);
    }
  }, [selectedCallerId]);

  const filteredAgents = useMemo(() => {
    const keyword = agentQuery.trim().toLowerCase();
    return agents
      .filter((agent) => agent.isActive)
      .filter((agent) => (agent.currentStatus?.statusCode ?? '') !== 'MANUAL_PAUSED')
      .filter((agent) => {
        if (!keyword) return true;
        return [agent.agentName, agent.extension, agent.role]
          .some((value) => String(value).toLowerCase().includes(keyword));
      });
  }, [agentQuery, agents]);
  const externalDialEnabled = callCapabilities?.canOriginateExternal !== false;
  const externalDialDisabledReason =
    callCapabilities?.canOriginateExternal === false
      ? callCapabilities.disabledReasons[0] ?? '외부 발신 권한이 없습니다.'
      : callerIds.length === 0
        ? '설정된 발신번호가 없습니다.'
        : null;

  if (minimized) {
    return (
      <button
        type="button"
        onClick={onRestore}
        className="fixed bottom-20 left-4 z-[70] flex items-center gap-3 rounded-full bg-inverse-surface px-5 py-3 text-left text-inverse-on-surface shadow-2xl shadow-inverse-surface/20 transition-all hover:translate-y-[-1px] active:scale-95 md:bottom-6 md:left-[17rem]"
      >
        <span className="material-symbols-outlined">dialpad</span>
        <span>
          <span className="block text-micro font-bold uppercase tracking-widest opacity-70">
            Dialer
          </span>
          <span className="block text-sm font-bold">전화 발신</span>
        </span>
      </button>
    );
  }

  return (
    <aside className="fixed bottom-20 left-4 z-[70] w-[min(440px,calc(100vw-2rem))] rounded-[28px] border border-outline-variant/20 bg-surface-container-lowest p-4 shadow-2xl shadow-shadow/10 md:bottom-6 md:left-[17rem] md:w-[min(440px,calc(100vw-19rem))]">
      <div className="mb-4 flex items-center justify-between gap-3 px-2">
        <div>
          <p className="text-micro font-bold uppercase tracking-[0.28em] text-outline">Call Popup</p>
          <h3 className="font-headline text-lg font-bold text-on-surface">전화 발신</h3>
        </div>
        <button
          type="button"
          onClick={onMinimize}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-container text-on-surface-variant transition-all hover:bg-surface-container-high active:scale-95"
          title="발신창 최소화"
        >
          <span className="material-symbols-outlined">remove</span>
        </button>
      </div>

      <div className="mb-4 inline-flex rounded-full bg-surface-container p-1">
        {(['external', 'internal'] as Tab[]).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={
              tab === item
                ? 'rounded-full bg-surface-container-lowest px-4 py-2 text-sm font-bold text-on-surface shadow-sm'
                : 'rounded-full px-4 py-2 text-sm font-bold text-on-surface-variant'
            }
          >
            {item === 'external' ? '외부 발신' : '내선 통화'}
          </button>
        ))}
      </div>

      {tab === 'external' ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-outline-variant/20 p-4">
            <p className="text-micro font-bold uppercase tracking-widest text-on-surface-variant">발신번호</p>
            <select
              value={selectedCallerId}
              onChange={(event) => setSelectedCallerId(event.target.value)}
              disabled={!externalDialEnabled}
              className="mt-3 w-full rounded-xl border border-outline-variant/30 bg-surface-container-lowest px-4 py-3 text-sm text-on-surface outline-none transition-all focus:border-primary"
            >
              {callerIds.length === 0 ? (
                <option value="">설정된 발신번호 없음</option>
              ) : callerIds.map((callerId) => (
                <option key={callerId} value={callerId}>
                  {formatPhoneNumber(callerId)}
                </option>
              ))}
            </select>
          </div>
          <div className="rounded-2xl border border-outline-variant/20 p-4">
            <p className="text-micro font-bold uppercase tracking-widest text-on-surface-variant">대상 번호</p>
            <input
              value={phoneNumber}
              onChange={(event) => setPhoneNumber(event.target.value)}
              placeholder="전화번호 입력"
              className="mt-3 w-full rounded-xl border border-outline-variant/30 bg-surface-container-lowest px-4 py-3 text-sm text-on-surface outline-none transition-all placeholder:text-outline focus:border-primary"
            />
            <button
              type="button"
              disabled={!phoneNumber.trim() || callerIds.length === 0 || !externalDialEnabled}
              onClick={async () => {
                if (!selectedCallerId) {
                  message.warning('발신번호를 먼저 선택해 주세요');
                  return;
                }
                await onOriginateExternal(phoneNumber.trim(), selectedCallerId);
                message.success(`외부 발신을 요청했습니다: ${formatPhoneNumber(phoneNumber.trim())}`);
                setPhoneNumber('');
              }}
              className="btn-primary-gradient mt-4 w-full rounded-xl py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              발신 요청
            </button>
            {externalDialDisabledReason ? (
              <p className="mt-3 text-xs text-outline">{externalDialDisabledReason}</p>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-outline-variant/20 p-4">
            <p className="text-micro font-bold uppercase tracking-widest text-on-surface-variant">상담원 검색</p>
            <input
              value={agentQuery}
              onChange={(event) => setAgentQuery(event.target.value)}
              placeholder="이름, 내선, 역할 검색"
              className="mt-3 w-full rounded-xl border border-outline-variant/30 bg-surface-container-lowest px-4 py-3 text-sm text-on-surface outline-none transition-all placeholder:text-outline focus:border-primary"
            />
          </div>
          <div className="max-h-[360px] space-y-3 overflow-y-auto pr-1">
            {filteredAgents.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-outline-variant/30 p-8 text-center text-sm text-outline">
                표시할 상담원이 없습니다.
              </div>
            ) : filteredAgents.map((agent) => {
              const status = agent.currentStatus?.statusCode ?? 'MANUAL_PAUSED';
              const meta = AGENT_META[status];
              return (
                <button
                  key={agent.agentId}
                  type="button"
                  onClick={async () => {
                    await onOriginateInternal(agent);
                    message.success(`내선 통화를 요청했습니다: ${agent.agentName} (${agent.extension})`);
                  }}
                  className="w-full rounded-2xl border border-outline-variant/20 p-4 text-left transition-all hover:border-primary/20 hover:bg-surface-container-low active:scale-[0.99]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-bold text-on-surface">{agent.agentName}</p>
                      <p className="mt-1 text-xs text-outline">
                        내선 {agent.extension} · {agent.role}
                      </p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-caption font-bold ${statusToneClass(meta.tone)}`}>
                      {meta.label}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </aside>
  );
}

function statusToneClass(tone: 'info' | 'warn' | 'ok' | 'danger' | 'neutral') {
  switch (tone) {
    case 'ok':
      return 'bg-emerald-50 text-emerald-700';
    case 'warn':
      return 'bg-amber-50 text-amber-700';
    case 'danger':
      return 'bg-rose-50 text-rose-700';
    case 'info':
      return 'bg-sky-50 text-sky-700';
    default:
      return 'bg-slate-100 text-slate-700';
  }
}
