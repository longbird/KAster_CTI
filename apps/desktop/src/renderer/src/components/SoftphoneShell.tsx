import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ActiveCall, AgentStatusCode } from '../../../shared/cti';
import type {
  DesktopAgentDirectoryItem,
  DesktopAudioPreferences,
  DesktopCallContext,
  DesktopCallPreferences,
  DesktopConfig,
  DesktopGeneralPreferences,
  DesktopRingTonePresetId,
  DesktopTransferHotkeySlot,
} from '../../../shared/ipc';
import { CallInfoPanel } from './CallInfoPanel';
import { RingingAutoTimer } from './RingingAutoTimer';
import { TransferHotkeyEditor } from './TransferHotkeyEditor';
import type { SoftphoneState } from '../softphone/softphone-runtime';
import { evaluateSoftphoneReadiness } from '../softphone/softphone-readiness';
import {
  deriveDesktopConsoleState,
  getWindowModeForConsoleState,
} from './desktop-console-state';
import {
  formatDirectoryAgentSummary,
  getAgentCallBlockReason,
} from './agent-directory-display';

const AGENT_STATUS_OPTIONS: Array<{ value: AgentStatusCode; label: string }> = [
  { value: 'AVAILABLE', label: '대기' },
  { value: 'BREAK', label: '휴식' },
  { value: 'MEAL', label: '식사' },
  { value: 'TRAINING', label: '교육' },
  { value: 'MANUAL_PAUSED', label: '중지' },
  { value: 'AFTER_CALL_WORK', label: '후처리' },
];

const TRANSFER_READY_STATUSES = new Set(['TALKING', 'HOLD', 'TRANSFERRING']);

const STATUSES_REQUIRING_REASON: Set<AgentStatusCode> = new Set([
  'BREAK',
  'MEAL',
  'TRAINING',
  'MANUAL_PAUSED',
]);

function formatAgentStatus(status: AgentStatusCode | null) {
  return AGENT_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? '중지';
}

function getCallTitle(activeCall: ActiveCall | null, softphone: SoftphoneState | null) {
  if (activeCall) {
    return activeCall.ani || activeCall.linkedid;
  }

  if (softphone?.session) {
    return softphone.session.remoteDisplayName || softphone.session.remoteUri || 'Softphone';
  }

  return '대기 중';
}

function getCallSubtitle(activeCall: ActiveCall | null, softphone: SoftphoneState | null) {
  if (activeCall) {
    return [activeCall.queueName, activeCall.dnis, activeCall.sessionStatus].filter(Boolean).join(' / ');
  }

  if (softphone?.session) {
    return [softphone.session.direction === 'incoming' ? '수신' : '발신', softphone.session.phase]
      .filter(Boolean)
      .join(' / ');
  }

  if (softphone?.lastError) {
    return softphone.lastError;
  }

  return '필요한 작업만 표시합니다.';
}

