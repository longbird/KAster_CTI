import { useEffect, useState } from 'react';
import { fetchDashboardData } from '../api/dashboardApi';
import type { DashboardData } from '../types/dashboard';

export function useDashboardData() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const next = await fetchDashboardData();
        if (!active) return;
        setData(next);
      } catch {
        // 백엔드 연결 실패 시 mock 폴백 (화면 항상 렌더)
        if (!active) return;
        try {
          const { baseDashboardData } = await import('../mocks/mockDashboard');
          if (active) setData(baseDashboardData);
        } catch {
          // mock도 실패하면 빈 데이터로 렌더
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    const timer = window.setInterval(() => void load(), 5000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  return { data, loading };
}
