import { useEffect, useMemo, useState } from 'react';
import type { ActiveCall, AgentStatusCode } from '../../../shared/cti';
import type {
  DesktopAgentDirectoryItem,
  DesktopAudioPreferences,
  DesktopConfig,
} from '../../../shared/ipc';
import type { SoftphoneState } from '../softphone/softphone-runtime';
import { evaluateSoftphoneReadiness } from '../softphone/softphone-readiness';
import {
  deriveDesktopConsoleState,
  getWindowModeForConsoleState,
} from './desktop-console-state';

const AGENT_STATUS_OPTIONS: Array<{ value: AgentStatusCode; label: string }> = [
  { value: 'AVAILABLE', label: '대기' },
  { value: 'BREAK', label: '휴식' },
  { value: 'MEAL', label: '식사' },
  { value: 'TRAINING', label: '교육' },
  { value: 'MANUAL_PAUSED', label: '중지' },
  { value: 'AFTER_CALL_WORK', label: '후처리' },
];

const TRANSFER_READY_STATUSES = new Set(['TALKING', 'HOLD', 'TRANSFERRING']);

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

  return '필요한 작업만 표시합니다.';
}

export function SoftphoneShell({
  config,
  agentName,
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
  onMute,
  onHangup,
  onToggleHold,
  onTransfer,
  onCancelAttendedTransfer,
  onCompleteAttendedTransfer,
  onRefreshAudioDevices,
  onRequestAudioPermission,
  onChangeAudioPreferences,
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
  onChangeAgentStatus: (statusCode: AgentStatusCode) => void;
  onPickup: () => void;
  onOriginate: (phoneNumber: string, callerId?: string) => void;
  onOriginateInternal: (target: DesktopAgentDirectoryItem) => void;
  onOpenCallHistoryPopup: () => void;
  onOpenAgentListPopup: () => void;
  onMute: () => void;
  onHangup: () => void;
  onToggleHold: () => void;
  onTransfer: (target: string, mode: 'blind' | 'attended') => void;
  onCancelAttendedTransfer: () => void;
  onCompleteAttendedTransfer: () => void;
  onRefreshAudioDevices: () => void;
  onRequestAudioPermission: () => void;
  onChangeAudioPreferences: (input: DesktopAudioPreferences) => void;
  onPlayOutputPreview: () => void;
  onPlayRingPreview: () => void;
  onStartSoftphone: () => void;
  onStopSoftphone: () => void;
  onAnswerSoftphoneCall: () => void;
  onRejectSoftphoneCall: () => void;
  onHangupSoftphoneCall: () => void;
}) {
  const [view, setView] = useState<'call' | 'settings'>('call');
  const [showDiagnostics, setShowDiagnostics] = useState(false);
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
  const canDialExternal = runtimeReady && Boolean(dialNumber.trim()) && callerIds.length > 0;

  if (view === 'settings') {
    return (
      <section className="desktop-console desktop-console-settings">
        <ConsoleHeader
          agentName={agentName}
          extension={extension}
          statusLabel={formatAgentStatus(agentStatus)}
          agentStatus={agentStatus}
          onChangeAgentStatus={onChangeAgentStatus}
          onOpenSettings={() => setView('call')}
          settingsLabel="통화"
        />

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
        onChangeAgentStatus={onChangeAgentStatus}
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
        <div className="primary-action-row">
          <button
            type="button"
            className="primary-button"
            disabled={!runtimeReady || !activeCall}
            onClick={activeCall ? onPickup : onAnswerSoftphoneCall}
          >
            받기
          </button>
          <button type="button" className="danger-button" onClick={activeCall ? onHangup : onRejectSoftphoneCall}>
            거절
          </button>
        </div>
      ) : null}

      {consoleState === 'idle' || consoleState === 'afterCall' ? (
        <>
          <section className="console-section">
            <div className="console-section-title">
              <h2>외부 발신</h2>
              <button type="button" onClick={onOpenCallHistoryPopup}>
                내역
              </button>
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
                onClick={() => onOriginate(dialNumber, selectedCallerId)}
              >
                발신
              </button>
            </div>
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
                  <button
                    type="button"
                    key={agent.agentId}
                    className="agent-row"
                    disabled={!runtimeReady || !agent.isActive}
                    onClick={() => onOriginateInternal(agent)}
                  >
                    <span>{agent.agentName}</span>
                    <small>{agent.extension}</small>
                  </button>
                ))
              )}
            </div>
          </section>
        </>
      ) : null}

      {consoleState === 'talking' || consoleState === 'transferring' ? (
        <>
          <div className="call-control-row">
            <button type="button" onClick={onMute}>
              {activeCall?.isMuted ? '음소거 해제' : '음소거'}
            </button>
            <button type="button" onClick={onToggleHold}>
              {activeCall?.sessionStatus === 'HOLD' ? '재개' : '보류'}
            </button>
            <button type="button" className="danger-button" onClick={activeCall ? onHangup : onHangupSoftphoneCall}>
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
  onChangeAgentStatus: (statusCode: AgentStatusCode) => void;
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
