import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from 'recharts';
import type { YoyComparison } from '@/types/financial';
import { getChangeColor, parsePeriodToDate, subtractTimeframe } from '@/lib/utils';
import { GitCompare } from 'lucide-react';

interface YoYComparisonProps {
  comparisons: YoyComparison[];
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
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload) return null;

  return (
    <div className="bg-panel border border-line rounded-md p-3 shadow-lg min-w-[180px]">
      <p className="font-mono text-xs text-paper-dim mb-2 uppercase tracking-wider">{label}</p>
      {payload.map((entry, index) => (
        <div key={index} className="flex items-center justify-between gap-4 py-0.5">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: entry.color }} />
            <span className="text-xs text-paper-dim">{entry.name}</span>
          </div>
          <span className={`text-xs font-mono font-medium ${entry.value >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {entry.value > 0 ? '+' : ''}{entry.value.toFixed(1)}%
          </span>
        </div>
      ))}
    </div>
  );
}

export function YoYComparison({ comparisons }: YoYComparisonProps) {
  if (!comparisons.length) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-panel border border-line rounded-md p-8 text-center"
      >
        <GitCompare className="w-8 h-8 text-paper-faint mx-auto mb-3" />
        <p className="text-paper-faint font-mono text-sm">
          Insufficient data for year-over-year comparison.
        </p>
        <p className="text-paper-faint/60 font-mono text-xs mt-1">
          Need at least 5 quarters of data to compare.
        </p>
      </motion.div>
    );
  }

  const [timeframeUnit, setTimeframeUnit] = useState<'Years' | 'Months' | 'Days'>('Years');
  const [timeframeValue, setTimeframeValue] = useState(3);

  const timeframeOptions = useMemo(() => {
    if (timeframeUnit === 'Years') return [1, 2, 3, 5];
    if (timeframeUnit === 'Months') return [3, 6, 12, 24];
    return [30, 60, 90];
  }, [timeframeUnit]);

  const filteredComparisons = useMemo(() => {
    const latestDate = parsePeriodToDate(comparisons[comparisons.length - 1]?.period) ?? new Date();
    const cutoffDate = subtractTimeframe(latestDate, timeframeValue, timeframeUnit);
    return comparisons.filter((comparison) => {
      const date = parsePeriodToDate(comparison.period);
      return date ? date >= cutoffDate : false;
    });
  }, [comparisons, timeframeUnit, timeframeValue]);

  const latest = filteredComparisons[filteredComparisons.length - 1] ?? comparisons[comparisons.length - 1];

  const data = filteredComparisons.map(c => ({
    period: c.period,
    'Revenue': c.salesChange,
    'Net Profit': c.profitChange,
    'EPS': c.epsChange,
    'OPM': c.opmChange,
  }));

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.5 }}
      className="bg-panel border border-line rounded-md p-5 hover:border-line/80 transition-colors"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
        <div className="flex items-center gap-3">
          <GitCompare className="w-4 h-4 text-brass" />
          <h3 className="font-display text-sm font-semibold text-paper">
            Year-over-Year Comparison
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="font-mono text-[10px] uppercase tracking-wider text-paper-faint">Range</label>
          <select
            value={timeframeValue}
            onChange={(event) => setTimeframeValue(Number(event.target.value))}
            className="rounded border border-line bg-panel px-2 py-1 text-[10px] font-mono text-paper"
          >
            {timeframeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <select
            value={timeframeUnit}
            onChange={(event) => setTimeframeUnit(event.target.value as 'Years' | 'Months' | 'Days')}
            className="rounded border border-line bg-panel px-2 py-1 text-[10px] font-mono text-paper"
          >
            <option value="Years">Years</option>
            <option value="Months">Months</option>
            <option value="Days">Days</option>
          </select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
        {[
          { label: 'Revenue YoY', value: latest.salesChange },
          { label: 'Profit YoY', value: latest.profitChange },
          { label: 'EPS YoY', value: latest.epsChange },
          { label: 'OPM Change', value: latest.opmChange },
        ].map((item) => (
          <div
            key={item.label}
            className={`p-3 rounded border ${
              item.value >= 0 ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-rose-500/20 bg-rose-500/5'
            }`}
          >
            <div className={`font-display text-lg font-semibold ${getChangeColor(item.value)}`}>
              {item.value > 0 ? '+' : ''}{item.value.toFixed(1)}%
            </div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-paper-faint mt-0.5">
              {item.label}
            </div>
          </div>
        ))}
      </div>

      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 10 }} barGap={1}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a313c" vertical={false} />
            <XAxis
              dataKey="period"
              tick={{ fill: '#5e6675', fontSize: 10, fontFamily: 'JetBrains Mono' }}
              axisLine={{ stroke: '#2a313c' }}
              tickLine={false}
              angle={-35}
              textAnchor="end"
              height={60}
            />
            <YAxis
              tick={{ fill: '#5e6675', fontSize: 10, fontFamily: 'JetBrains Mono' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(value: number) => `${value}%`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'JetBrains Mono' }} iconType="square" iconSize={10} />
            <ReferenceLine y={0} stroke="#3a4250" strokeWidth={1} />
            <Bar dataKey="Revenue" fill="#5b8aa6" radius={[2, 2, 0, 0]} name="Revenue" />
            <Bar dataKey="Net Profit" fill="#c89b3c" radius={[2, 2, 0, 0]} name="Net Profit" />
            <Bar dataKey="EPS" fill="#5b9c6e" radius={[2, 2, 0, 0]} name="EPS" />
            <Bar dataKey="OPM" fill="#b3433f" radius={[2, 2, 0, 0]} name="OPM" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}
