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
  ReferenceLine,
  Legend,
} from 'recharts';
import type { QuarterData } from '@/types/financial';
import { formatCurrency, parsePeriodToDate, subtractTimeframe } from '@/lib/utils';
import { Calculator } from 'lucide-react';

interface TaxAnalysisProps {
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
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: entry.color }} />
            <span className="text-xs text-paper-dim">{entry.name}</span>
          </div>
          <span className="text-xs font-mono font-medium text-paper">
            {entry.name.includes('Tax') ? `${entry.value}%` : formatCurrency(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function TaxAnalysis({ quarters }: TaxAnalysisProps) {
  const [timeframeUnit, setTimeframeUnit] = useState<'Years' | 'Months' | 'Days'>('Years');
  const [timeframeValue, setTimeframeValue] = useState(3);
  const [visibleSeries, setVisibleSeries] = useState({
    PBT: true,
    'Net Profit': true,
    'Tax Rate': true,
  });

  const timeframeOptions = useMemo(() => {
    if (timeframeUnit === 'Years') return [1, 2, 3, 5];
    if (timeframeUnit === 'Months') return [3, 6, 12, 24];
    return [30, 60, 90];
  }, [timeframeUnit]);

  const filteredQuarters = useMemo(() => {
    const latestDate = parsePeriodToDate(quarters[quarters.length - 1]?.period) ?? new Date();
    const cutoffDate = subtractTimeframe(latestDate, timeframeValue, timeframeUnit);
    return quarters.filter((quarter) => {
      const date = parsePeriodToDate(quarter.period);
      return date ? date >= cutoffDate : false;
    });
  }, [quarters, timeframeUnit, timeframeValue]);

  const data = filteredQuarters.map(q => ({
    period: q.period,
    'PBT': q.profit_before_tax,
    'Net Profit': q.net_profit,
    'Tax Rate': q.tax_pct,
  }));

  const avgTaxRate = filteredQuarters.length
    ? filteredQuarters.reduce((sum, q) => sum + q.tax_pct, 0) / filteredQuarters.length
    : 0;

  const toggleSeries = (series: keyof typeof visibleSeries) => {
    setVisibleSeries((prev) => ({
      ...prev,
      [series]: !prev[series],
    }));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.5 }}
      className="bg-panel border border-line rounded-md p-5 hover:border-line/80 transition-colors"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
        <div className="flex items-center gap-3">
          <Calculator className="w-4 h-4 text-emerald" />
          <h3 className="font-display text-sm font-semibold text-paper">
            Profit Before Tax & Tax Rate
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="font-mono text-[10px] uppercase tracking-wider text-paper-faint">Period</label>
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

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {Object.entries(visibleSeries).map(([series, active]) => (
          <button
            key={series}
            type="button"
            onClick={() => toggleSeries(series as keyof typeof visibleSeries)}
            className={`font-mono text-[10px] uppercase tracking-wider px-2.5 py-1 rounded border transition-all ${
              active ? 'bg-brass/10 border-brass text-brass' : 'bg-panel-alt border-line text-paper-faint'
            }`}
          >
            {series}
          </button>
        ))}
      </div>

      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 30, left: 10, bottom: 10 }} barGap={2}>
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
              yAxisId="left"
              tick={{ fill: '#5e6675', fontSize: 10, fontFamily: 'JetBrains Mono' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(value: number) => `₹${(value / 1000).toFixed(0)}K`}
              label={{
                value: '₹ Crore',
                angle: -90,
                position: 'insideLeft',
                style: { fill: '#5e6675', fontSize: 10, fontFamily: 'JetBrains Mono' },
                offset: 0,
              }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fill: '#5e6675', fontSize: 10, fontFamily: 'JetBrains Mono' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(value: number) => `${value}%`}
              domain={[0, 40]}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'JetBrains Mono' }} iconType="square" iconSize={10} />
            <ReferenceLine
              yAxisId="right"
              y={avgTaxRate}
              stroke="#c89b3c"
              strokeDasharray="4 4"
              strokeOpacity={0.5}
              label={{
                value: `Avg Tax: ${avgTaxRate.toFixed(1)}%`,
                fill: '#c89b3c',
                fontSize: 10,
                fontFamily: 'JetBrains Mono',
                position: 'right',
              }}
            />
            {visibleSeries.PBT && (
              <Bar
                yAxisId="left"
                dataKey="PBT"
                fill="rgba(91,138,166,0.2)"
                stroke="#5b8aa6"
                strokeWidth={1}
                radius={[2, 2, 0, 0]}
                name="PBT"
              />
            )}
            {visibleSeries['Net Profit'] && (
              <Bar
                yAxisId="left"
                dataKey="Net Profit"
                fill="rgba(200,155,60,0.5)"
                stroke="#c89b3c"
                strokeWidth={1}
                radius={[2, 2, 0, 0]}
                name="Net Profit"
              />
            )}
            {visibleSeries['Tax Rate'] && (
              <Bar
                yAxisId="right"
                dataKey="Tax Rate"
                fill="rgba(179,67,63,0.3)"
                stroke="#b3433f"
                strokeWidth={1}
                radius={[2, 2, 0, 0]}
                name="Tax Rate"
              />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}
