export interface RealtimeQueueSummaryItem {
  queueId: string;
  queueName: string;
  waitingCount: number;
  talkingCount: number;
  availableAgents: number;
  longestWaitSeconds: number;
}

export function toRealtimeQueueSummary(
  rows: Array<{
    queueId: string;
    queueName: string;
    queueDisplayName?: string | null;
    waiting?: number;
    talking?: number;
    available?: number;
    longestWaitSeconds?: number;
  }>,
): RealtimeQueueSummaryItem[] {
  return rows.map((row) => ({
    queueId: row.queueId,
    queueName: row.queueDisplayName ?? row.queueName,
    waitingCount: row.waiting ?? 0,
    talkingCount: row.talking ?? 0,
    availableAgents: row.available ?? 0,
    longestWaitSeconds: row.longestWaitSeconds ?? 0,
  }));
}
