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
        className="login-card panel"
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
        <header className="login-card-header" onDoubleClick={onTogglePairing}>
          <h1>KAster Agent Desktop</h1>
          {!serverUrlRequired ? (
            <button
              className="text-button"
              type="button"
              onClick={() => setShowAdvanced((current) => !current)}
            >
              고급 옵션
            </button>
          ) : null}
        </header>

        {serverFieldVisible ? (
          <label className="field compact-field">
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

        <label className="field compact-field">
          <span>로그인 ID</span>
          <input
            autoComplete="username"
            disabled={busy}
            value={loginId}
            onChange={(event) => setLoginId(event.target.value)}
          />
        </label>

        <label className="field compact-field">
          <span>내선</span>
          <input
            autoComplete="tel"
            disabled={busy}
            value={extension}
            onChange={(event) => setExtension(event.target.value)}
          />
        </label>

        <label className="field compact-field">
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

        {error ? <p className="login-error">{error}</p> : null}

        <button className="primary-button" disabled={busy} type="submit">
          {busy ? '로그인 중...' : '로그인'}
        </button>
      </form>
    </section>
  );
}
