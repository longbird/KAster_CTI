import { useEffect } from 'react';
import { connectAdminRealtime, shouldRefreshDashboardForRealtimeEvent } from './adminRealtime';

export function useAdminRealtimeRefresh(refresh: () => void, eventNames?: string[]) {
  const eventKey = eventNames?.join('|');

  useEffect(() => {
    const allowed = eventNames ? new Set(eventNames) : null;
    return connectAdminRealtime((event) => {
      if (allowed ? allowed.has(event.type) : shouldRefreshDashboardForRealtimeEvent(event.type)) {
        refresh();
      }
    });
  }, [refresh, eventKey]);
}
