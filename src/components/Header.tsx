import { format } from 'date-fns';
import { WifiOff, Clock } from 'lucide-react';

interface HeaderProps {
  fetchedAt?: string;
  isNSELive?: boolean;
  isQuarterlyLive?: boolean;
  nseLastUpdate?: string;
  /** True if NSE data is available (even if market is closed) */
  hasNSEData?: boolean;
}

export function Header({ fetchedAt, isNSELive, isQuarterlyLive, nseLastUpdate, hasNSEData }: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 glass-panel border-b border-line/80">
      <div className="max-w-[1480px] mx-auto flex items-center justify-between gap-4 px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-gradient-to-br from-maroon to-[#7a2e2b] flex items-center justify-center flex-shrink-0 border border-brass/30">
            <span className="font-display font-semibold text-sm text-brass">ON</span>
          </div>
          <div>
            <h1 className="font-display text-lg sm:text-xl font-semibold text-paper leading-tight">
              ONGC — Quarterly Financial Performance
            </h1>
            <p className="text-xs sm:text-sm text-paper-dim font-mono uppercase tracking-wider mt-0.5">
              {isQuarterlyLive ? 'Live data from NSE India • Quarterly results via NSE API' : 'Live data from NSE India • Quarterly results from BSE/NSE filings'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 sm:gap-6 text-[10px] sm:text-xs text-paper-dim font-mono uppercase tracking-wider">
          {/* NSE connection status */}
          <span className="flex items-center gap-2">
            {isNSELive ? (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                </span>
                <span className="hidden sm:inline text-emerald-400">NSE Connected</span>
              </>
            ) : hasNSEData ? (
              <>
                <Clock className="w-3 h-3 text-amber-400/70" />
                <span className="hidden sm:inline text-amber-400/70">Market Closed</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3 h-3 text-paper-faint" />
                <span className="hidden sm:inline">NSE Offline</span>
              </>
            )}
          </span>
          {/* Last sync time */}
          {nseLastUpdate ? (
            <span className="hidden md:inline">
              Updated {nseLastUpdate}
            </span>
          ) : fetchedAt && (
            <span className="hidden md:inline">
              Synced {format(new Date(fetchedAt), 'dd MMM yyyy')}
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
