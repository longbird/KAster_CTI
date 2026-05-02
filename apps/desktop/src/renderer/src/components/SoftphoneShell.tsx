import type { ActiveCall, AgentStatusCode } from '../../../shared/cti';
import type { DesktopAudioPreferences, DesktopConfig } from '../../../shared/ipc';
import { useEffect, useMemo, useState } from 'react';
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

const STATUS_LABELS: Partial<Record<AgentStatusCode, string>> = {
  AVAILABLE: '상담대기',
  BREAK: '휴식',
  MEAL: '식사',
  TRAINING: '교육',
  MANUAL_PAUSED: '업무정지',
  AFTER_CALL_WORK: '업무처리',
};

type ConsoleView = 'call' | 'work' | 'history' | 'outbound' | 'transfer' | 'agents' | 'settings';
type SettingsTab = 'call' | 'ring' | 'general' | 'quickTransfer' | 'audio' | 'recording';

interface SoftphoneShellProps {
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
}

function today() {
  return new Date().toISOString().slice(0, 10);
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
}: SoftphoneShellProps) {
  const [view, setView] = useState<ConsoleView>('call');
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('audio');
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [transferTarget, setTransferTarget] = useState('');
  const [transferMode, setTransferMode] = useState<'blind' | 'attended'>('blind');
  const [dialNumber, setDialNumber] = useState('');
  const [callerId, setCallerId] = useState('1577-7893');
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
  const statusLabel = STATUS_LABELS[agentStatus ?? 'MANUAL_PAUSED'] ?? '업무정지';
  const historyRows = useMemo(() => (activeCall ? [activeCall] : []), [activeCall]);

  const navItems: Array<{ key: ConsoleView; label: string }> = [
    { key: 'call', label: '상담대기' },
    { key: 'work', label: '업무처리' },
    { key: 'history', label: '통화내역' },
    { key: 'outbound', label: '발신' },
    { key: 'transfer', label: '호전환' },
    { key: 'agents', label: '상담원' },
  ];

  return (
    <section className="legacy-desktop-shell" aria-label="상담원 데스크톱">
      <header className="legacy-topbar">
        <div className="legacy-brand-panel">
          <div className="legacy-brand-mark" aria-hidden="true">☁</div>
          <strong>맑은하늘</strong>
          <span>잔여: 0원</span>
          <span>인센티브: 0원</span>
        </div>
        <div className="legacy-topbar-main">
          <div className="legacy-status-row">
            <label className="legacy-status-select">
              <span className="sr-only">상담원 상태</span>
              <select
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
            <button
              type="button"
              className="legacy-primary-call"
              disabled={!dialNumber.trim() || !runtimeReady}
              onClick={() => onOriginate(dialNumber)}
            >
              전화걸기
            </button>
            <button
              type="button"
              className="legacy-secondary-call"
              disabled={!runtimeReady || !activeCall || !['QUEUED', 'RINGING_AGENT'].includes(activeCall.sessionStatus)}
              onClick={onPickup}
            >
              당겨받기
            </button>
          </div>
          <div className="legacy-nav-row" role="tablist" aria-label="상담원 기능">
            {navItems.map((item, index) => (
              <button
                key={`${item.key}-${index}`}
                type="button"
                className={view === item.key ? 'legacy-nav-button is-active' : 'legacy-nav-button'}
                onClick={() => setView(item.key)}
              >
                {item.label}
              </button>
            ))}
            <button
              type="button"
              className={view === 'settings' ? 'legacy-nav-button is-active' : 'legacy-nav-button'}
              aria-label="설정"
              onClick={() => setView('settings')}
            >
              설정
            </button>
          </div>
        </div>
        <div className="legacy-agent-panel">
          <span>{runtimeReady ? '원격' : '오프라인'}</span>
          <strong>{agentName}</strong>
          <em>Ext. {extension}</em>
          <b>{statusLabel}</b>
        </div>
      </header>

      {view === 'call' || view === 'work' ? (
        <CallConsole
          activeCall={activeCall}
          callStatus={callStatus}
          runtimeReady={runtimeReady}
          softphone={softphone}
          dialNumber={dialNumber}
          onDialNumber={setDialNumber}
          onOriginate={onOriginate}
          onPickup={onPickup}
          onHangup={onHangup}
          onMute={onMute}
          onToggleHold={onToggleHold}
          onAnswerSoftphoneCall={onAnswerSoftphoneCall}
          onRejectSoftphoneCall={onRejectSoftphoneCall}
          onHangupSoftphoneCall={onHangupSoftphoneCall}
        />
      ) : null}

      {view === 'history' ? (
        <HistoryPanel rows={historyRows} agentName={agentName} extension={extension} />
      ) : null}

      {view === 'outbound' ? (
        <OutboundPanel
          dialNumber={dialNumber}
          callerId={callerId}
          extension={extension}
          runtimeReady={runtimeReady}
          onCallerId={setCallerId}
          onDialNumber={setDialNumber}
          onOriginate={onOriginate}
        />
      ) : null}

      {view === 'transfer' ? (
        <TransferPanel
          activeCall={activeCall}
          runtimeReady={runtimeReady}
          transferMode={transferMode}
          transferTarget={transferTarget}
          agentName={agentName}
          extension={extension}
          onTransferMode={setTransferMode}
          onTransferTarget={setTransferTarget}
          onTransfer={onTransfer}
          onCancelAttendedTransfer={onCancelAttendedTransfer}
          onCompleteAttendedTransfer={onCompleteAttendedTransfer}
        />
      ) : null}

      {view === 'agents' ? (
        <AgentListPanel agentName={agentName} extension={extension} statusLabel={statusLabel} />
      ) : null}

      {view === 'settings' ? (
        <SettingsPanel
          config={config}
          tab={settingsTab}
          readiness={readiness}
          showDiagnostics={showDiagnostics}
          audioPermission={audioPermission}
          refreshingAudioDevices={refreshingAudioDevices}
          audioDraft={audioDraft}
          audioDevices={audioDevices}
          audioCapabilities={audioCapabilities}
          softphone={softphone}
          runtimeConnection={runtimeConnection}
          onTab={setSettingsTab}
          onShowDiagnostics={setShowDiagnostics}
          onBack={() => setView('call')}
          onRequestAudioPermission={onRequestAudioPermission}
          onRefreshAudioDevices={onRefreshAudioDevices}
          onChangeAudioPreferences={syncAudioDraft}
          onPlayOutputPreview={onPlayOutputPreview}
          onPlayRingPreview={onPlayRingPreview}
          onReconnectRuntime={onReconnectRuntime}
          onStartSoftphone={onStartSoftphone}
          onStopSoftphone={onStopSoftphone}
        />
      ) : null}
    </section>
  );
}

