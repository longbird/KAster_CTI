import { useEffect, useRef, useState } from 'react';
import { connectAdminRealtime, shouldRefreshDashboardForRealtimeEvent } from '../../../realtime/adminRealtime';
import { fetchDashboardData } from '../api/dashboardApi';
import type { DashboardData } from '../types/dashboard';

export function useDashboardData(branchId?: string) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);
  const requestSeqRef = useRef(0);

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!active) return;
      const requestSeq = requestSeqRef.current + 1;
      requestSeqRef.current = requestSeq;
      if (hasLoadedRef.current) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      try {
        const next = await fetchDashboardData(branchId);
        if (!active || requestSeq !== requestSeqRef.current) return;
        setData(next);
        hasLoadedRef.current = true;
        setError(null);
      } catch (error: any) {
        if (!active || requestSeq !== requestSeqRef.current) return;
        setError(error?.response?.data?.error?.message ?? '대시보드 데이터를 불러오지 못했습니다.');
      } finally {
        if (!active || requestSeq !== requestSeqRef.current) return;
        setLoading(false);
        setRefreshing(false);
      }
    };

    void load();
    const timer = window.setInterval(() => void load(), 5000);
    const disconnectRealtime = connectAdminRealtime((event) => {
      if (shouldRefreshDashboardForRealtimeEvent(event.type)) {
        void load();
      }
    });

    return () => {
      active = false;
      window.clearInterval(timer);
      disconnectRealtime();
    };
  }, [branchId]);

  return { data, loading, refreshing, error };
}
