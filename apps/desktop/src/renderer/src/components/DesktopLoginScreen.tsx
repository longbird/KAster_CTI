import { useEffect, useState } from 'react';

interface DesktopLoginSubmitInput {
  serverUrl: string;
  loginId: string;
  extension: string;
  password: string;
}

export function DesktopLoginScreen({
  busy,
  error,
  serverUrl,
  serverUrlRequired,
  onSubmit,
  onTogglePairing,
}: {
  busy: boolean;
  error?: string | null;
  serverUrl: string;
  serverUrlRequired: boolean;
  onSubmit: (input: DesktopLoginSubmitInput) => void;
  onTogglePairing: () => void;
}) {
  const [draftServerUrl, setDraftServerUrl] = useState(serverUrl);
  const [showAdvanced, setShowAdvanced] = useState(serverUrlRequired);
  const [loginId, setLoginId] = useState('');
  const [extension, setExtension] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    setDraftServerUrl(serverUrl);
  }, [serverUrl]);

  useEffect(() => {
    setShowAdvanced(serverUrlRequired);
  }, [serverUrlRequired]);

  const serverFieldVisible = serverUrlRequired || showAdvanced;

  return (
    <section className="auth-screen">
      <form
        className="desktop-login-card"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit({
            serverUrl: draftServerUrl,
            loginId,
            extension,
            password,
          });
        }}
      >
        <header className="desktop-login-brand" onDoubleClick={onTogglePairing}>
          <div className="desktop-brand-box">K</div>
          <div className="desktop-brand-wordmark">
            KASTER<span> / CTI</span>
          </div>
        </header>

        <div className="desktop-login-heading">
          <h1>상담원 로그인</h1>
          <p>데스크톱 소프트폰 런타임이 자동으로 연결됩니다.</p>
          {!serverUrlRequired ? (
            <button
              className="desktop-login-advanced"
              type="button"
              onClick={() => setShowAdvanced((current) => !current)}
            >
              고급 옵션
            </button>
          ) : null}
        </div>

        {error ? <p className="desktop-login-error">{error}</p> : null}

        {serverFieldVisible ? (
          <label className="desktop-login-field">
            <span>서버 URL</span>
            <input
              autoComplete="url"
              disabled={busy}
              value={draftServerUrl}
              onChange={(event) => setDraftServerUrl(event.target.value)}
              placeholder="https://cti-center-a.example.com"
            />
          </label>
        ) : null}

        <label className="desktop-login-field">
          <span>로그인 ID</span>
          <input
            autoComplete="username"
            disabled={busy}
            value={loginId}
            onChange={(event) => setLoginId(event.target.value)}
          />
        </label>

        <label className="desktop-login-field">
          <span>내선 번호</span>
          <input
            autoComplete="tel"
            disabled={busy}
            value={extension}
            onChange={(event) => setExtension(event.target.value)}
          />
        </label>

        <label className="desktop-login-field">
          <span>비밀번호</span>
          <div className="password-input-shell">
            <input
              autoComplete="current-password"
              disabled={busy}
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button
              aria-label={showPassword ? '비밀번호 감추기' : '비밀번호 보기'}
              className="password-toggle-button"
              disabled={busy}
              type="button"
              onClick={() => setShowPassword((current) => !current)}
            >
              {showPassword ? '감추기' : '보기'}
            </button>
          </div>
        </label>

        <button className="desktop-login-submit" disabled={busy} type="submit">
          {busy ? '로그인 중...' : '로그인'}
        </button>

        <div className="desktop-login-footer">
          <span>desktop</span>
          <span>softphone · kaster-cti</span>
        </div>
      </form>
    </section>
  );
}
