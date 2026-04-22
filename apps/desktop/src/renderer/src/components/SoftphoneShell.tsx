import type { ActiveCall, AgentStatusCode } from '../../../shared/cti';
import type { DesktopConfig } from '../../../shared/ipc';

export function SoftphoneShell({
  config,
  agentName,
  extension,
  agentStatus,
  activeCall,
  onMute,
  onHangup,
  onToggleHold,
}: {
  config: DesktopConfig;
  agentName: string;
  extension: string;
  agentStatus: AgentStatusCode | null;
  activeCall: ActiveCall | null;
  onMute: () => void;
  onHangup: () => void;
  onToggleHold: () => void;
}) {
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
      </div>

      <div className="panel placeholder-card">
        <h2>현재 통화</h2>
        <p>{activeCall ? `${activeCall.ani} / ${activeCall.sessionStatus}` : '진행 중인 통화 없음'}</p>
        <div className="placeholder-actions">
          <button type="button" disabled>
            수신
          </button>
          <button type="button" disabled={!activeCall} onClick={onHangup}>
            종료
          </button>
          <button type="button" disabled={!activeCall} onClick={onMute}>
            {activeCall?.isMuted ? '음소거 해제' : '음소거'}
          </button>
          <button type="button" disabled={!activeCall} onClick={onToggleHold}>
            {activeCall?.sessionStatus === 'HOLD' ? '재개' : '보류'}
          </button>
        </div>
      </div>
    </section>
  );
}
