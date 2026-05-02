import { CALL_SESSION_REALTIME_EVENTS, REALTIME_EVENTS } from './realtime-events';

describe('REALTIME_EVENTS', () => {
  it('keeps public Socket.IO event names stable', () => {
    expect(REALTIME_EVENTS).toEqual({
      CALL_CREATED: 'call.created',
      CALL_UPDATED: 'call.updated',
      CALL_ENDED: 'call.ended',
      SCREENPOP_CUSTOMER: 'screenpop.customer',
      AGENT_STATUS_CHANGED: 'agent.status.changed',
      QUEUE_SUMMARY_UPDATED: 'queue.summary.updated',
    });
  });

  it('lists call session lifecycle events in the event contract order', () => {
    expect(CALL_SESSION_REALTIME_EVENTS).toEqual([
      'call.created',
      'call.updated',
      'call.ended',
    ]);
  });
});
