import { useEffect, useState } from 'react';
import type { DesktopAgentDirectoryItem } from '../../../shared/ipc';

export function AgentListPopup() {
  const [rows, setRows] = useState<DesktopAgentDirectoryItem[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let alive = true;
    void (async () => {
      const desktopApi =
        typeof window !== 'undefined' && 'desktopApi' in window ? window.desktopApi : null;
      const agents = await desktopApi?.getAgentDirectory?.();
      if (alive) {
        setRows(agents ?? []);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const filtered = rows.filter((agent) => {
    const keyword = query.trim();
    if (!keyword) {
      return true;
    }

    return [agent.agentName, agent.extension, agent.currentStatus?.statusCode]
      .filter(Boolean)
      .some((value) => String(value).includes(keyword));
  });

  return (
    <main className="popup-layout agent-popup-layout">
      <header className="popup-header">
        <div>
          <h1>상담원 리스트</h1>
          <p>{filtered.length}명</p>
        </div>
        <input
          aria-label="상담원 검색"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="이름, 내선"
        />
      </header>

      <section className="popup-agent-list">
        {filtered.map((agent) => (
          <button
            type="button"
            key={agent.agentId}
            disabled={!agent.isActive}
            onClick={() => {
              const desktopApi =
                typeof window !== 'undefined' && 'desktopApi' in window ? window.desktopApi : null;
              void desktopApi?.originateInternal?.({
                targetAgentId: agent.agentId,
                targetExtension: agent.extension,
              });
            }}
          >
            <span>{agent.agentName}</span>
            <small>{agent.extension} / {agent.currentStatus?.statusCode ?? 'UNKNOWN'}</small>
          </button>
        ))}
        {filtered.length === 0 ? <p className="console-muted">표시할 상담원이 없습니다.</p> : null}
      </section>
    </main>
  );
}
