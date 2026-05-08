import { useEffect, useMemo, useState } from 'react';
import type { DesktopAgentDirectoryItem } from '../../../shared/ipc';
import {
  formatDirectoryAgentSummary,
  getAgentCallBlockReason,
} from './agent-directory-display';

const UNGROUPED_KEY = '__ungrouped__';
const UNGROUPED_LABEL = '미지정';

function groupKey(agent: DesktopAgentDirectoryItem): string {
  return agent.agentGroup?.agentGroupId ?? UNGROUPED_KEY;
}

function groupLabel(agent: DesktopAgentDirectoryItem): string {
  return agent.agentGroup?.groupName?.trim() || UNGROUPED_LABEL;
}

interface GroupBucket {
  key: string;
  label: string;
  members: DesktopAgentDirectoryItem[];
}

function bucketize(rows: DesktopAgentDirectoryItem[]): GroupBucket[] {
  const buckets = new Map<string, GroupBucket>();
  for (const agent of rows) {
    const key = groupKey(agent);
    const existing = buckets.get(key);
    if (existing) {
      existing.members.push(agent);
    } else {
      buckets.set(key, { key, label: groupLabel(agent), members: [agent] });
    }
  }

  const ordered = Array.from(buckets.values());
  ordered.sort((left, right) => {
    if (left.key === UNGROUPED_KEY && right.key !== UNGROUPED_KEY) return 1;
    if (right.key === UNGROUPED_KEY && left.key !== UNGROUPED_KEY) return -1;
    return left.label.localeCompare(right.label, 'ko-KR');
  });

  for (const bucket of ordered) {
    bucket.members.sort((left, right) =>
      left.extension.localeCompare(right.extension, 'ko-KR'),
    );
  }

  return ordered;
}

function matchesQuery(agent: DesktopAgentDirectoryItem, keyword: string): boolean {
  if (!keyword) return true;
  return [
    agent.agentName,
    agent.extension,
    agent.currentStatus?.statusCode,
    agent.agentGroup?.groupName,
    agent.agentGroup?.groupCode,
  ]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.includes(keyword));
}

export function AgentListPopup() {
  const [rows, setRows] = useState<DesktopAgentDirectoryItem[]>([]);
  const [query, setQuery] = useState('');
  const [groupFilter, setGroupFilter] = useState<string>('all');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

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

  const allGroups = useMemo(() => bucketize(rows), [rows]);

  const filteredBuckets = useMemo(() => {
    const keyword = query.trim();
    return allGroups
      .filter((bucket) => groupFilter === 'all' || bucket.key === groupFilter)
      .map((bucket) => ({
        ...bucket,
        members: bucket.members.filter((agent) => matchesQuery(agent, keyword)),
      }))
      .filter((bucket) => bucket.members.length > 0);
  }, [allGroups, query, groupFilter]);

  const totalShown = filteredBuckets.reduce((sum, bucket) => sum + bucket.members.length, 0);

  return (
    <main className="popup-layout agent-popup-layout">
      <header className="popup-header">
        <div>
          <h1>상담원 리스트</h1>
          <p>{totalShown}명 / 그룹 {filteredBuckets.length}</p>
        </div>
        <div className="agent-popup-filters">
          <select
            aria-label="그룹 선택"
            value={groupFilter}
            onChange={(event) => setGroupFilter(event.target.value)}
          >
            <option value="all">전체 그룹</option>
            {allGroups.map((bucket) => (
              <option key={bucket.key} value={bucket.key}>
                {bucket.label} ({bucket.members.length})
              </option>
            ))}
          </select>
          <input
            aria-label="상담원 검색"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="이름, 내선, 그룹"
          />
        </div>
      </header>

      <section className="popup-agent-tree">
        {filteredBuckets.map((bucket) => {
          const isCollapsed = Boolean(collapsed[bucket.key]);
          return (
            <div key={bucket.key} className="popup-agent-group">
              <button
                type="button"
                className="popup-agent-group__header"
                aria-expanded={!isCollapsed}
                onClick={() =>
                  setCollapsed((current) => ({ ...current, [bucket.key]: !current[bucket.key] }))
                }
              >
                <span>{isCollapsed ? '▶' : '▼'}</span>
                <strong>{bucket.label}</strong>
                <span className="popup-agent-group__count">{bucket.members.length}</span>
              </button>
              {isCollapsed ? null : (
                <div className="popup-agent-list">
                  {bucket.members.map((agent) => {
                    const callBlockedReason = getAgentCallBlockReason(agent);
                    return (
                      <button
                        type="button"
                        key={agent.agentId}
                        disabled={Boolean(callBlockedReason)}
                        title={
                          callBlockedReason ? `내선 통화 불가: ${callBlockedReason}` : '내선 통화 가능'
                        }
                      >
                        <span>{agent.agentName}</span>
                        <small>{formatDirectoryAgentSummary(agent)}</small>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {filteredBuckets.length === 0 ? (
          <p className="console-muted">표시할 상담원이 없습니다.</p>
        ) : null}
      </section>
    </main>
  );
}
