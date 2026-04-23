import type { ActiveCall, AgentStatusCode } from '../../../shared/cti';
import type { DesktopAudioPreferences, DesktopConfig } from '../../../shared/ipc';
import { useEffect, useState } from 'react';
import type { SoftphoneState } from '../softphone/softphone-runtime';
import { evaluateSoftphoneReadiness } from '../softphone/softphone-readiness';

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

  return (
    <section className="softphone-shell">
      <div className="hero-card panel">
        <p className="eyebrow">Softphone Shell</p>
        <h1>{agentName}</h1>
        <p className="lead">
          내선 {extension}. 현재 데스크톱 런타임은 서버 이벤트를 구독하고 기본 호 제어 명령을 전달합니다.
        </p>
      </div>

      <div className="status-grid">
        <article className="panel metric-card">
          <span className="metric-label">Center URL</span>
          <strong>{config.serverUrl}</strong>
        </article>
        <article className="panel metric-card">
          <span className="metric-label">Channel</span>
          <strong>{config.channel}</strong>
        </article>
        <article className="panel metric-card">
          <span className="metric-label">Device ID</span>
          <strong>{config.deviceId}</strong>
        </article>
        <article className="panel metric-card">
          <span className="metric-label">Agent Status</span>
          <strong>{agentStatus ?? 'UNKNOWN'}</strong>
        </article>
        <article className="panel metric-card">
          <span className="metric-label">Runtime</span>
          <strong>{runtimeConnection}</strong>
        </article>
        <article className="panel metric-card">
          <span className="metric-label">Softphone</span>
          <strong>{softphone?.registration ?? 'NOT_READY'}</strong>
        </article>
      </div>

      <div className="panel placeholder-card">
        <h2>Softphone Runtime</h2>
        <p className={`readiness-summary readiness-${readiness.overall}`}>
          준비 상태: {readiness.overall}
        </p>
        <p>
          {softphone?.config.enabled
            ? `${softphone.config.sipUri} / ${softphone.transport}`
            : 'softphone 설정이 아직 내려오지 않았습니다.'}
        </p>
        {softphone?.config.wsServer ? <p className="section-copy">WSS: {softphone.config.wsServer}</p> : null}
        {softphone?.session ? (
          <p className="section-copy">
            세션: {softphone.session.phase} / {softphone.session.remoteDisplayName}
            {softphone.session.remoteUri ? ` (${softphone.session.remoteUri})` : ''}
          </p>
        ) : null}
        <p className="section-copy">원격 오디오: {softphone?.remoteAudioActive ? '연결됨' : '미연결'}</p>
        {softphone?.lastError ? <p className="section-copy">오류: {softphone.lastError}</p> : null}
        <div className="softphone-diagnostics">
          <strong>현장 점검 체크</strong>
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
          <strong>연결 진단</strong>
          {softphone?.diagnostics.length ? (
            <ul className="softphone-diagnostic-list">
              {softphone.diagnostics.slice(0, 3).map((diagnostic) => (
                <li key={`${diagnostic.code}-${diagnostic.occurredAt}`} className={`diagnostic-${diagnostic.severity}`}>
                  <span>
                    {diagnostic.code} / {diagnostic.message}
                  </span>
                  {diagnostic.hint ? <small>{diagnostic.hint}</small> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="section-copy">최근 진단 없음</p>
          )}
        </div>
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
          <button
            type="button"
            disabled={softphone?.session?.phase !== 'ringing'}
            onClick={onAnswerSoftphoneCall}
          >
            Softphone 수락
          </button>
          <button
            type="button"
            disabled={softphone?.session?.phase !== 'ringing'}
            onClick={onRejectSoftphoneCall}
          >
            Softphone 거절
          </button>
          <button
            type="button"
            disabled={!softphone?.session || softphone.session.phase === 'ringing'}
            onClick={onHangupSoftphoneCall}
          >
            Softphone 종료
          </button>
        </div>
      </div>

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
        <h2>현재 통화</h2>
        <p>{activeCall ? `${activeCall.ani} / ${activeCall.sessionStatus}` : '진행 중인 통화 없음'}</p>
        <div className="placeholder-actions">
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
            <option value="blind">blind</option>
            <option value="attended">attended</option>
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

      <div className="panel placeholder-card">
        <div className="section-header">
          <div>
            <h2>오디오 장치</h2>
            <p className="section-copy">
              실제 미디어 라우팅은 후속 WebRTC 단계에서 이 설정을 소비합니다. 현재는 장치 선택과 로컬
              저장까지 지원합니다.
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
    </section>
  );
}
