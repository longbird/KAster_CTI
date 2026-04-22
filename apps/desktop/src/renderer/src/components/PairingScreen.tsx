import { useState } from 'react';

export function PairingScreen({
  onSubmit,
  busy,
}: {
  onSubmit: (params: { serverUrl: string; channel: string }) => void;
  busy: boolean;
}) {
  const [serverUrl, setServerUrl] = useState('');
  const [channel, setChannel] = useState('stable');

  return (
    <section className="pairing-screen">
      <div className="panel">
        <p className="eyebrow">Desktop Runtime</p>
        <h1>KAster Agent Desktop</h1>
        <p className="lead">
          콜센터 서버 정보를 먼저 저장합니다. 인증 handoff, 실시간 CTI, 업데이트 허브는 이후 계약 작업이
          끝나면 이 셸 위에 연결됩니다.
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

        <button disabled={busy} onClick={() => onSubmit({ serverUrl, channel })} type="button">
          {busy ? '저장 중...' : '초기 셸 준비'}
        </button>
      </div>
    </section>
  );
}
