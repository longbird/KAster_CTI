import type { DesktopConfig } from '../../../shared/ipc';

export function SoftphoneShell({ config }: { config: DesktopConfig }) {
  return (
    <section className="softphone-shell">
      <div className="hero-card panel">
        <p className="eyebrow">Softphone Shell</p>
        <h1>Runtime Skeleton Ready</h1>
        <p className="lead">
          현재 단계는 장치 제어와 서버 런타임 계약을 수용할 준비만 해 둔 상태입니다. 실제 통화 제어와
          인증 위임은 별도 세션 작업 완료 후 연결합니다.
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
      </div>

      <div className="panel placeholder-card">
        <h2>Call Runtime Placeholder</h2>
        <p>대기 상태</p>
        <div className="placeholder-actions">
          <button type="button" disabled>
            수신
          </button>
          <button type="button" disabled>
            종료
          </button>
          <button type="button" disabled>
            음소거
          </button>
          <button type="button" disabled>
            보류
          </button>
        </div>
      </div>
    </section>
  );
}
