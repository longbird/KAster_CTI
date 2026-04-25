import type { ActiveCall, AgentStatusCode } from '../../../shared/cti';
import type { DesktopAudioPreferences, DesktopConfig } from '../../../shared/ipc';
import { useEffect, useState } from 'react';
import type { SoftphoneState } from '../softphone/softphone-runtime';
import { evaluateSoftphoneReadiness } from '../softphone/softphone-readiness';

const AGENT_STATUS_OPTIONS: Array<{ value: AgentStatusCode; label: string }> = [
  { value: 'AVAILABLE', label: '대기' },
  { value: 'BREAK', label: '휴식' },
  { value: 'MEAL', label: '식사' },
  { value: 'TRAINING', label: '교육' },
  { value: 'MANUAL_PAUSED', label: '중지' },
  { value: 'AFTER_CALL_WORK', label: '후처리' },
];

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
  onReconnectRuntime,
  onChangeAgentStatus,
  onPickup,
  onOriginate,
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
  onReconnectRuntime: () => void;
  onChangeAgentStatus: (statusCode: AgentStatusCode) => void;
  onPickup: () => void;
  onOriginate: (phoneNumber: string) => void;
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

  const syncAudioDraft = (next: Partial<DesktopAudioPreferences>) => {
    const merged = {
      ...audioDraft,
      ...next,
    };
    setAudioDraft(merged);
    void onChangeAudioPreferences(merged);
  };
  const runtimeReady = runtimeConnection === 'connected';
  const readiness = evaluateSoftphoneReadiness({
    runtimeConnection,
    softphone,
  });
  const callStatus = activeCall
    ? `${activeCall.ani} / ${activeCall.sessionStatus}`
    : '진행 중인 통화 없음';

  if (view === 'settings') {
    return (
      <section className="softphone-shell">
        <div className="agent-console-header panel">
          <div>
            <h1>설정</h1>
            <p>오디오 장치와 필요한 진단 기능을 관리합니다.</p>
          </div>
          <button type="button" className="secondary-button" onClick={() => setView('call')}>
            통화 화면
          </button>
        </div>

        <div className="panel placeholder-card">
          <div className="section-header">
            <div>
              <h2>오디오 장치</h2>
              <p className="section-copy">
                장치가 기본 장치만 보이면 권한 요청 또는 장치 새로고침을 먼저 실행하세요.
              </p>
            </div>
            <div className="placeholder-actions compact-actions">
              <button type="button" onClick={onRequestAudioPermission}>
                권한 요청
              </button>
              <button type="button" onClick={onRefreshAudioDevices} disabled={refreshingAudioDevices}>
                {refreshingAudioDevices ? '새로고침 중' : '장치 새로고침'}
              </button>
            </div>
          </div>
          <p className="audio-permission">권한 상태: {audioPermission}</p>
          <p className="audio-permission">
            출력 장치 라우팅: {audioCapabilities.sinkSelectionSupported ? '지원' : '미지원'}
          </p>
          <div className="audio-grid">
            <label className="field">
              <span>마이크</span>
              <select
                value={audioDraft.inputDeviceId ?? ''}
                onChange={(event) =>
                  syncAudioDraft({
                    inputDeviceId: event.target.value || null,
                  })
                }
              >
                <option value="">기본 장치</option>
                {audioDevices.inputs.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>스피커</span>
              <select
                value={audioDraft.outputDeviceId ?? ''}
                onChange={(event) =>
                  syncAudioDraft({
                    outputDeviceId: event.target.value || null,
                  })
                }
              >
                <option value="">기본 장치</option>
                {audioDevices.outputs.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>벨소리 출력</span>
              <select
                value={audioDraft.ringDeviceId ?? ''}
                onChange={(event) =>
                  syncAudioDraft({
                    ringDeviceId: event.target.value || null,
                  })
                }
              >
                <option value="">기본 장치</option>
                {audioDevices.outputs.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="audio-toggle-grid">
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={audioDraft.echoCancellation}
                onChange={(event) =>
                  syncAudioDraft({
                    echoCancellation: event.target.checked,
                  })
                }
              />
              <span>Echo Cancellation</span>
            </label>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={audioDraft.noiseSuppression}
                onChange={(event) =>
                  syncAudioDraft({
                    noiseSuppression: event.target.checked,
                  })
                }
              />
              <span>Noise Suppression</span>
            </label>
          </div>
          <div className="placeholder-actions">
            <button
              type="button"
              disabled={!audioCapabilities.sinkSelectionSupported}
              onClick={onPlayOutputPreview}
            >
              스피커 테스트
            </button>
            <button
              type="button"
              disabled={!audioCapabilities.sinkSelectionSupported}
              onClick={onPlayRingPreview}
            >
              벨소리 테스트
            </button>
          </div>
        </div>

        <div className="panel placeholder-card">
          <div className="section-header">
            <div>
              <h2>진단</h2>
              <p className="section-copy">상담원이 평소에 볼 필요 없는 연결 점검 기능입니다.</p>
            </div>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setShowDiagnostics((current) => !current)}
            >
              {showDiagnostics ? '진단 숨기기' : '진단 보기'}
            </button>
          </div>
          {showDiagnostics ? (
            <>
              <p className={`readiness-summary readiness-${readiness.overall}`}>
                준비 상태: {readiness.overall}
              </p>
              <ul className="softphone-readiness-list">
                {readiness.items.map((item) => (
                  <li key={item.key} className={`readiness-item readiness-item-${item.status}`}>
                    <span>
                      {item.label} / {item.detail}
                    </span>
                    {item.hint ? <small>{item.hint}</small> : null}
                  </li>
                ))}
              </ul>
              {softphone?.lastError ? <p className="section-copy">오류: {softphone.lastError}</p> : null}
              <div className="placeholder-actions">
                <button
                  type="button"
                  disabled={runtimeConnection === 'reconnecting'}
                  onClick={onReconnectRuntime}
                >
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
        </div>
      </section>
    );
  }

  return (
    <section className="softphone-shell compact-agent-console">
      <div className="agent-console-header panel">
        <div className="agent-identity-block">
          <div className="agent-identity-row">
            <h1>
              {agentName} ({extension})
            </h1>
            <label className="status-select-label">
              <span className="sr-only">상담원 상태</span>
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
            </label>
          </div>
        </div>
        <button type="button" className="icon-button settings-button" aria-label="설정" onClick={() => setView('settings')}>
          설정
        </button>
      </div>

      <div className="panel current-call-card">
        <span className="metric-label">현재 통화</span>
        <strong>{callStatus}</strong>
        {softphone?.session ? (
          <p className="section-copy">
            {softphone.session.remoteDisplayName}
            {softphone.session.remoteUri ? ` / ${softphone.session.remoteUri}` : ''}
          </p>
        ) : null}
      </div>

      <div className="agent-action-grid">
        <button
          type="button"
          disabled={!runtimeReady || !activeCall || !['QUEUED', 'RINGING_AGENT'].includes(activeCall.sessionStatus)}
          onClick={onPickup}
        >
          수신
        </button>
        <button type="button" disabled={!runtimeReady || !activeCall} onClick={onHangup}>
          종료
        </button>
        <button type="button" disabled={!runtimeReady || !activeCall} onClick={onMute}>
          {activeCall?.isMuted ? '음소거 해제' : '음소거'}
        </button>
        <button type="button" disabled={!runtimeReady || !activeCall} onClick={onToggleHold}>
          {activeCall?.sessionStatus === 'HOLD' ? '재개' : '보류'}
        </button>
      </div>

      {softphone?.session?.phase === 'ringing' ? (
        <div className="agent-action-grid">
          <button type="button" onClick={onAnswerSoftphoneCall}>
            Softphone 수락
          </button>
          <button type="button" onClick={onRejectSoftphoneCall}>
            Softphone 거절
          </button>
        </div>
      ) : null}

      {softphone?.session && softphone.session.phase !== 'ringing' ? (
        <div className="agent-action-grid">
          <button type="button" onClick={onHangupSoftphoneCall}>
            Softphone 종료
          </button>
        </div>
      ) : null}

      <div className="panel placeholder-card">
        <h2>발신</h2>
        <div className="transfer-panel">
          <input
            value={dialNumber}
            onChange={(event) => setDialNumber(event.target.value)}
            placeholder="외부 발신 번호"
          />
          <button
            type="button"
            disabled={!dialNumber.trim() || !runtimeReady}
            onClick={() => onOriginate(dialNumber)}
          >
            발신
          </button>
        </div>
      </div>

      <div className="panel placeholder-card">
        <h2>전환</h2>
        <div className="transfer-panel">
          <input
            value={transferTarget}
            onChange={(event) => setTransferTarget(event.target.value)}
            placeholder="전환 대상 내선 또는 번호"
          />
          <select
            value={transferMode}
            onChange={(event) => setTransferMode(event.target.value as 'blind' | 'attended')}
          >
            <option value="blind">바로 전환</option>
            <option value="attended">상담 전환</option>
          </select>
          <button
            type="button"
            disabled={!runtimeReady || !activeCall || !transferTarget.trim()}
            onClick={() => onTransfer(transferTarget, transferMode)}
          >
            전환
          </button>
        </div>
        {activeCall?.latestTransfer ? (
          <div className="placeholder-actions">
            <button type="button" disabled={!runtimeReady} onClick={onCompleteAttendedTransfer}>
              상담 전환 완료
            </button>
            <button type="button" disabled={!runtimeReady} onClick={onCancelAttendedTransfer}>
              상담 전환 취소
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