export function SoftphoneShell({
  config,
  agentName,
  agentId,
  extension,
  agentStatus,
  runtimeConnection,
  activeCall,
  audioPermission,
  refreshingAudioDevices,
  audioPreferences,
  audioDevices,
  audioCapabilities,
  softphone,
  callerIds,
  defaultCallerId,
  agentDirectory,
  onReconnectRuntime,
  onChangeAgentStatus,
  onPickup,
  onOriginate,
  onOriginateInternal,
  onOpenCallHistoryPopup,
  onOpenAgentListPopup,
  onOpenDialpadPopup,
  onMute,
  onHangup,
  onToggleHold,
  onTransfer,
  onCancelAttendedTransfer,
  onCompleteAttendedTransfer,
  onRefreshAudioDevices,
  onRequestAudioPermission,
  onChangeAudioPreferences,
  generalPreferences,
  onChangeGeneralPreferences,
  onPlayOutputPreview,
  onPlayRingPreview,
  onStartSoftphone,
  onStopSoftphone,
  onAnswerSoftphoneCall,
  onRejectSoftphoneCall,
  onHangupSoftphoneCall,
}: {
  config: DesktopConfig;
  agentName: string;
  agentId?: string | null;
  extension: string;
  agentStatus: AgentStatusCode | null;
  runtimeConnection: 'idle' | 'connected' | 'reconnecting' | 'disconnected' | 'error';
  activeCall: ActiveCall | null;
  audioPermission: 'unknown' | 'granted' | 'denied' | 'unsupported';
  refreshingAudioDevices: boolean;
  audioPreferences: DesktopAudioPreferences | null;
  audioDevices: {
    inputs: Array<{ deviceId: string; label: string }>;
    outputs: Array<{ deviceId: string; label: string }>;
  };
  audioCapabilities: {
    sinkSelectionSupported: boolean;
  };
  softphone: SoftphoneState | null;
  callerIds: string[];
  defaultCallerId: string | null;
  agentDirectory: DesktopAgentDirectoryItem[];
  onReconnectRuntime: () => void;
  onChangeAgentStatus: (statusCode: AgentStatusCode, reasonCode?: string) => void;
  onPickup: () => void;
  onOriginate: (phoneNumber: string, callerId?: string) => Promise<void> | void;
  onOriginateInternal: (target: DesktopAgentDirectoryItem) => Promise<void> | void;
  onOpenCallHistoryPopup: () => void;
  onOpenAgentListPopup: () => void;
  onOpenDialpadPopup: (mode?: 'originate' | 'dtmf') => void;
  onMute: () => void;
  onHangup: () => void;
  onToggleHold: () => void;
  onTransfer: (target: string, mode: 'blind' | 'attended') => void;
  onCancelAttendedTransfer: () => void;
  onCompleteAttendedTransfer: () => void;
  onRefreshAudioDevices: () => void;
  onRequestAudioPermission: () => void;
  onChangeAudioPreferences: (input: DesktopAudioPreferences) => void;
  generalPreferences: DesktopGeneralPreferences;
  onChangeGeneralPreferences: (input: DesktopGeneralPreferences) => void;
  onPlayOutputPreview: () => void;
  onPlayRingPreview: () => void;
  onStartSoftphone: () => void;
  onStopSoftphone: () => void;
  onAnswerSoftphoneCall: () => void;
  onRejectSoftphoneCall: () => void;
  onHangupSoftphoneCall: () => void;
}) {
  const [view, setView] = useState<'call' | 'settings'>('call');
  const [settingsTab, setSettingsTab] = useState<'call' | 'device' | 'general' | 'diagnostics'>('call');
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [dialPending, setDialPending] = useState(false);
  const [dialError, setDialError] = useState<string | null>(null);
  const [internalTarget, setInternalTarget] = useState<DesktopAgentDirectoryItem | null>(null);
  const [internalPending, setInternalPending] = useState(false);
  const [internalError, setInternalError] = useState<string | null>(null);
  const [transferTarget, setTransferTarget] = useState('');
  const [transferMode, setTransferMode] = useState<'blind' | 'attended'>('blind');
  const [dialNumber, setDialNumber] = useState('');
  const [selectedCallerId, setSelectedCallerId] = useState(defaultCallerId ?? callerIds[0] ?? '');
  const [audioDraft, setAudioDraft] = useState<DesktopAudioPreferences>(() => ({
    inputDeviceId: audioPreferences?.inputDeviceId ?? null,
    outputDeviceId: audioPreferences?.outputDeviceId ?? null,
    ringDeviceId: audioPreferences?.ringDeviceId ?? null,
    echoCancellation: audioPreferences?.echoCancellation ?? true,
    noiseSuppression: audioPreferences?.noiseSuppression ?? true,
  }));

  useEffect(() => {
    setAudioDraft({
      inputDeviceId: audioPreferences?.inputDeviceId ?? null,
      outputDeviceId: audioPreferences?.outputDeviceId ?? null,
      ringDeviceId: audioPreferences?.ringDeviceId ?? null,
      echoCancellation: audioPreferences?.echoCancellation ?? true,
      noiseSuppression: audioPreferences?.noiseSuppression ?? true,
    });
  }, [audioPreferences]);

  useEffect(() => {
    setSelectedCallerId((current) => {
      if (current && callerIds.includes(current)) {
        return current;
      }
      return defaultCallerId ?? callerIds[0] ?? '';
    });
  }, [callerIds, defaultCallerId]);

  const consoleState = deriveDesktopConsoleState({
    activeCall,
    softphone,
    settingsOpen: view === 'settings',
  });

  useEffect(() => {
    const desktopApi =
      typeof window !== 'undefined' && 'desktopApi' in window ? window.desktopApi : null;
    void desktopApi?.setWindowMode?.(getWindowModeForConsoleState(consoleState));
  }, [consoleState]);

  const [callContext, setCallContext] = useState<DesktopCallContext | null>(null);
  const [callContextLoading, setCallContextLoading] = useState(false);
  const [callContextError, setCallContextError] = useState<string | null>(null);
  const [callPreferences, setCallPreferences] = useState<DesktopCallPreferences>({
    autoAnswerSeconds: 0,
    autoRejectSeconds: 0,
    autoStatusAfterCallSeconds: 0,
  });

  useEffect(() => {
    const desktopApi =
      typeof window !== 'undefined' && 'desktopApi' in window ? window.desktopApi : null;
    if (!desktopApi?.getCallPreferences) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const prefs = await desktopApi.getCallPreferences();
        if (!cancelled) {
          setCallPreferences(prefs);
        }
      } catch {
        // 설정 조회 실패 시 기본값 유지
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const updateCallPreferences = useCallback(async (next: DesktopCallPreferences) => {
    const desktopApi =
      typeof window !== 'undefined' && 'desktopApi' in window ? window.desktopApi : null;
    if (!desktopApi?.saveCallPreferences) {
      return;
    }
    const saved = await desktopApi.saveCallPreferences(next);
    setCallPreferences(saved);
  }, []);

  const [transferHotkeys, setTransferHotkeys] = useState<DesktopTransferHotkeySlot[]>([]);

  useEffect(() => {
    const desktopApi =
      typeof window !== 'undefined' && 'desktopApi' in window ? window.desktopApi : null;
    if (!desktopApi?.getTransferHotkeys) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const list = await desktopApi.getTransferHotkeys();
        if (!cancelled) {
          setTransferHotkeys(list);
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const updateTransferHotkeys = useCallback(async (next: DesktopTransferHotkeySlot[]) => {
    const desktopApi =
      typeof window !== 'undefined' && 'desktopApi' in window ? window.desktopApi : null;
    if (!desktopApi?.saveTransferHotkeys) {
      return;
    }
    const saved = await desktopApi.saveTransferHotkeys(next);
    setTransferHotkeys(saved);
  }, []);

  const [pendingStatus, setPendingStatus] = useState<AgentStatusCode | null>(null);
  const [reasonDraft, setReasonDraft] = useState('');

  const triggerTransferHotkey = useCallback(
    (slotNumber: number) => {
      const slot = transferHotkeys.find((entry) => entry.slot === slotNumber);
      if (!slot || !slot.target) {
        return;
      }
      if (!activeCall || !TRANSFER_READY_STATUSES.has(activeCall.sessionStatus)) {
        return;
      }
      onTransfer(slot.target, slot.mode);
    },
    [transferHotkeys, activeCall, onTransfer],
  );

  useEffect(() => {
    if (consoleState !== 'talking' && consoleState !== 'transferring') {
      return;
    }
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
      return;
    }
    const handler = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) {
          return;
        }
      }
      if (event.key < '1' || event.key > '9') {
        return;
      }
      const slot = Number(event.key);
      const has = transferHotkeys.some((entry) => entry.slot === slot);
      if (!has) {
        return;
      }
      event.preventDefault();
      triggerTransferHotkey(slot);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [consoleState, transferHotkeys, triggerTransferHotkey]);

  const handleAgentStatusChange = useCallback(
    (statusCode: AgentStatusCode) => {
      if (STATUSES_REQUIRING_REASON.has(statusCode)) {
        setPendingStatus(statusCode);
        setReasonDraft('');
        return;
      }
      onChangeAgentStatus(statusCode);
    },
    [onChangeAgentStatus],
  );

  const confirmStatusReason = useCallback(() => {
    if (!pendingStatus) {
      return;
    }
    const reason = reasonDraft.trim();
    onChangeAgentStatus(pendingStatus, reason || undefined);
    setPendingStatus(null);
    setReasonDraft('');
  }, [pendingStatus, reasonDraft, onChangeAgentStatus]);

  const cancelStatusReason = useCallback(() => {
    setPendingStatus(null);
    setReasonDraft('');
  }, []);

  const activeCallId = activeCall?.callId ?? null;
  const showCallInfo = consoleState === 'talking' || consoleState === 'transferring' || consoleState === 'afterCall';

  useEffect(() => {
    const desktopApi =
      typeof window !== 'undefined' && 'desktopApi' in window ? window.desktopApi : null;
    if (!activeCallId || !desktopApi?.getCallContext || !showCallInfo) {
      setCallContext(null);
      setCallContextError(null);
      return;
    }

    let cancelled = false;
    setCallContextLoading(true);
    setCallContextError(null);
    void (async () => {
      try {
        const context = await desktopApi.getCallContext(activeCallId);
        if (!cancelled) {
          setCallContext(context);
        }
      } catch (error) {
        if (!cancelled) {
          setCallContextError(error instanceof Error ? error.message : '알 수 없는 오류');
        }
      } finally {
        if (!cancelled) {
          setCallContextLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeCallId, showCallInfo, activeCall?.sessionStatus]);

  const handleSaveMemo = useCallback(
    async (memoText: string) => {
      const desktopApi =
        typeof window !== 'undefined' && 'desktopApi' in window ? window.desktopApi : null;
      if (!desktopApi?.saveCallMemo || !activeCallId || !agentId) {
        throw new Error('메모를 저장할 수 없습니다.');
      }
      const memo = await desktopApi.saveCallMemo({
        callId: activeCallId,
        agentId,
        memoText,
        memoType: 'acw',
        isFinal: false,
      });
      setCallContext((prev) => {
        if (!prev) {
          return prev;
        }
        const filtered = prev.memos.filter((existing) => existing.callMemoId !== memo.callMemoId);
        return { ...prev, memos: [memo, ...filtered] };
      });
    },
    [activeCallId, agentId],
  );

  const syncAudioDraft = (next: Partial<DesktopAudioPreferences>) => {
    const merged = {
      ...audioDraft,
      ...next,
    };
    setAudioDraft(merged);
    void onChangeAudioPreferences(merged);
  };

  const runtimeReady = runtimeConnection === 'connected';
  const transferAvailable =
    runtimeReady && activeCall && TRANSFER_READY_STATUSES.has(activeCall.sessionStatus);
  const readiness = evaluateSoftphoneReadiness({ runtimeConnection, softphone });
  const availableAgents = useMemo(
    () => agentDirectory.filter((agent) => agent.extension !== extension).slice(0, 5),
    [agentDirectory, extension],
  );
  const canDialExternal =
    runtimeReady
    && Boolean(dialNumber.trim())
    && !dialPending;
  const canAnswerRinging =
    activeCall
      ? runtimeReady
      : Boolean(softphone?.session && softphone.session.phase === 'ringing');

  useEffect(() => {
    void window.desktopApi?.recordDiagnosticEvent?.({
      stage: 'renderer:originate-ui-state',
      detail: {
        runtimeReady,
        canDialExternal,
        hasDialNumber: Boolean(dialNumber.trim()),
        callerIdsCount: callerIds.length,
        softphoneRegistration: softphone?.registration ?? null,
        dialPending,
      },
    });
  }, [
    runtimeReady,
    canDialExternal,
    dialNumber,
    callerIds.length,
    softphone?.registration,
    dialPending,
  ]);

  const handleExternalOriginate = async () => {
    if (!canDialExternal) {
      void window.desktopApi?.recordDiagnosticEvent?.({
        stage: 'renderer:originate-ui-blocked',
        detail: {
          runtimeReady,
          hasDialNumber: Boolean(dialNumber.trim()),
          callerIdsCount: callerIds.length,
          softphoneRegistration: softphone?.registration ?? null,
          dialPending,
        },
      });
      return;
    }

    setDialPending(true);
    setDialError(null);
    try {
      void window.desktopApi?.recordDiagnosticEvent?.({
        stage: 'renderer:originate-click',
        detail: {
          phoneNumber: dialNumber.trim(),
          callerId: selectedCallerId || null,
          softphoneRegistration: softphone?.registration ?? null,
          runtimeReady,
        },
      });
      await onOriginate(dialNumber, selectedCallerId);
    } catch (error) {
      setDialError(error instanceof Error ? error.message : '발신 요청 실패');
    } finally {
      setDialPending(false);
    }
  };

  const handleInternalOriginate = async () => {
    if (!internalTarget) {
      return;
    }
    const blockReason = getAgentCallBlockReason(internalTarget);
    if (blockReason) {
      setInternalError(`내선 통화 불가: ${blockReason}`);
      return;
    }

    setInternalPending(true);
    setInternalError(null);
    try {
      await onOriginateInternal(internalTarget);
      setInternalTarget(null);
    } catch (error) {
      setInternalError(error instanceof Error ? error.message : '내선 발신 요청 실패');
    } finally {
      setInternalPending(false);
    }
  };

  if (view === 'settings') {
    return (
      <section className="desktop-console desktop-console-settings">
        <ConsoleHeader
          agentName={agentName}
          extension={extension}
          statusLabel={formatAgentStatus(agentStatus)}
          agentStatus={agentStatus}
          onChangeAgentStatus={handleAgentStatusChange}
          onOpenSettings={() => setView('call')}
          settingsLabel="통화"
        />

        <nav className="settings-tabs" aria-label="설정 분류">
          {[
            ['call', '통화'],
            ['device', '장치'],
            ['general', '일반'],
            ['diagnostics', '진단'],
          ].map(([tab, label]) => (
            <button
              key={tab}
              type="button"
              className={settingsTab === tab ? 'active' : ''}
              aria-pressed={settingsTab === tab}
              onClick={() => setSettingsTab(tab as typeof settingsTab)}
            >
              {label}
            </button>
          ))}
        </nav>

        {settingsTab === 'call' ? (
          <>
            <section className="console-section">
              <div className="console-section-title">
                <h2>통화 자동 처리</h2>
              </div>
              <p className="console-muted">0초 = 사용 안 함. 각 항목은 1~60초로 제한됩니다.</p>
              <div className="call-pref-grid">
                <label className="field">
                  <span>자동 응답</span>
                  <input
                    type="number"
                    min={0}
                    max={60}
                    value={callPreferences.autoAnswerSeconds}
                    onChange={(event) => {
                      const next = Math.max(0, Math.min(60, Number(event.target.value) || 0));
                      void updateCallPreferences({ ...callPreferences, autoAnswerSeconds: next });
                    }}
                  />
                </label>
                <label className="field">
                  <span>자동 거절</span>
                  <input
                    type="number"
                    min={0}
                    max={60}
                    value={callPreferences.autoRejectSeconds}
                    onChange={(event) => {
                      const next = Math.max(0, Math.min(60, Number(event.target.value) || 0));
                      void updateCallPreferences({ ...callPreferences, autoRejectSeconds: next });
                    }}
                  />
                </label>
                <label className="field">
                  <span>후처리 자동 종료</span>
                  <input
                    type="number"
                    min={0}
                    max={60}
                    value={callPreferences.autoStatusAfterCallSeconds}
                    onChange={(event) => {
                      const next = Math.max(0, Math.min(60, Number(event.target.value) || 0));
                      void updateCallPreferences({ ...callPreferences, autoStatusAfterCallSeconds: next });
                    }}
                  />
                </label>
              </div>
            </section>

            <section className="console-section">
              <div className="console-section-title">
                <h2>전환 단축키</h2>
              </div>
              <p className="console-muted">통화 중 1~9 키로 즉시 전환.</p>
              <TransferHotkeyEditor slots={transferHotkeys} onSave={updateTransferHotkeys} />
            </section>
          </>
        ) : null}

        {settingsTab === 'device' ? (
          <section className="console-section">
            <div className="console-section-title">
              <h2>오디오</h2>
              <div className="console-actions">
                <button type="button" onClick={onRequestAudioPermission}>
                  권한
                </button>
                <button type="button" onClick={onRefreshAudioDevices} disabled={refreshingAudioDevices}>
                  {refreshingAudioDevices ? '갱신 중' : '새로고침'}
                </button>
              </div>
            </div>
            <p className="console-muted">권한 {audioPermission} / 출력 라우팅 {audioCapabilities.sinkSelectionSupported ? '지원' : '미지원'}</p>
            <div className="audio-settings-grid">
              <DeviceSelect
                label="마이크"
                value={audioDraft.inputDeviceId ?? ''}
                options={audioDevices.inputs}
                onChange={(value) => syncAudioDraft({ inputDeviceId: value || null })}
              />
              <DeviceSelect
                label="스피커"
                value={audioDraft.outputDeviceId ?? ''}
                options={audioDevices.outputs}
                onChange={(value) => syncAudioDraft({ outputDeviceId: value || null })}
              />
              <DeviceSelect
                label="벨소리"
                value={audioDraft.ringDeviceId ?? ''}
                options={audioDevices.outputs}
                onChange={(value) => syncAudioDraft({ ringDeviceId: value || null })}
              />
            </div>
            <div className="toggle-grid">
              <label>
                <input
                  type="checkbox"
                  checked={audioDraft.echoCancellation}
                  onChange={(event) => syncAudioDraft({ echoCancellation: event.target.checked })}
                />
                Echo cancellation
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={audioDraft.noiseSuppression}
                  onChange={(event) => syncAudioDraft({ noiseSuppression: event.target.checked })}
                />
                Noise suppression
              </label>
            </div>
            <div className="console-actions">
              <button type="button" disabled={!audioCapabilities.sinkSelectionSupported} onClick={onPlayOutputPreview}>
                스피커 테스트
              </button>
              <button type="button" disabled={!audioCapabilities.sinkSelectionSupported} onClick={onPlayRingPreview}>
                벨소리 테스트
              </button>
            </div>
          </section>
        ) : null}

        {settingsTab === 'general' ? (
          <section className="console-section">
            <div className="console-section-title">
              <h2>일반 설정</h2>
            </div>
            <div className="general-pref-grid">
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={generalPreferences.autoStart}
                  onChange={(event) =>
                    onChangeGeneralPreferences({
                      ...generalPreferences,
                      autoStart: event.target.checked,
                    })
                  }
                />
                <span>윈도우 시작 시 자동 실행</span>
              </label>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={generalPreferences.autoLogin}
                  onChange={(event) =>
                    onChangeGeneralPreferences({
                      ...generalPreferences,
                      autoLogin: event.target.checked,
                    })
                  }
                />
                <span>저장된 세션으로 자동 로그인</span>
              </label>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={generalPreferences.alwaysOnTop}
                  onChange={(event) =>
                    onChangeGeneralPreferences({
                      ...generalPreferences,
                      alwaysOnTop: event.target.checked,
                    })
                  }
                />
                <span>항상 위에 표시</span>
              </label>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={generalPreferences.closeToTray}
                  onChange={(event) =>
                    onChangeGeneralPreferences({
                      ...generalPreferences,
                      closeToTray: event.target.checked,
                    })
                  }
                />
                <span>닫기 버튼 → 트레이로 최소화 (해제 시 종료)</span>
              </label>
              <label className="field general-pref-ringtone">
                <span>벨소리 음원</span>
                <select
                  value={generalPreferences.ringTonePresetId}
                  onChange={(event) =>
                    onChangeGeneralPreferences({
                      ...generalPreferences,
                      ringTonePresetId: event.target.value as DesktopRingTonePresetId,
                    })
                  }
                >
                  <option value="classic">클래식 (높은 톤)</option>
                  <option value="soft">소프트 (낮은 톤)</option>
                  <option value="urgent">긴급 (짧고 빠른 톤)</option>
                  <option value="silent">무음</option>
                </select>
              </label>
            </div>
          </section>
        ) : null}

        {settingsTab === 'diagnostics' ? (
          <section className="console-section">
            <div className="console-section-title">
              <h2>진단</h2>
              <button type="button" onClick={() => setShowDiagnostics((current) => !current)}>
                {showDiagnostics ? '숨기기' : '보기'}
              </button>
            </div>
            {showDiagnostics ? (
              <>
                <p className={`readiness-summary readiness-${readiness.overall}`}>
                  준비 상태 {readiness.overall}
                </p>
                <ul className="softphone-readiness-list">
                  {readiness.items.map((item) => (
                    <li key={item.key} className={`readiness-item readiness-item-${item.status}`}>
                      <span>{item.label} / {item.detail}</span>
                      {item.hint ? <small>{item.hint}</small> : null}
                    </li>
                  ))}
                </ul>
                {softphone?.lastError ? <p className="console-muted">오류 {softphone.lastError}</p> : null}
                {softphone?.diagnostics.length ? (
                  <ul className="softphone-readiness-list">
                    {softphone.diagnostics.slice(0, 3).map((diagnostic) => (
                      <li key={`${diagnostic.code}-${diagnostic.occurredAt}`} className={`readiness-item readiness-item-${diagnostic.severity === 'error' ? 'error' : diagnostic.severity === 'warning' ? 'warning' : 'ok'}`}>
                        <span>{diagnostic.code} / {diagnostic.message}</span>
                        {diagnostic.hint ? <small>{diagnostic.hint}</small> : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="console-actions">
                  <button type="button" disabled={runtimeConnection === 'reconnecting'} onClick={onReconnectRuntime}>
                    Runtime 재연결
                  </button>
                  <button
                    type="button"
                    disabled={!softphone?.config.enabled || !softphone.config.authorizationPassword}
                    onClick={onStartSoftphone}
                  >
                    Softphone 등록
                  </button>
                  <button type="button" disabled={!softphone?.config.enabled} onClick={onStopSoftphone}>
                    Softphone 중지
                  </button>
                </div>
              </>
            ) : null}
            <p className="console-muted">센터 {config.serverUrl}</p>
          </section>
        ) : null}
      </section>
    );
  }

  return (
    <section className={`desktop-console desktop-console-${consoleState}`}>
      <ConsoleHeader
        agentName={agentName}
        extension={extension}
        statusLabel={formatAgentStatus(agentStatus)}
        agentStatus={agentStatus}
        onChangeAgentStatus={handleAgentStatusChange}
        onOpenSettings={() => setView('settings')}
        settingsLabel="설정"
      />

      <section className="call-surface">
        <span className={`state-dot state-${consoleState}`} />
        <div>
          <strong>{getCallTitle(activeCall, softphone)}</strong>
          <p>{getCallSubtitle(activeCall, softphone)}</p>
        </div>
      </section>

      {consoleState === 'ringing' ? (
        <>
          {(() => {
            const answer = callPreferences.autoAnswerSeconds;
            const reject = callPreferences.autoRejectSeconds;
            if (answer <= 0 && reject <= 0) {
              return null;
            }
            const autoAnswerWins = answer > 0 && (reject <= 0 || answer <= reject);
            const action: 'auto-answer' | 'auto-reject' = autoAnswerWins ? 'auto-answer' : 'auto-reject';
            const seconds = autoAnswerWins ? answer : reject;
            const trigger = () => {
              if (!canAnswerRinging) {
                return;
              }
              if (autoAnswerWins) {
                if (activeCall) {
                  onPickup();
                } else {
                  onAnswerSoftphoneCall();
                }
              } else if (activeCall) {
                onHangup();
              } else {
                onRejectSoftphoneCall();
              }
            };
            return (
              <RingingAutoTimer
                active={consoleState === 'ringing'}
                totalSeconds={seconds}
                action={action}
                onTrigger={trigger}
              />
            );
          })()}
          <div className="primary-action-row">
            <button
              type="button"
              className="primary-button"
              disabled={!canAnswerRinging}
              onClick={activeCall ? onPickup : onAnswerSoftphoneCall}
            >
              받기
            </button>
            <button
              type="button"
              className="danger-button"
              disabled={!canAnswerRinging}
              onClick={activeCall ? onHangup : onRejectSoftphoneCall}
            >
              거절
            </button>
          </div>
        </>
      ) : null}

      {consoleState === 'idle' || consoleState === 'afterCall' ? (
        <>
          <section className="console-section">
            <div className="console-section-title">
              <h2>외부 발신</h2>
              <div className="console-section-actions">
                <button type="button" onClick={() => onOpenDialpadPopup('originate')} aria-label="발신 키패드 열기">
                  키패드
                </button>
                <button type="button" onClick={onOpenCallHistoryPopup}>
                  내역
                </button>
              </div>
            </div>
            <div className="dial-grid">
              <select
                aria-label="발신번호"
                value={selectedCallerId}
                onChange={(event) => setSelectedCallerId(event.target.value)}
                disabled={callerIds.length === 0}
              >
                {callerIds.length === 0 ? <option value="">등록된 발신번호 없음</option> : null}
                {callerIds.map((callerId) => (
                  <option key={callerId} value={callerId}>
                    {callerId}
                  </option>
                ))}
              </select>
              <input
                value={dialNumber}
                onChange={(event) => setDialNumber(event.target.value)}
                placeholder="전화번호"
                aria-label="외부 발신 번호"
              />
              <button
                type="button"
                className="primary-button"
                disabled={!canDialExternal}
                onClick={() => void handleExternalOriginate()}
              >
                {dialPending ? '발신 중' : '발신'}
              </button>
            </div>
            {dialError ? <p className="console-muted dial-error">{dialError}</p> : null}
          </section>

          <section className="console-section agent-directory-section">
            <div className="console-section-title">
              <h2>내선 통화</h2>
              <button type="button" onClick={onOpenAgentListPopup}>
                전체
              </button>
            </div>
            <div className="agent-list">
              {availableAgents.length === 0 ? (
                <p className="console-muted">표시할 상담원이 없습니다.</p>
              ) : (
                availableAgents.map((agent) => (
                  (() => {
                    const blockReason = getAgentCallBlockReason(agent);
                    return (
                  <button
                    type="button"
                    key={agent.agentId}
                    className="agent-row"
                    disabled={!runtimeReady || Boolean(blockReason)}
                    onClick={() => {
                      setInternalError(null);
                      setInternalTarget(agent);
                    }}
                    title={blockReason ? `내선 통화 불가: ${blockReason}` : '내선 통화 가능'}
                  >
                    <span>{agent.agentName}</span>
                    <small>{formatDirectoryAgentSummary(agent)}</small>
                  </button>
                    );
                  })()
                ))
              )}
            </div>
          </section>
        </>
      ) : null}

      {showCallInfo && activeCall ? (
        <CallInfoPanel
          context={callContext}
          loading={callContextLoading}
          error={callContextError}
          agentId={agentId ?? null}
          onSaveMemo={handleSaveMemo}
        />
      ) : null}

      {consoleState === 'talking' || consoleState === 'transferring' ? (
        <>
          <div className="call-control-row">
            <button type="button" onClick={onMute}>
              {softphone?.session ? (softphone.localMuted ? '음소거 해제' : '음소거') : activeCall?.isMuted ? '음소거 해제' : '음소거'}
            </button>
            <button type="button" onClick={onToggleHold}>
              {softphone?.session ? (softphone.localHold ? '재개' : '보류') : activeCall?.sessionStatus === 'HOLD' ? '재개' : '보류'}
            </button>
            {softphone?.session ? (
              <button type="button" onClick={() => onOpenDialpadPopup('dtmf')}>
                키패드
              </button>
            ) : null}
            <button type="button" className="danger-button" onClick={softphone?.session ? onHangupSoftphoneCall : onHangup}>
              종료
            </button>
          </div>

          {activeCall ? (
            <section className="console-section transfer-section">
              <div className="console-section-title">
                <h2>전환</h2>
                {activeCall.latestTransfer ? <span>진행 중</span> : null}
              </div>
              <div className="transfer-grid">
                <select
                  aria-label="전환 방식"
                  value={transferMode}
                  onChange={(event) => setTransferMode(event.target.value as 'blind' | 'attended')}
                >
                  <option value="blind">바로 전환</option>
                  <option value="attended">상담 전환</option>
                </select>
                <input
                  value={transferTarget}
                  onChange={(event) => setTransferTarget(event.target.value)}
                  placeholder="내선 또는 번호"
                  aria-label="전환 대상"
                />
                <button
                  type="button"
                  className="primary-button"
                  disabled={!transferAvailable || !transferTarget.trim()}
                  onClick={() => onTransfer(transferTarget, transferMode)}
                >
                  전환
                </button>
              </div>
              {transferHotkeys.length > 0 ? (
                <div className="transfer-hotkey-strip">
                  {transferHotkeys.map((slot) => (
                    <button
                      type="button"
                      key={slot.slot}
                      className={`hotkey-chip hotkey-chip--${slot.mode}`}
                      onClick={() => triggerTransferHotkey(slot.slot)}
                      disabled={!transferAvailable}
                      title={`${slot.mode === 'attended' ? '상담' : '바로'} 전환 / ${slot.target}`}
                    >
                      <span className="hotkey-chip__index">{slot.slot}</span>
                      <span className="hotkey-chip__label">{slot.label}</span>
                    </button>
                  ))}
                </div>
              ) : null}
              {agentDirectory.length > 0 ? (
                <div className="transfer-agent-strip">
                  {availableAgents.slice(0, 3).map((agent) => (
                    <button type="button" key={agent.agentId} onClick={() => setTransferTarget(agent.extension)}>
                      {agent.agentName}
                    </button>
                  ))}
                </div>
              ) : null}
              {activeCall.latestTransfer ? (
                <div className="console-actions">
                  <button type="button" onClick={onCompleteAttendedTransfer}>
                    완료
                  </button>
                  <button type="button" onClick={onCancelAttendedTransfer}>
                    취소
                  </button>
                </div>
              ) : null}
            </section>
          ) : null}
        </>
      ) : null}

      {pendingStatus ? (
        <div className="status-reason-overlay" role="dialog" aria-modal="true" aria-labelledby="status-reason-title">
          <section className="status-reason-dialog">
            <h2 id="status-reason-title">{formatAgentStatus(pendingStatus)} 사유</h2>
            <p className="console-muted">필요 시 짧게 입력 (선택). 비워두면 사유 없이 변경됩니다.</p>
            <textarea
              autoFocus
              value={reasonDraft}
              onChange={(event) => setReasonDraft(event.target.value)}
              placeholder="예: 점심, 휴식, 교육 등"
              rows={3}
            />
            <div className="primary-action-row">
              <button type="button" className="primary-button" onClick={confirmStatusReason}>
                변경
              </button>
              <button type="button" className="secondary-button" onClick={cancelStatusReason}>
                취소
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {internalTarget ? (
        <div className="confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="internal-call-title">
          <section className="confirm-dialog">
            <h2 id="internal-call-title">내선 통화</h2>
            <p>{internalTarget.agentName} {internalTarget.extension} 연결을 시작할까요?</p>
            <p>상담원 {formatDirectoryAgentSummary(internalTarget)}</p>
            {internalError ? <p className="console-muted dial-error">{internalError}</p> : null}
            <div className="primary-action-row">
              <button
                type="button"
                className="primary-button"
                disabled={internalPending}
                onClick={() => void handleInternalOriginate()}
              >
                {internalPending ? '연결 중' : '연결'}
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={internalPending}
                onClick={() => setInternalTarget(null)}
              >
                취소
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function ConsoleHeader({
  agentName,
  extension,
  statusLabel,
  agentStatus,
  onChangeAgentStatus,
  onOpenSettings,
  settingsLabel,
}: {
  agentName: string;
  extension: string;
  statusLabel: string;
  agentStatus: AgentStatusCode | null;
  onChangeAgentStatus: (statusCode: AgentStatusCode, reasonCode?: string) => void;
  onOpenSettings: () => void;
  settingsLabel: string;
}) {
  return (
    <header className="console-header">
      <div>
        <h1>{agentName}</h1>
        <p>{extension} / {statusLabel}</p>
      </div>
      <div className="header-actions">
        <select
          className="agent-status-select"
          aria-label="상담원 상태"
          value={agentStatus ?? 'MANUAL_PAUSED'}
          onChange={(event) => onChangeAgentStatus(event.target.value as AgentStatusCode)}
        >
          {AGENT_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button type="button" className="icon-button" onClick={onOpenSettings}>
          {settingsLabel}
        </button>
      </div>
    </header>
  );
}

function DeviceSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ deviceId: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">기본 장치</option>
        {options.map((device) => (
          <option key={device.deviceId} value={device.deviceId}>
            {device.label}
          </option>
        ))}
      </select>
    </label>
  );
}
