import { motion } from 'framer-motion';
import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  ComposedChart,
} from 'recharts';
import type { QuarterData } from '@/types/financial';

import { TrendingUp } from 'lucide-react';

interface EPSChartProps {
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
    <div className="bg-panel border border-line rounded-md p-3 shadow-lg min-w-[160px]">
      <p className="font-mono text-xs text-paper-dim mb-2 uppercase tracking-wider">{label}</p>
      {payload.map((entry, index) => (
        <div key={index} className="flex items-center justify-between gap-4 py-0.5">
          <div className="flex items-center gap-2">
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-xs text-paper-dim">{entry.name}</span>
          </div>
          <span className="text-xs font-mono font-medium text-paper">
            {entry.name.includes('EPS') ? `₹${entry.value.toFixed(2)}` : `${entry.value}%`}
          </span>
        </div>
      ))}
    </div>
  );
}

export function EPSChart({ quarters }: EPSChartProps) {
  const data = quarters.map(q => ({
    period: q.period,
    EPS: q.eps,
    OPM: q.opm_pct,
  }));

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className="bg-panel border border-line rounded-md p-5 hover:border-line/80 transition-colors"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <TrendingUp className="w-4 h-4 text-steel" />
          <h3 className="font-display text-base font-semibold text-paper">
            EPS & Operating Margin Trend
          </h3>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-wider text-paper-faint border border-line px-2 py-1">
          ₹ / %
        </span>
      </div>

      <div className="h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 10, right: 30, left: 10, bottom: 10 }}
          >
            <defs>
              <linearGradient id="opmGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#5b8aa6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#5b8aa6" stopOpacity={0.02} />
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
              yAxisId="left"
              tick={{ fill: '#9aa3b2', fontSize: 11, fontFamily: 'JetBrains Mono' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(value: number) => `₹${value}`}
              label={{
                value: 'EPS (₹)',
                angle: -90,
                position: 'insideLeft',
                style: { fill: '#5e6675', fontSize: 10, fontFamily: 'JetBrains Mono' },
                offset: 0,
              }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fill: '#9aa3b2', fontSize: 11, fontFamily: 'JetBrains Mono' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(value: number) => `${value}%`}
              label={{
                value: 'OPM %',
                angle: 90,
                position: 'insideRight',
                style: { fill: '#5e6675', fontSize: 10, fontFamily: 'JetBrains Mono' },
                offset: 10,
              }}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#2a313c', strokeDasharray: '4 4' }} />
            <Legend
              wrapperStyle={{ fontSize: '12px', fontFamily: 'JetBrains Mono' }}
              iconType="circle"
              iconSize={8}
            />
            <Area
              yAxisId="right"
              type="monotone"
              dataKey="OPM"
              fill="url(#opmGradient)"
              stroke="#5b8aa6"
              strokeWidth={2}
              name="OPM %"
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="EPS"
              stroke="#c89b3c"
              strokeWidth={2.5}
              dot={{ fill: '#c89b3c', r: 3, strokeWidth: 0 }}
              activeDot={{ r: 5, fill: '#c89b3c', stroke: '#171c24', strokeWidth: 2 }}
              name="EPS (₹)"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}
