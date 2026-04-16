// apps/admin/src/features/monitoring/hooks/useHealthData.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { API_BASE_URL, USE_MOCK } from '../../../config';
import type { HealthResponse } from '../types/health';

// 데모/QA 환경에서 화면이 채워진 상태를 보여주기 위해 의도적으로 비제로 값 사용
const MOCK_HEALTH: HealthResponse = {
  status: 'ok',
  timestamp: new Date().toISOString(),
  instanceId: 'mock',
  leader: true,
  checks: { db: 'up', redis: 'up', ami: 'connected' },
  call: { active: 5, queued: 2, ringing: 1, talking: 3, hold: 0, transferring: 0, stuck: 0, longestWaitingSeconds: 45 },
  agent: { available: 8, talking: 3, ringing: 1, paused: 2, loggedIn: 14 },
  queue: { waiting: 2, ringing: 1, talking: 3, availableAgents: 8, longestWaitSeconds: 45 },
};

export interface UseHealthDataOptions {
  intervalMs?: number;
}

export interface UseHealthDataResult {
  data: HealthResponse | null;
  lastUpdated: Date | null;
  /** true only before the first response (success or failure) */
  isLoading: boolean;
  error: string | null;
  /** seconds until next auto-refresh, counts down 1s per tick */
  secondsUntilRefresh: number;
  refetch: () => void;
}

export function useHealthData({ intervalMs = 10_000 }: UseHealthDataOptions = {}): UseHealthDataResult {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [secondsUntilRefresh, setSecondsUntilRefresh] = useState(Math.ceil(intervalMs / 1000));

  const tickRef = useRef(0);
  const activeRef = useRef(true);
  const fetchingRef = useRef(false);

  const doFetch = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    if (USE_MOCK) {
      setData({ ...MOCK_HEALTH, timestamp: new Date().toISOString() });
      setLastUpdated(new Date());
      setIsLoading(false);
      setError(null);
      fetchingRef.current = false;
      return;
    }

    try {
      // /health 는 ResponseTransformInterceptor 제외 대상이 아니므로 envelope { success, data }
      // 로 감싸져서 반환된다. res.data.data 로 읽어야 HealthResponse 에 접근 가능.
      const res = await axios.get<{ success: boolean; data: HealthResponse; error: null }>(`${API_BASE_URL}/health`);
      if (!activeRef.current) return;
      // envelope 여부를 런타임으로 판별 — 직접 DTO 반환일 경우도 수용
      const payload = (res.data as any)?.data ?? res.data;
      setData(payload as HealthResponse);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      if (!activeRef.current) return;
      setError(err instanceof Error ? err.message : '알 수 없는 오류');
    } finally {
      if (activeRef.current) {
        setIsLoading(false);
      }
      fetchingRef.current = false;
    }
  }, []);

  const refetch = useCallback(() => {
    tickRef.current = 0;
    setSecondsUntilRefresh(Math.ceil(intervalMs / 1000));
    void doFetch();
  }, [doFetch, intervalMs]);

  useEffect(() => {
    activeRef.current = true;
    fetchingRef.current = false; // re-mount 시 이전 fetch 잠금 해제 (React 18 Strict Mode 대응)
    tickRef.current = 0;
    setSecondsUntilRefresh(Math.ceil(intervalMs / 1000));
    void doFetch();

    const id = setInterval(() => {
      if (!activeRef.current) return;
      tickRef.current += 1;
      const elapsed = tickRef.current * 1000;
      const remaining = Math.max(0, intervalMs - elapsed);
      setSecondsUntilRefresh(Math.ceil(remaining / 1000));

      if (elapsed >= intervalMs) {
        tickRef.current = 0;
        setSecondsUntilRefresh(Math.ceil(intervalMs / 1000));
        void doFetch();
      }
    }, 1000);

    return () => {
      activeRef.current = false;
      clearInterval(id);
    };
  }, [doFetch, intervalMs]);

  return { data, lastUpdated, isLoading, error, secondsUntilRefresh, refetch };
}
