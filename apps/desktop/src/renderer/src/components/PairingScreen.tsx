import { useState } from 'react';

export function PairingScreen({
  onSubmit,
  busy,
  onBack,
}: {
  onSubmit: (params: { serverUrl: string; channel: string; handoffToken: string }) => void;
  busy: boolean;
  onBack?: () => void;
}) {
  const [serverUrl, setServerUrl] = useState('');
  const [channel, setChannel] = useState('stable');
  const [handoffToken, setHandoffToken] = useState('');

  return (
    <section className="pairing-screen">
      <div className="panel">
        <p className="eyebrow">Desktop Runtime</p>
        <h1>KAster Agent Desktop</h1>
        <p className="lead">
          디버그 전용 화면입니다. 콜센터 서버 URL과 웹에서 발급한 handoff token 으로 데스크톱 런타임을
          수동 연결합니다.
        </p>

        <label className="field">
          <span>콜센터 서버 URL</span>
          <input
            value={serverUrl}
            onChange={(event) => setServerUrl(event.target.value)}
            placeholder="https://cti-center-a.example.com"
          />
        </label>

        <label className="field">
          <span>배포 채널</span>
          <input
            value={channel}
            onChange={(event) => setChannel(event.target.value)}
            placeholder="stable"
          />
        </label>

        <label className="field">
          <span>Handoff Token</span>
          <input
            value={handoffToken}
            onChange={(event) => setHandoffToken(event.target.value)}
            placeholder="handoff token"
          />
        </label>

        <div className="placeholder-actions">
          <button disabled={busy} onClick={() => onSubmit({ serverUrl, channel, handoffToken })} type="button">
            {busy ? '연결 중...' : '데스크톱 연결'}
          </button>
          {onBack ? (
            <button className="secondary-button" onClick={onBack} type="button">
              로그인으로 돌아가기
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
