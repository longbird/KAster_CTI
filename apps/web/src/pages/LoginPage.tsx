import { useState } from 'react';
import { login } from '../api';
import { extractErrorMessage } from '../utils/errorMessage';

// v2 Operator — kc-login. Dark card over dotted radial mask.
export function LoginPage() {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [extension, setExtension] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginId || !password || !extension) {
      setError('로그인 ID, 비밀번호, 내선 번호를 모두 입력하세요.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await login({ loginId, password, extension });
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

        <div className="kc-login-field">
          <label htmlFor="kc-login-id">LOGIN ID</label>
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
          <label htmlFor="kc-login-pw">PASSWORD</label>
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
          <label htmlFor="kc-login-ext">EXTENSION</label>
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
