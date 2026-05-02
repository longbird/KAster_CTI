import type { ReactNode } from 'react';

export function AdmPageHead({
  title,
  sub,
  right,
}: {
  title: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="adm-page-head">
      <div>
        <h1 className="adm-page-title">{title}</h1>
        {sub ? <div className="adm-page-sub">{sub}</div> : null}
      </div>
      {right ? <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>{right}</div> : null}
    </div>
  );
}
