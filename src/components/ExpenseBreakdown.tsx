import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import type { QuarterData } from '@/types/financial';
import { formatCurrency } from '@/lib/utils';
import { PieChart } from 'lucide-react';

interface ExpenseBreakdownProps {
  quarters: QuarterData[];
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

  const total = payload.reduce((sum, entry) => sum + entry.value, 0);

  return (
    <div className="bg-panel border border-line rounded-md p-3 shadow-lg min-w-[200px]">
      <p className="font-mono text-xs text-paper-dim mb-2 uppercase tracking-wider">{label}</p>
      {payload.map((entry, index) => (
        <div key={index} className="flex items-center justify-between gap-4 py-0.5">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: entry.color }} />
            <span className="text-xs text-paper-dim">{entry.name}</span>
          </div>
          <div className="text-right">
            <span className="text-xs font-mono font-medium text-paper">
              {formatCurrency(entry.value)}
            </span>
            <span className="text-[10px] text-paper-faint ml-2">
              ({((entry.value / total) * 100).toFixed(0)}%)
            </span>
          </div>
        </div>
      ))}
      <div className="border-t border-line mt-2 pt-2 flex justify-between">
        <span className="text-[10px] text-paper-faint font-mono">TOTAL</span>
        <span className="text-xs font-mono font-semibold text-brass">{formatCurrency(total)}</span>
      </div>
    </div>
  );
}

export function ExpenseBreakdown({ quarters }: ExpenseBreakdownProps) {
  const [activeMetrics, setActiveMetrics] = useState({
    Interest: true,
    Depreciation: true,
    'Other Income': true,
  });

  const data = quarters.map(q => ({
    period: q.period,
    Interest: q.interest,
    Depreciation: q.depreciation,
    'Other Income': q.other_income,
  }));

  const toggleMetric = (metric: string) => {
    setActiveMetrics(prev => ({ ...prev, [metric]: !prev[metric as keyof typeof prev] }));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.4 }}
      className="bg-panel border border-line rounded-md p-5 hover:border-line/80 transition-colors"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <PieChart className="w-4 h-4 text-maroon" />
          <h3 className="font-display text-sm font-semibold text-paper">
            Cost Structure Breakdown
          </h3>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-wider text-paper-faint border border-line px-2 py-1">
          ₹ Crore
        </span>
      </div>

      <div className="flex gap-2 mb-4">
        {Object.entries(activeMetrics).map(([key, active]) => (
          <button
            key={key}
            onClick={() => toggleMetric(key)}
            className={`font-mono text-[10px] uppercase tracking-wider px-2.5 py-1 rounded border transition-all ${
              active
                ? key === 'Interest'
                  ? 'bg-maroon/10 border-maroon/30 text-maroon'
                  : key === 'Depreciation'
                  ? 'bg-steel/10 border-steel/30 text-steel'
                  : 'bg-emerald/10 border-emerald/30 text-emerald'
                : 'bg-panel-alt border-line text-paper-faint'
            }`}
          >
            {key}
          </button>
        ))}
      </div>

      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
            <defs>
              <linearGradient id="interestGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#b3433f" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#b3433f" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="depreciationGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#5b8aa6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#5b8aa6" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="otherIncomeGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#5b9c6e" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#5b9c6e" stopOpacity={0.02} />
              </linearGradient>
            </defs>
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
              tickFormatter={(value: number) => `₹${(value / 1000).toFixed(0)}K`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'JetBrains Mono' }} iconType="square" iconSize={10} />
            {activeMetrics.Interest && (
              <Area
                type="monotone"
                dataKey="Interest"
                stroke="#b3433f"
                fill="url(#interestGrad)"
                strokeWidth={1.5}
              />
            )}
            {activeMetrics.Depreciation && (
              <Area
                type="monotone"
                dataKey="Depreciation"
                stroke="#5b8aa6"
                fill="url(#depreciationGrad)"
                strokeWidth={1.5}
              />
            )}
            {activeMetrics['Other Income'] && (
              <Area
                type="monotone"
                dataKey="Other Income"
                stroke="#5b9c6e"
                fill="url(#otherIncomeGrad)"
                strokeWidth={1.5}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}
