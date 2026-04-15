import { useEffect, useState } from 'react';
import { fetchDashboardData } from '../api/dashboardApi';
import type { DashboardData } from '../types/dashboard';

export function useDashboardData() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const load = async () => {
      const next = await fetchDashboardData();
      if (!active) return;
      setData(next);
      setLoading(false);
    };

    load();
    const timer = window.setInterval(load, 5000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  return { data, loading };
}
