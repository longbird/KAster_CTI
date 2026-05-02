export const REALTIME_EVENTS = {
  CALL_CREATED: 'call.created',
  CALL_UPDATED: 'call.updated',
  CALL_ENDED: 'call.ended',
  SCREENPOP_CUSTOMER: 'screenpop.customer',
  AGENT_STATUS_CHANGED: 'agent.status.changed',
  QUEUE_SUMMARY_UPDATED: 'queue.summary.updated',
} as const;

export type RealtimeEventName =
  (typeof REALTIME_EVENTS)[keyof typeof REALTIME_EVENTS];

export const CALL_SESSION_REALTIME_EVENTS = [
  REALTIME_EVENTS.CALL_CREATED,
  REALTIME_EVENTS.CALL_UPDATED,
  REALTIME_EVENTS.CALL_ENDED,
] as const;
