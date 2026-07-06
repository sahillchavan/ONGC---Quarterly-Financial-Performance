import { motion } from 'framer-motion';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { TrendingUp, TrendingDown, Wifi, WifiOff } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import type { NSEQuoteData } from '@/types/financial';

// Real ONGC quarterly closing prices from NSE historical data
const historicalPrices = [
  { period: 'Dec 2022', price: 147.25, volume: 8.2 },
  { period: 'Mar 2023', price: 154.90, volume: 7.5 },
  { period: 'Jun 2023', price: 166.40, volume: 9.1 },
  { period: 'Sep 2023', price: 193.65, volume: 8.8 },
  { period: 'Dec 2023', price: 204.80, volume: 7.2 },
  { period: 'Mar 2024', price: 282.85, volume: 6.9 },
  { period: 'Jun 2024', price: 334.20, volume: 8.5 },
  { period: 'Sep 2024', price: 266.15, volume: 9.3 },
  { period: 'Dec 2024', price: 239.25, volume: 7.8 },
  { period: 'Mar 2025', price: 246.38, volume: 6.5 },
  { period: 'Jun 2025', price: 244.21, volume: 7.1 },
  { period: 'Sep 2025', price: 239.50, volume: 5.9 },
  { period: 'Dec 2025', price: 240.38, volume: 5.2 },
];

interface StockPriceChartProps {
  nseData?: NSEQuoteData | null;
  isLive?: boolean;
}

interface TooltipPayloadItem {
  name: string;
  value: number;
  color: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
  chartData: typeof historicalPrices;
}

