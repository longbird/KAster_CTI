import { FormEvent, useState } from 'react';
import { createDesktopHandoff, login, logout } from '../api';
import { API_BASE_URL } from '../config';
import { extractErrorMessage } from '../utils/errorMessage';
import {
  buildDesktopConnectUrl,
  deriveCenterServerUrl,
  ensureDesktopAgentReady,
  launchDesktopProtocol,
  waitForDesktopHandoff,
} from '../utils/desktopBridge';

type TelephonyMode = 'softphone' | 'deskphone';

// v2 Operator — kc-login. Dark card over dotted radial mask.
export function LoginPage() {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [extension, setExtension] = useState('');
  const [telephonyMode, setTelephonyMode] = useState<TelephonyMode>('softphone');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!loginId || !password || !extension) {
      setError('로그인 ID, 비밀번호, 내선 번호를 모두 입력하세요.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      if (telephonyMode === 'softphone') {
        const desktopReady = await ensureDesktopAgentReady();
        if (!desktopReady.ready) {
          throw new Error(desktopReady.message);
        }
      }

      await login({ loginId, password, extension, telephonyMode });

      if (telephonyMode === 'softphone') {
        try {
          const handoff = await createDesktopHandoff();
          const connectUrl = buildDesktopConnectUrl({
            serverUrl: deriveCenterServerUrl(API_BASE_URL),
            handoffToken: handoff.handoffToken,
            channel: 'stable',
          });
          launchDesktopProtocol(connectUrl);
          const handoffResult = await waitForDesktopHandoff(handoff.handoffToken);
          if (!handoffResult.connected) {
            throw new Error(handoffResult.message);
          }
        } catch (err: unknown) {
          await logout();
          throw err;
        }
      }
    } catch (err) {
      setError(extractErrorMessage(err, '로그인 실패'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="kc-login">
      <form className="kc-login-card" onSubmit={onSubmit}>
        <div className="kc-login-brand">
          <div className="kc-brand-box" style={{ width: 28, height: 28, fontSize: 15 }}>K</div>
          <div className="kc-brand-wm" style={{ fontSize: 12 }}>
            KASTER<span> / CTI</span>
          </div>
        </div>

        <h1 className="kc-login-title">상담원 로그인</h1>
        <p className="kc-login-sub">AMI 세션이 자동으로 연결됩니다.</p>

        {error && <div className="kc-login-error">{error}</div>}

        <fieldset className="kc-login-field">
          <legend>통화 방식</legend>
          <label>
            <input
              type="radio"
              name="telephonyMode"
              value="softphone"
              checked={telephonyMode === 'softphone'}
              onChange={() => setTelephonyMode('softphone')}
            />
            <span>소프트폰 사용</span>
          </label>
          <label>
            <input
              type="radio"
              name="telephonyMode"
              value="deskphone"
              checked={telephonyMode === 'deskphone'}
              onChange={() => setTelephonyMode('deskphone')}
            />
            <span>SIP Phone 사용</span>
          </label>
        </fieldset>

        <div className="kc-login-field">
          <label htmlFor="kc-login-id">로그인 ID</label>
          <input
            id="kc-login-id"
            className="k-input"
            style={{ width: '100%' }}
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
            placeholder="agent1001"
            autoFocus
          />
        </div>

        <div className="kc-login-field">
          <label htmlFor="kc-login-pw">비밀번호</label>
          <input
            id="kc-login-pw"
            className="k-input"
            style={{ width: '100%' }}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>

        <div className="kc-login-field">
          <label htmlFor="kc-login-ext">내선 번호</label>
          <input
            id="kc-login-ext"
            className="k-input"
            style={{ width: '100%' }}
            value={extension}
            onChange={(e) => setExtension(e.target.value)}
            placeholder="1001"
          />
        </div>

        <button
          type="submit"
          className="k-btn k-btn-primary"
          style={{ width: '100%', height: 34, marginTop: 6 }}
          disabled={loading}
        >
          {loading ? '접속 중…' : '로그인'}
        </button>

        <div className="kc-login-footer">
          <span>v2.4.1</span>
          <span>ami · kaster-cti</span>
        </div>
      </form>
    </div>
  );
}
