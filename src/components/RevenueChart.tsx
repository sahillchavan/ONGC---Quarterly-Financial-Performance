import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import type { QuarterData } from '@/types/financial';
import { formatNumber, formatCurrency } from '@/lib/utils';
import { BarChart3 } from 'lucide-react';

interface RevenueChartProps {
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

  return (
    <div className="bg-panel border border-line rounded-md p-3 shadow-lg min-w-[180px]">
      <p className="font-mono text-xs text-paper-dim mb-2 uppercase tracking-wider">{label}</p>
      {payload.map((entry, index) => (
        <div key={index} className="flex items-center justify-between gap-4 py-0.5">
          <div className="flex items-center gap-2">
            <div
              className="w-2.5 h-2.5 rounded-sm"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-xs text-paper-dim">{entry.name}</span>
          </div>
          <span className="text-xs font-mono font-medium text-paper">
            {formatCurrency(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function RevenueChart({ quarters }: RevenueChartProps) {
  const [showExpenses, setShowExpenses] = useState(false);

  const data = quarters.map(q => ({
    period: q.period,
    Sales: q.sales,
    'Net Profit': q.net_profit,
    Expenses: q.expenses,
  }));

  const avgProfit = quarters.reduce((sum, q) => sum + q.net_profit, 0) / quarters.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="bg-panel border border-line rounded-md p-5 hover:border-line/80 transition-colors"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-4 h-4 text-brass" />
          <h3 className="font-display text-base font-semibold text-paper">
            Quarterly Revenue & Net Profit
          </h3>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowExpenses(!showExpenses)}
            className={`font-mono text-[10px] uppercase tracking-wider px-2.5 py-1 rounded border transition-all ${
              showExpenses
                ? 'bg-maroon/10 border-maroon/30 text-maroon'
                : 'bg-panel-alt border-line text-paper-faint hover:text-paper-dim'
            }`}
          >
            {showExpenses ? 'Hide Expenses' : 'Show Expenses'}
          </button>
          <span className="font-mono text-[10px] uppercase tracking-wider text-paper-faint border border-line px-2 py-1">
            ₹ Crore
          </span>
        </div>
      </div>

      <div className="h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 10, right: 10, left: 10, bottom: 10 }}
            barGap={2}
          >
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
              tickFormatter={(value: number) => `₹${(value / 1000).toFixed(0)}K`}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(200,155,60,0.04)' }} />
            <Legend
              wrapperStyle={{ fontSize: '12px', fontFamily: 'JetBrains Mono' }}
              iconType="square"
              iconSize={10}
            />
            <ReferenceLine
              y={avgProfit}
              stroke="#5b9c6e"
              strokeDasharray="4 4"
              strokeOpacity={0.5}
              label={{
                value: `Avg Profit: ₹${formatNumber(avgProfit)}`,
                fill: '#5b9c6e',
                fontSize: 10,
                fontFamily: 'JetBrains Mono',
                position: 'right',
              }}
            />
            <Bar
              dataKey="Sales"
              fill="rgba(91,138,166,0.2)"
              stroke="#5b8aa6"
              strokeWidth={1}
              radius={[2, 2, 0, 0]}
              name="Sales"
            />
            {showExpenses && (
              <Bar
                dataKey="Expenses"
                fill="rgba(179,67,63,0.15)"
                stroke="#b3433f"
                strokeWidth={1}
                radius={[2, 2, 0, 0]}
                name="Expenses"
              />
            )}
            <Bar
              dataKey="Net Profit"
              fill="rgba(200,155,60,0.6)"
              stroke="#c89b3c"
              strokeWidth={1}
              radius={[2, 2, 0, 0]}
              name="Net Profit"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}