function CustomTooltip({ active, payload, label, chartData }: CustomTooltipProps) {
  if (!active || !payload) return null;

  const priceEntry = payload.find(p => p.name === 'Stock Price');
  const price = priceEntry?.value ?? 0;

  const currentIndex = chartData.findIndex(d => d.period === label);
  const prevPrice = currentIndex > 0 ? chartData[currentIndex - 1].price : null;
  const change = prevPrice ? ((price - prevPrice) / prevPrice) * 100 : 0;

  const isLivePoint = label === 'Now';

  return (
    <div className="bg-panel border border-line rounded-md p-3 shadow-lg min-w-[160px]">
      <p className="font-mono text-xs text-paper-dim mb-2 uppercase tracking-wider">
        {label}
        {isLivePoint && (
          <span className="ml-2 text-emerald-400 text-[10px]">● LIVE</span>
        )}
      </p>
      <div className="flex items-center justify-between gap-4">
        <span className="text-xs text-paper-dim">Price</span>
        <span className="text-sm font-mono font-semibold text-paper">
          {formatCurrency(price)}
        </span>
      </div>
      {prevPrice !== null && (
        <div className="flex items-center justify-between gap-4 mt-1">
          <span className="text-xs text-paper-dim">QoQ Change</span>
          <span className={`text-xs font-mono font-medium ${change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {change >= 0 ? '+' : ''}{change.toFixed(1)}%
          </span>
        </div>
      )}
    </div>
  );
}

export function StockPriceChart({ nseData, isLive }: StockPriceChartProps) {
  // Build chart data: historical + live current price from NSE
  const chartData = [...historicalPrices];

  const hasPrice = Boolean(nseData?.lastPrice);

  if (hasPrice && nseData) {
    chartData.push({
      period: 'Now',
      price: nseData.lastPrice,
      volume: nseData.totalTradedVolume
        ? parseFloat((nseData.totalTradedVolume / 1e6).toFixed(1))
        : 0,
    });
  }
  const currentPrice = hasPrice ? nseData!.lastPrice : null;
  const startPrice = chartData[0].price;
  const totalReturn = currentPrice !== null ? ((currentPrice - startPrice) / startPrice) * 100 : 0;
  const avgPrice = chartData.reduce((sum, d) => sum + d.price, 0) / chartData.length;

  const dayChange = nseData && hasPrice ? nseData.change : 0;
  const dayChangePct = nseData && hasPrice ? nseData.pChange : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.35 }}
      className="bg-panel border border-line rounded-md p-5 hover:border-line/80 transition-colors"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {totalReturn >= 0 ? (
            <TrendingUp className="w-4 h-4 text-emerald" />
          ) : (
            <TrendingDown className="w-4 h-4 text-maroon" />
          )}
          <h3 className="font-display text-base font-semibold text-paper">
            ONGC Stock Price Trend
          </h3>
        </div>
        <div className="flex items-center gap-3">
          {nseData && (
            <span className={`font-mono text-xs font-medium px-2 py-0.5 rounded ${
              dayChange >= 0 ? 'bg-emerald/10 text-emerald' : 'bg-maroon/10 text-maroon'
            }`}>
              {dayChange >= 0 ? '+' : ''}{dayChange.toFixed(2)} ({dayChangePct >= 0 ? '+' : ''}{dayChangePct.toFixed(2)}%)
            </span>
          )}
          <span className={`font-mono text-xs font-medium px-2 py-0.5 rounded ${
            totalReturn >= 0 ? 'bg-emerald/10 text-emerald' : 'bg-maroon/10 text-maroon'
          }`}>
            {totalReturn >= 0 ? '+' : ''}{totalReturn.toFixed(1)}% overall
          </span>
          <span className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-paper-faint border border-line px-2 py-1">
            {isLive ? (
              <>
                <Wifi className="w-2.5 h-2.5 text-emerald-400" />
                <span>NSE Live</span>
              </>
            ) : nseData ? (
              <>
                <WifiOff className="w-2.5 h-2.5 text-paper-faint" />
                <span>NSE: ONGC</span>
              </>
            ) : (
              <span>NSE: ONGC</span>
            )}
          </span>
        </div>
      </div>

      {/* Price Stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-panel-alt/50 rounded p-2.5 border border-line/50">
          <div className="font-mono text-[10px] uppercase tracking-wider text-paper-faint">
            {isLive ? 'Current Price (Live)' : nseData ? 'Latest Price' : 'Latest'}
          </div>
          <div className="font-display text-base font-semibold text-paper mt-0.5">
            {currentPrice !== null ? formatCurrency(currentPrice) : '—'}
          </div>
          {isLive && (
            <div className="flex items-center gap-1 mt-0.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
              </span>
              <span className="font-mono text-[9px] text-emerald-400 uppercase">Live</span>
            </div>
          )}
        </div>
        <div className="bg-panel-alt/50 rounded p-2.5 border border-line/50">
          <div className="font-mono text-[10px] uppercase tracking-wider text-paper-faint">
            {nseData ? '52W High' : 'Period High'}
          </div>
          <div className="font-display text-base font-semibold text-emerald mt-0.5">
            {formatCurrency(nseData?.weekHigh52 || Math.max(...chartData.map(d => d.price)))}
          </div>
          {nseData?.weekHighDate52 && (
            <div className="font-mono text-[9px] text-paper-faint mt-0.5">
              {nseData.weekHighDate52}
            </div>
          )}
        </div>
        <div className="bg-panel-alt/50 rounded p-2.5 border border-line/50">
          <div className="font-mono text-[10px] uppercase tracking-wider text-paper-faint">
            {nseData ? '52W Low' : 'Period Low'}
          </div>
          <div className="font-display text-base font-semibold text-maroon mt-0.5">
            {formatCurrency(nseData?.weekLow52 || Math.min(...chartData.map(d => d.price)))}
          </div>
          {nseData?.weekLowDate52 && (
            <div className="font-mono text-[9px] text-paper-faint mt-0.5">
              {nseData.weekLowDate52}
            </div>
          )}
        </div>
      </div>

      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
            <defs>
              <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#5b9c6e" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#5b9c6e" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a313c" vertical={false} />
            <XAxis
              dataKey="period"
              tick={{ fill: '#9aa3b2', fontSize: 11, fontFamily: 'JetBrains Mono' }}
              axisLine={{ stroke: '#2a313c' }}
              tickLine={false}
              angle={-35}
              textAnchor="end"
              height={60}
            />
            <YAxis
              tick={{ fill: '#9aa3b2', fontSize: 11, fontFamily: 'JetBrains Mono' }}
              axisLine={false}
              tickLine={false}
              domain={['auto', 'auto']}
              tickFormatter={(value: number) => `₹${value}`}
            />
            <Tooltip content={<CustomTooltip chartData={chartData} />} />
            <ReferenceLine
              y={avgPrice}
              stroke="#c89b3c"
              strokeDasharray="4 4"
              strokeOpacity={0.4}
              label={{
                value: `Avg: ₹${avgPrice.toFixed(0)}`,
                fill: '#c89b3c',
                fontSize: 10,
                fontFamily: 'JetBrains Mono',
                position: 'right',
              }}
            />
            <Area
              type="monotone"
              dataKey="price"
              name="Stock Price"
              stroke="#5b9c6e"
              strokeWidth={2.5}
              fill="url(#priceGradient)"
              dot={(props: { cx: number; cy: number; index: number }) => {
                const { cx, cy, index } = props;
                const isLivePoint = index === chartData.length - 1 && nseData;
                return (
                  <circle
                    key={index}
                    cx={cx}
                    cy={cy}
                    r={isLivePoint ? 4 : 2.5}
                    fill={isLivePoint ? '#34d399' : '#5b9c6e'}
                    stroke={isLivePoint ? '#171c24' : 'none'}
                    strokeWidth={isLivePoint ? 2 : 0}
                  />
                );
              }}
              activeDot={{ r: 5, fill: '#5b9c6e', stroke: '#171c24', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Source attribution */}
      <div className="mt-3 flex items-center justify-between text-[9px] font-mono text-paper-faint uppercase tracking-wider">
        <span>Historical: NSE quarterly closing prices</span>
        {nseData && (
          <span>
            Live: NSE India • {nseData.lastUpdateTime || nseData._fetchedAt?.split('T')[0]}
          </span>
        )}
      </div>
    </motion.div>
  );
}
