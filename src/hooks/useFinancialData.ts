import { useState, useEffect, useCallback } from 'react';
import type { FinancialData, YoyComparison } from '@/types/financial';

const REFRESH_INTERVAL = 10 * 60 * 1000; // 10 minutes — pick up new filings faster

export function useFinancialData() {
  const [data, setData] = useState<FinancialData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    setError(null);

    try {
      // Primary: fetch from live NSE API via our Express backend
      const res = await fetch('/api/quarterly/ONGC', {
        cache: 'no-store',
        signal: AbortSignal.timeout(15000), // 15s timeout
      });

      if (!res.ok) throw new Error(`API ${res.status}`);
      const json: FinancialData & { _live?: boolean; _fallback?: boolean } = await res.json();
      setData(json);
      setIsLive(!!json._live);
      setLoading(false); // ✅ was missing — loading stayed true forever on success
      return;
    } catch (apiErr) {
      console.warn('[Data] Live API unavailable, falling back to static JSON:', apiErr);
    }

    // Fallback: static JSON (works even without Express backend)
    try {
      const res = await fetch('/data/quarterly.json', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: FinancialData = await res.json();
      setData(json);
      setIsLive(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();

    // Auto-refresh every 30 minutes to pick up newly filed results
    const interval = setInterval(() => load(true), REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [load]);

  return { data, loading, error, isLive, refresh: () => load(true) };
}

export function useYoyComparison(data: FinancialData | null): YoyComparison[] {
  if (!data) return [];

  const quarters = data.quarters;
  const comparisons: YoyComparison[] = [];

  for (let i = 0; i < quarters.length; i++) {
    const current = quarters[i];
    const year = parseInt(current.period.split(' ')[1]);
    const quarter = current.period.split(' ')[0];

    const prevYearQuarter = quarters.find(
      q => q.period === `${quarter} ${year - 1}`
    );

    if (prevYearQuarter) {
      comparisons.push({
        period: current.period,
        prevPeriod: prevYearQuarter.period,
        salesChange: ((current.sales - prevYearQuarter.sales) / prevYearQuarter.sales) * 100,
        profitChange: ((current.net_profit - prevYearQuarter.net_profit) / Math.abs(prevYearQuarter.net_profit)) * 100,
        epsChange: ((current.eps - prevYearQuarter.eps) / prevYearQuarter.eps) * 100,
        opmChange: current.opm_pct - prevYearQuarter.opm_pct,
      });
    }
  }

  return comparisons;
}
