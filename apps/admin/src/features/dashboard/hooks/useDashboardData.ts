import { useEffect, useRef, useState } from 'react';
import { fetchDashboardData } from '../api/dashboardApi';
import type { DashboardData } from '../types/dashboard';

export function useDashboardData(branchId?: string) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!active) return;
      if (hasLoadedRef.current) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      try {
        const next = await fetchDashboardData(branchId);
        if (!active) return;
        setData(next);
        hasLoadedRef.current = true;
        setError(null);
      } catch (error: any) {
        if (!active) return;
        setError(error?.response?.data?.error?.message ?? '대시보드 데이터를 불러오지 못했습니다.');
      } finally {
        if (!active) return;
        setLoading(false);
        setRefreshing(false);
      }
    };

    void load();
    const timer = window.setInterval(() => void load(), 5000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [branchId]);

  return { data, loading, refreshing, error };
}
