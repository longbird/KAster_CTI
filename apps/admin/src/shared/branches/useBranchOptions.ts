import { useEffect, useState } from 'react';
import { apiClient } from '../lib/apiClient';

export interface BranchOption {
  branchId: string;
  branchCode: string;
  branchName: string;
}

export function useBranchOptions() {
  const [options, setOptions] = useState<BranchOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const res = await apiClient.get('/admin/settings/branches');
        if (!active) return;
        setOptions(res.data?.data ?? []);
      } catch {
        if (!active) return;
        setOptions([]);
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, []);

  return { options, loading };
}