function CallConsole({
  activeCall,
  callStatus,
  runtimeReady,
  softphone,
  dialNumber,
  onDialNumber,
  onOriginate,
  onPickup,
  onHangup,
  onMute,
  onToggleHold,
  onAnswerSoftphoneCall,
  onRejectSoftphoneCall,
  onHangupSoftphoneCall,
}: {
  activeCall: ActiveCall | null;
  callStatus: string;
  runtimeReady: boolean;
  softphone: SoftphoneState | null;
  dialNumber: string;
  onDialNumber: (value: string) => void;
  onOriginate: (phoneNumber: string) => void;
  onPickup: () => void;
  onHangup: () => void;
  onMute: () => void;
  onToggleHold: () => void;
  onAnswerSoftphoneCall: () => void;
  onRejectSoftphoneCall: () => void;
  onHangupSoftphoneCall: () => void;
}) {
  return (
    <main className="legacy-workspace">
      <section className="legacy-card legacy-current-call">
        <span>현재 통화</span>
        <strong>{callStatus}</strong>
        {softphone?.session ? (
          <p>
            {softphone.session.remoteDisplayName}
            {softphone.session.remoteUri ? ` / ${softphone.session.remoteUri}` : ''}
          </p>
        ) : null}
      </section>
      <section className="legacy-card">
        <div className="legacy-command-grid">
          <button
            type="button"
            disabled={!runtimeReady || !activeCall || !['QUEUED', 'RINGING_AGENT'].includes(activeCall.sessionStatus)}
            onClick={onPickup}
          >
            수신
          </button>
          <button type="button" disabled={!runtimeReady || !activeCall} onClick={onHangup}>
            전화끊기
          </button>
          <button type="button" disabled={!runtimeReady || !activeCall} onClick={onMute}>
            {activeCall?.isMuted ? '음소거 해제' : '음소거'}
          </button>
          <button type="button" disabled={!runtimeReady || !activeCall} onClick={onToggleHold}>
            {activeCall?.sessionStatus === 'HOLD' ? '재개' : '홀드'}
          </button>
        </div>
        <div className="legacy-inline-form">
          <input
            value={dialNumber}
            onChange={(event) => onDialNumber(event.target.value)}
            placeholder="전화번호 입력"
            aria-label="전화번호 입력"
          />
          <button
            type="button"
            disabled={!dialNumber.trim() || !runtimeReady}
            onClick={() => onOriginate(dialNumber)}
          >
            발신 요청
          </button>
        </div>
      </section>
      {softphone?.session?.phase === 'ringing' ? (
        <section className="legacy-card legacy-command-grid">
          <button type="button" onClick={onAnswerSoftphoneCall}>Softphone 수락</button>
          <button type="button" onClick={onRejectSoftphoneCall}>Softphone 거절</button>
        </section>
      ) : null}
      {softphone?.session && softphone.session.phase !== 'ringing' ? (
        <section className="legacy-card legacy-command-grid">
          <button type="button" onClick={onHangupSoftphoneCall}>Softphone 종료</button>
        </section>
      ) : null}
    </main>
  );
}

