import { useState, useEffect, useCallback, useRef } from 'react';
import type { NSEQuoteData, NSEDataState } from '@/types/financial';

const API_BASE = '/api/nse';
const REFRESH_INTERVAL_MARKET = 5 * 1000; // 5 seconds during market hours for fresher quotes
const REFRESH_INTERVAL_CLOSED = 60 * 1000; // 60 seconds outside market hours
const FETCH_TIMEOUT = 12 * 1000;           // 12 second timeout per fetch (server times out at 15s)
const INITIAL_RETRY_DELAY = 5 * 1000;      // 5 second initial retry delay
const MAX_RETRY_DELAY = 60 * 1000;         // Cap retry delay at 60 seconds

// Indian market hours: 9:15 AM to 3:30 PM IST (Mon-Fri)
// Uses Intl timezone conversion — works correctly regardless of user's local timezone
function isMarketHours(): boolean {
  const now = new Date();

  // Use Intl to get current IST time components
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    hour12: false,
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
  });

  const parts = formatter.formatToParts(now);
  const weekday = parts.find(p => p.type === 'weekday')?.value;
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);

  // Weekend check
  if (weekday === 'Sat' || weekday === 'Sun') return false;

  const istTimeMinutes = hour * 60 + minute;
  const marketOpen  = 9 * 60 + 15;  // 9:15 AM IST
  const marketClose = 15 * 60 + 30; // 3:30 PM IST

  return istTimeMinutes >= marketOpen && istTimeMinutes <= marketClose;
}

export function useNSEQuote(symbol: string = 'ONGC'): NSEDataState & {
  refresh: () => void;
  lastPrice: number | null;
  priceChanged: boolean;
  secondsSinceUpdate: number;
} {
  const [state, setState] = useState<NSEDataState>({
    data: null,
    loading: true,
    error: null,
    isLive: false,
    lastFetched: null,
  });

  // Track price changes for flash animation
  const [lastPrice, setLastPrice] = useState<number | null>(null);
  const [priceChanged, setPriceChanged] = useState(false);
  const [secondsSinceUpdate, setSecondsSinceUpdate] = useState(0);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryDelayRef = useRef(INITIAL_RETRY_DELAY);
  const lastPriceRef = useRef<number | null>(null);

  // Countdown timer — updates every second to show "X seconds ago"
  useEffect(() => {
    countdownRef.current = setInterval(() => {
      setSecondsSinceUpdate(prev => prev + 1);
    }, 1000);
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  const fetchQuote = useCallback(async (force = false) => {
    const shouldForce = force || isMarketHours();

    try {
      const url = `${API_BASE}/quote/${encodeURIComponent(symbol)}${shouldForce ? '?force=1' : ''}`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT),
      });

      if (!res.ok) {
        throw new Error(`NSE API returned ${res.status}`);
      }

      const data: NSEQuoteData = await res.json();
      const marketOpen = isMarketHours();
      const isFresh = !data._stale && !data._timeout && marketOpen;
      const nextLastPrice = data.lastPrice || lastPriceRef.current;

      // Detect price change for flash animation only when the response is truly fresh.
      if (isFresh && lastPriceRef.current !== null && data.lastPrice !== lastPriceRef.current) {
        setPriceChanged(true);
        setTimeout(() => setPriceChanged(false), 1500); // Flash for 1.5s
      }

      lastPriceRef.current = nextLastPrice;
      setLastPrice(nextLastPrice);
      setSecondsSinceUpdate(0); // Reset countdown

      setState({
        data: isFresh
          ? data
          : {
              ...data,
              _stale: true,
            },
        loading: false,
        error: null,
        // Treat as live only when the backend returned a fresh non-stale response
        // and the market is currently open. This avoids showing stale timeout data
        // as though it were current spot price.
        isLive: isFresh,
        lastFetched: new Date(),
      });

      // Reset retry delay on success
      retryDelayRef.current = INITIAL_RETRY_DELAY;

      // Clear any pending retry
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    } catch (err) {
      setState(prev => ({
        ...prev,
        data: prev.data
          ? {
              ...prev.data,
              _stale: true,
              _timeout: true,
            }
          : null,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to fetch NSE data',
        isLive: false,
      }));

      // Exponential backoff retry: 5s, 10s, 20s, 40s, capped at 60s
      if (!retryTimeoutRef.current) {
        const delay = retryDelayRef.current;
        console.log(`[NSE] Will retry in ${delay / 1000}s...`);
        retryTimeoutRef.current = setTimeout(() => {
          retryTimeoutRef.current = null;
          retryDelayRef.current = Math.min(retryDelayRef.current * 2, MAX_RETRY_DELAY);
          fetchQuote(false);
        }, delay);
      }
    }
  }, [symbol, lastPrice]);

  useEffect(() => {
    fetchQuote(true);

    // Adaptive refresh: faster during market hours, slower otherwise
    const setupInterval = () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      const interval = isMarketHours() ? REFRESH_INTERVAL_MARKET : REFRESH_INTERVAL_CLOSED;
      console.log(`[NSE] Polling every ${interval / 1000}s (market ${isMarketHours() ? 'OPEN' : 'CLOSED'})`);
      intervalRef.current = setInterval(() => {
        fetchQuote(true);
      }, interval);
    };

    setupInterval();

    // Re-evaluate the interval every 2 minutes to adapt to market open/close
    const adaptiveCheck = setInterval(setupInterval, 2 * 60 * 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
      clearInterval(adaptiveCheck);
    };
  }, [fetchQuote]);

  return {
    ...state,
    refresh: () => fetchQuote(true), // Manual refresh always forces cache bypass
    lastPrice,
    priceChanged,
    secondsSinceUpdate,
  };
}
