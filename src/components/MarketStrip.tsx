import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrendingUp,
  TrendingDown,
  Building2,
  Percent,
  BookOpen,
  Award,
  Activity,
  BarChart3,
  RefreshCw,
  Wifi,
  WifiOff,
} from 'lucide-react';
import type { NSEQuoteData } from '@/types/financial';

interface MarketStripProps {
  nseData: NSEQuoteData | null;
  isLive: boolean;
  nseLoading: boolean;
  nseError: string | null;
  onRefresh?: () => void;
  /** Fallback snapshot data (from static JSON) used when NSE is unavailable */
  fallbackSnapshot?: Record<string, string>;
  /** True when price just changed — triggers flash animation */
  priceChanged?: boolean;
  /** Seconds since last successful data fetch */
  secondsSinceUpdate?: number;
}

/** Format market cap (value is already in Crores from server) */
function formatMarketCapCr(crores: number): string {
  if (crores >= 100000) return `₹${(crores / 100000).toFixed(2)} L Cr`;
  return `₹${crores.toLocaleString('en-IN')} Cr`;
}

/** Format seconds into human-readable "Xs ago" / "Xm ago" */
function formatTimeSince(seconds: number): string {
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
}

export function MarketStrip({
  nseData,
  isLive,
  nseLoading,
  nseError,
  onRefresh,
  fallbackSnapshot,
  priceChanged,
  secondsSinceUpdate = 0,
}: MarketStripProps) {
  // Helper: get a snapshot value as fallback for missing NSE fields
  const snap = (key: string) => fallbackSnapshot?.[key] ?? null;

  // If NSE data is available, build items from live data
  if (nseData) {
    const hasPrice = Boolean(nseData.lastPrice);
    const priceChange = hasPrice ? nseData.change : 0;
    const priceChangePercent = hasPrice ? nseData.pChange : 0;
    const isPositive = priceChange >= 0;

    // Auto-refresh progress bar: fills over 10s (market) or 60s (closed)
    const refreshInterval = isLive ? 10 : 60;
    const progressPercent = Math.min((secondsSinceUpdate / refreshInterval) * 100, 100);

    const priceLabel = isLive ? 'Current Price' : 'Last Price';

    const items = [
      {
        label: priceLabel,
        value: hasPrice ? `₹${nseData.lastPrice.toLocaleString('en-IN')}` : '—',
        sub: hasPrice
          ? `${isPositive ? '+' : ''}${priceChange.toFixed(2)} (${isPositive ? '+' : ''}${priceChangePercent.toFixed(2)}%)`
          : 'waiting for fresh market data',
        subColor: isPositive ? 'text-emerald-400' : 'text-rose-400',
        icon: isPositive ? <TrendingUp className="w-3.5 h-3.5 text-emerald-400" /> : <TrendingDown className="w-3.5 h-3.5 text-rose-400" />,
        isPrice: true,
      },
      {
        label: 'Market Cap',
        value: nseData.marketCap
          ? formatMarketCapCr(nseData.marketCap)
          : snap('Market Cap') ?? '—',
        sub: !nseData.marketCap && snap('Market Cap') ? 'snapshot' : undefined,
        subColor: 'text-paper-faint',
        icon: <Building2 className="w-3.5 h-3.5 text-steel" />,
      },
      {
        label: 'P/E Ratio',
        value: nseData.pe || snap('Stock P/E') || '—',
        sub: nseData.sectorPE
          ? `Sector: ${nseData.sectorPE}`
          : !nseData.pe && snap('Stock P/E')
          ? 'snapshot'
          : undefined,
        subColor: nseData.sectorPE ? undefined : 'text-paper-faint',
        icon: <Percent className="w-3.5 h-3.5 text-emerald" />,
      },
      {
        label: '52W High / Low',
        value: `₹${nseData.weekHigh52} / ₹${nseData.weekLow52}`,
        icon: <BarChart3 className="w-3.5 h-3.5 text-brass" />,
      },
      {
        label: 'Day Range',
        value: `₹${nseData.low} — ₹${nseData.high}`,
        icon: <Activity className="w-3.5 h-3.5 text-steel" />,
      },
      {
        label: 'Volume',
        value: nseData.totalTradedVolume > 0
          ? nseData.totalTradedVolume.toLocaleString('en-IN')
          : 'N/A',
        sub: nseData.totalTradedVolume === 0 ? 'Unavailable' : undefined,
        subColor: 'text-paper-faint',
        icon: <Award className="w-3.5 h-3.5 text-brass" />,
      },
      {
        label: 'Prev Close',
        value: `₹${nseData.previousClose.toLocaleString('en-IN')}`,
        icon: <BookOpen className="w-3.5 h-3.5 text-emerald" />,
      },
    ];

    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="bg-panel border border-line rounded-md overflow-hidden mb-6"
      >
        {/* NSE Live header bar */}
        <div className="flex items-center justify-between px-5 py-2 bg-panel-alt/30 border-b border-line/50">
          <div className="flex items-center gap-2">
            {isLive ? (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
              </span>
            ) : (
              <Wifi className="w-3 h-3 text-paper-faint" />
            )}
            <span className="font-mono text-[10px] uppercase tracking-wider text-paper-faint">
              {isLive ? 'NSE Live' : 'NSE Data'} — {nseData.symbol}
              {nseData._cached && ' (cached)'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {/* Updated time ago */}
            <span className="font-mono text-[10px] text-paper-faint">
              {formatTimeSince(secondsSinceUpdate)}
            </span>
            {nseData.lastUpdateTime && (
              <span className="font-mono text-[10px] text-paper-faint hidden sm:inline">
                {nseData.lastUpdateTime}
              </span>
            )}
            {onRefresh && (
              <button
                onClick={onRefresh}
                className="p-1 rounded hover:bg-panel-alt transition-colors group"
                title="Force refresh NSE data"
              >
                <RefreshCw className="w-3 h-3 text-paper-faint group-hover:text-brass transition-colors" />
              </button>
            )}
          </div>
        </div>

        {/* Auto-refresh progress bar */}
        <div className="h-[2px] bg-panel-alt/20 relative overflow-hidden">
          <motion.div
            className={`h-full ${isLive ? 'bg-emerald-400/40' : 'bg-brass/30'}`}
            initial={{ width: '0%' }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 0.5, ease: 'linear' }}
          />
        </div>

        {/* Data items */}
        <div className="flex flex-wrap">
          {items.map((item, index) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 + index * 0.05 }}
              className="flex-1 min-w-[120px] px-4 py-3.5 border-r border-line last:border-r-0 hover:bg-panel-alt/50 transition-colors"
            >
              <div className="flex items-center gap-2 mb-1.5">
                {item.icon}
                <span className="font-mono text-xs uppercase tracking-wider text-paper-dim">
                  {item.label}
                </span>
              </div>
              <AnimatePresence mode="wait">
                <motion.span
                  key={item.value}
                  initial={item.isPrice && priceChanged ? { opacity: 0.5, scale: 1.05 } : false}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4 }}
                  className={`font-display text-lg sm:text-xl font-semibold whitespace-nowrap block ${
                    item.isPrice && priceChanged
                      ? isPositive ? 'text-emerald-400' : 'text-rose-400'
                      : 'text-paper'
                  }`}
                >
                  {item.value}
                </motion.span>
              </AnimatePresence>
              {item.sub && (
                <div className={`font-mono text-xs mt-1 ${item.subColor || 'text-paper-dim'}`}>
                  {item.sub}
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </motion.div>
    );
  }

  // Loading state
  if (nseLoading) {
    return (
      <div className="bg-panel border border-line rounded-md p-6 mb-6">
        <div className="flex items-center gap-3">
          <RefreshCw className="w-4 h-4 text-brass animate-spin" />
          <span className="font-mono text-xs text-paper-faint uppercase tracking-wider">
            Connecting to NSE India...
          </span>
        </div>
      </div>
    );
  }

  // Error state — fall back to static snapshot if available
  if (nseError && fallbackSnapshot) {
    const iconMap: Record<string, React.ReactNode> = {
      'Current Price': <TrendingUp className="w-3.5 h-3.5 text-brass" />,
      'Market Cap': <Building2 className="w-3.5 h-3.5 text-steel" />,
      'Stock P/E': <Percent className="w-3.5 h-3.5 text-emerald" />,
      'Dividend Yield': <TrendingDown className="w-3.5 h-3.5 text-maroon" />,
      'ROCE': <Award className="w-3.5 h-3.5 text-brass" />,
      'ROE': <Award className="w-3.5 h-3.5 text-steel" />,
      'Book Value': <BookOpen className="w-3.5 h-3.5 text-emerald" />,
    };

    const items = [
      { label: 'Current Price', key: 'Current Price' },
      { label: 'Market Cap', key: 'Market Cap' },
      { label: 'Stock P/E', key: 'Stock P/E' },
      { label: 'High / Low', key: 'High / Low' },
      { label: 'Dividend Yield', key: 'Dividend Yield' },
      { label: 'ROCE', key: 'ROCE' },
      { label: 'ROE', key: 'ROE' },
      { label: 'Book Value', key: 'Book Value' },
    ].filter(item => fallbackSnapshot[item.key]);

    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="bg-panel border border-line rounded-md overflow-hidden mb-6"
      >
        <div className="flex items-center justify-between px-5 py-2 bg-panel-alt/30 border-b border-line/50">
          <div className="flex items-center gap-2">
            <WifiOff className="w-3 h-3 text-rose-400" />
            <span className="font-mono text-[10px] uppercase tracking-wider text-rose-400/80">
              NSE offline — showing cached data • retrying automatically
            </span>
          </div>
          {onRefresh && (
            <button onClick={onRefresh} className="p-1 rounded hover:bg-panel-alt transition-colors">
              <RefreshCw className="w-3 h-3 text-paper-faint hover:text-brass" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap">
          {items.map((item, index) => (
            <motion.div
              key={item.key}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 + index * 0.05 }}
              className="flex-1 min-w-[120px] px-4 py-3.5 border-r border-line last:border-r-0 hover:bg-panel-alt/50 transition-colors"
            >
              <div className="flex items-center gap-2 mb-1.5">
                {iconMap[item.key]}
                <span className="font-mono text-xs uppercase tracking-wider text-paper-dim">
                  {item.label}
                </span>
              </div>
              <span className="font-display text-lg sm:text-xl font-semibold text-paper whitespace-nowrap">
                {fallbackSnapshot[item.key]}
              </span>
            </motion.div>
          ))}
        </div>
      </motion.div>
    );
  }

  // No data at all
  return (
    <div className="bg-panel border border-line rounded-md p-8 text-center mb-6">
      <WifiOff className="w-5 h-5 text-paper-faint mx-auto mb-2" />
      <p className="text-paper-faint font-mono text-sm">
        Unable to connect to NSE India.
        {onRefresh && (
          <button onClick={onRefresh} className="ml-2 text-brass hover:text-brass/80 transition-colors underline">
            Retry
          </button>
        )}
      </p>
    </div>
  );
}