function HistoryPanel({
  rows,
  agentName,
  extension,
}: {
  rows: ActiveCall[];
  agentName: string;
  extension: string;
}) {
  return (
    <main className="legacy-window-panel">
      <h1>통화 내역</h1>
      <div className="legacy-filter-grid">
        <label>
          <span>조회시작일</span>
          <input aria-label="조회시작일" type="date" defaultValue={today()} />
        </label>
        <label>
          <span>조회종료일</span>
          <input aria-label="조회종료일" type="date" defaultValue={today()} />
        </label>
        <label>
          <span>상담그룹</span>
          <select aria-label="상담그룹" defaultValue="all">
            <option value="all">전체</option>
          </select>
        </label>
        <label>
          <span>검색</span>
          <select aria-label="검색 구분" defaultValue="phone">
            <option value="phone">전화번호검색</option>
            <option value="agent">상담원</option>
          </select>
        </label>
      </div>
      <div className="legacy-table-wrap">
        <table>
          <thead>
            <tr>
              <th>상태</th>
              <th>지사</th>
              <th>대표번호</th>
              <th>발신번호</th>
              <th>수신번호</th>
              <th>날짜/시간</th>
              <th>통화시간</th>
              <th>상담원</th>
              <th>내선</th>
              <th>녹취</th>
            </tr>
          </thead>
          <tbody>
            {rows.length > 0 ? (
              rows.map((row) => (
                <tr key={row.callId}>
                  <td><span className="legacy-pill">수신</span></td>
                  <td>맑은하늘</td>
                  <td>{row.dnis || '1577-7893'}</td>
                  <td>{row.ani}</td>
                  <td>{row.dnis}</td>
                  <td>{new Date(row.startedAt).toLocaleString()}</td>
                  <td>진행중</td>
                  <td>{agentName}</td>
                  <td>{extension}</td>
                  <td>녹취 없음</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={10} className="legacy-empty-cell">표시할 통화이력이 없습니다.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function OutboundPanel({
  dialNumber,
  callerId,
  extension,
  runtimeReady,
  onCallerId,
  onDialNumber,
  onOriginate,
}: {
  dialNumber: string;
  callerId: string;
  extension: string;
  runtimeReady: boolean;
  onCallerId: (value: string) => void;
  onDialNumber: (value: string) => void;
  onOriginate: (phoneNumber: string) => void;
}) {
  return (
    <main className="legacy-window-panel legacy-cid-panel">
      <h1>CID 발신</h1>
      <label>
        <span>수신전화번호</span>
        <input aria-label="수신전화번호" value={dialNumber} onChange={(event) => onDialNumber(event.target.value)} />
      </label>
      <label>
        <span>발신전화번호</span>
        <input aria-label="발신전화번호" value={callerId} onChange={(event) => onCallerId(event.target.value)} />
      </label>
      <label>
        <span>지사명</span>
        <select aria-label="지사명" defaultValue="branch-1">
          <option value="branch-1">맑은하늘11</option>
        </select>
      </label>
      <button
        type="button"
        className="legacy-large-command"
        disabled={!dialNumber.trim() || !runtimeReady}
        onClick={() => onOriginate(dialNumber)}
      >
        전화 걸기
      </button>
      <div className="legacy-branch-list">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index}>
            <span>맑은하늘{index + 11}</span>
            <strong>{callerId}</strong>
            <em>Ext.{extension}</em>
          </div>
        ))}
      </div>
    </main>
  );
}

function TransferPanel({
  activeCall,
  runtimeReady,
  transferMode,
  transferTarget,
  agentName,
  extension,
  onTransferMode,
  onTransferTarget,
  onTransfer,
  onCancelAttendedTransfer,
  onCompleteAttendedTransfer,
}: {
  activeCall: ActiveCall | null;
  runtimeReady: boolean;
  transferMode: 'blind' | 'attended';
  transferTarget: string;
  agentName: string;
  extension: string;
  onTransferMode: (value: 'blind' | 'attended') => void;
  onTransferTarget: (value: string) => void;
  onTransfer: (target: string, mode: 'blind' | 'attended') => void;
  onCancelAttendedTransfer: () => void;
  onCompleteAttendedTransfer: () => void;
}) {
  return (
    <main className="legacy-window-panel legacy-transfer-panel">
      <h1>호 전환</h1>
      <label>
        <span>전화번호 입력</span>
        <input value={transferTarget} onChange={(event) => onTransferTarget(event.target.value)} />
      </label>
      <div className="legacy-agent-tree">
        <strong>전체</strong>
        <button type="button" onClick={() => onTransferTarget(extension)}>
          {agentName} ({activeCall ? '상담중' : '상담대기'})
        </button>
        <button type="button" onClick={() => onTransferTarget('2000')}>오토콜2000 [오프라인]</button>
      </div>
      <select
        aria-label="전환 방식"
        value={transferMode}
        onChange={(event) => onTransferMode(event.target.value as 'blind' | 'attended')}
      >
        <option value="attended">상담원과 통화 후 돌려주기</option>
        <option value="blind">상대방 수락 시 바로 돌려주기</option>
      </select>
      <div className="legacy-transfer-actions">
        <button
          type="button"
          disabled={!runtimeReady || !activeCall || !transferTarget.trim()}
          onClick={() => onTransfer(transferTarget, transferMode)}
        >
          돌려주기 시도
        </button>
        <button type="button" disabled={!runtimeReady || !activeCall?.latestTransfer} onClick={onCompleteAttendedTransfer}>
          상담 전환 완료
        </button>
        <button type="button" disabled={!runtimeReady || !activeCall?.latestTransfer} onClick={onCancelAttendedTransfer}>
          돌려주기 취소
        </button>
      </div>
    </main>
  );
}

function AgentListPanel({
  agentName,
  extension,
  statusLabel,
}: {
  agentName: string;
  extension: string;
  statusLabel: string;
}) {
  return (
    <main className="legacy-window-panel legacy-agent-list-panel">
      <h1>상담원 리스트</h1>
      <div className="legacy-filter-grid">
        <label>
          <span>상담원</span>
          <input aria-label="상담원" />
        </label>
        <label>
          <span>상태</span>
          <select aria-label="상태" defaultValue="wait">
            <option value="wait">상담대기</option>
            <option value="all">전체</option>
          </select>
        </label>
      </div>
      <div className="legacy-agent-tree">
        <strong>전체</strong>
        <button type="button">{agentName}@ ({statusLabel})</button>
        <button type="button">내선 {extension}</button>
      </div>
    </main>
  );
}

function SettingsPanel({
  config,
  tab,
  readiness,
  showDiagnostics,
  audioPermission,
  refreshingAudioDevices,
  audioDraft,
  audioDevices,
  audioCapabilities,
  softphone,
  runtimeConnection,
  onTab,
  onShowDiagnostics,
  onBack,
  onRequestAudioPermission,
  onRefreshAudioDevices,
  onChangeAudioPreferences,
  onPlayOutputPreview,
  onPlayRingPreview,
  onReconnectRuntime,
  onStartSoftphone,
  onStopSoftphone,
}: {
  config: DesktopConfig;
  tab: SettingsTab;
  readiness: ReturnType<typeof evaluateSoftphoneReadiness>;
  showDiagnostics: boolean;
  audioPermission: 'unknown' | 'granted' | 'denied' | 'unsupported';
  refreshingAudioDevices: boolean;
  audioDraft: DesktopAudioPreferences;
  audioDevices: {
    inputs: Array<{ deviceId: string; label: string }>;
    outputs: Array<{ deviceId: string; label: string }>;
  };
  audioCapabilities: {
    sinkSelectionSupported: boolean;
  };
  softphone: SoftphoneState | null;
  runtimeConnection: 'idle' | 'connected' | 'reconnecting' | 'disconnected' | 'error';
  onTab: (tab: SettingsTab) => void;
  onShowDiagnostics: (show: boolean | ((current: boolean) => boolean)) => void;
  onBack: () => void;
  onRequestAudioPermission: () => void;
  onRefreshAudioDevices: () => void;
  onChangeAudioPreferences: (input: Partial<DesktopAudioPreferences>) => void;
  onPlayOutputPreview: () => void;
  onPlayRingPreview: () => void;
  onReconnectRuntime: () => void;
  onStartSoftphone: () => void;
  onStopSoftphone: () => void;
}) {
  const tabs: Array<{ key: SettingsTab; label: string }> = [
    { key: 'call', label: '통화' },
    { key: 'ring', label: '벨소리' },
    { key: 'general', label: '일반' },
    { key: 'quickTransfer', label: '간편 호 전환' },
    { key: 'audio', label: '음성/코덱' },
    { key: 'recording', label: '녹취분석' },
  ];

  return (
    <main className="legacy-window-panel legacy-settings-panel">
      <div className="legacy-panel-title-row">
        <h1>환경설정</h1>
        <button type="button" onClick={onBack}>통화 화면</button>
      </div>
      <div className="legacy-settings-tabs">
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            className={tab === item.key ? 'is-active' : ''}
            onClick={() => onTab(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'audio' ? (
        <section className="legacy-settings-body">
          <h2>오디오 입/출력</h2>
          <h3>오디오 장치</h3>
          <div className="legacy-setting-actions">
            <button type="button" onClick={onRequestAudioPermission}>권한 요청</button>
            <button type="button" onClick={onRefreshAudioDevices} disabled={refreshingAudioDevices}>
              {refreshingAudioDevices ? '새로고침 중' : '장치 새로고침'}
            </button>
          </div>
          <p className="legacy-muted">권한 상태: {audioPermission}</p>
          <p className="legacy-muted">
            출력 장치 라우팅: {audioCapabilities.sinkSelectionSupported ? '지원' : '미지원'}
          </p>
          <div className="legacy-audio-grid">
            <label>
              <span>마이크</span>
              <select
                aria-label="마이크"
                value={audioDraft.inputDeviceId ?? ''}
                onChange={(event) => onChangeAudioPreferences({ inputDeviceId: event.target.value || null })}
              >
                <option value="">기본 장치</option>
                {audioDevices.inputs.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>{device.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>스피커</span>
              <select
                aria-label="스피커"
                value={audioDraft.outputDeviceId ?? ''}
                onChange={(event) => onChangeAudioPreferences({ outputDeviceId: event.target.value || null })}
              >
                <option value="">기본 장치</option>
                {audioDevices.outputs.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>{device.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>벨소리 출력</span>
              <select
                aria-label="벨소리 출력"
                value={audioDraft.ringDeviceId ?? ''}
                onChange={(event) => onChangeAudioPreferences({ ringDeviceId: event.target.value || null })}
              >
                <option value="">기본 장치</option>
                {audioDevices.outputs.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>{device.label}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="legacy-check-row">
            <label>
              <input
                type="checkbox"
                checked={audioDraft.echoCancellation}
                onChange={(event) => onChangeAudioPreferences({ echoCancellation: event.target.checked })}
              />
              Echo Cancellation
            </label>
            <label>
              <input
                type="checkbox"
                checked={audioDraft.noiseSuppression}
                onChange={(event) => onChangeAudioPreferences({ noiseSuppression: event.target.checked })}
              />
              Noise Suppression
            </label>
          </div>
          <div className="legacy-setting-actions">
            <button type="button" disabled={!audioCapabilities.sinkSelectionSupported} onClick={onPlayOutputPreview}>
              스피커 테스트
            </button>
            <button type="button" disabled={!audioCapabilities.sinkSelectionSupported} onClick={onPlayRingPreview}>
              벨소리 테스트
            </button>
          </div>
          <div className="legacy-diagnostics">
            <button type="button" onClick={() => onShowDiagnostics((current) => !current)}>
              {showDiagnostics ? '진단 숨기기' : '진단 보기'}
            </button>
            {showDiagnostics ? (
              <div>
                <p className={`readiness-summary readiness-${readiness.overall}`}>
                  준비 상태: {readiness.overall}
                </p>
                <ul className="softphone-readiness-list">
                  {readiness.items.map((item) => (
                    <li key={item.key} className={`readiness-item readiness-item-${item.status}`}>
                      <span>{item.label} / {item.detail}</span>
                      {item.hint ? <small>{item.hint}</small> : null}
                    </li>
                  ))}
                </ul>
                {softphone?.lastError ? <p className="legacy-muted">오류: {softphone.lastError}</p> : null}
                <div className="legacy-setting-actions">
                  <button type="button" disabled={runtimeConnection === 'reconnecting'} onClick={onReconnectRuntime}>
                    Runtime 재연결
                  </button>
                  <button type="button" disabled={!softphone?.config.enabled || !softphone.config.authorizationPassword} onClick={onStartSoftphone}>
                    Softphone 등록
                  </button>
                  <button type="button" disabled={!softphone?.config.enabled} onClick={onStopSoftphone}>
                    Softphone 중지
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      ) : (
        <section className="legacy-settings-body">
          <h2>{tabs.find((item) => item.key === tab)?.label}</h2>
          <div className="legacy-check-column">
            <label><input type="checkbox" defaultChecked /> CID 수신창 표시</label>
            <label><input type="checkbox" defaultChecked /> 통화 종료 후 상태 자동 변경</label>
            <label><input type="checkbox" /> 실시간 수/발신 목록 표시</label>
          </div>
          <p className="legacy-muted">센터: {config.serverUrl} / 채널: {config.channel}</p>
        </section>
      )}
    </main>
  );
}
