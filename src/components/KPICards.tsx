import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, BarChart3, PieChart, Layers, Calculator } from 'lucide-react';
import type { QuarterData } from '@/types/financial';


interface KPICardsProps {
  quarters: QuarterData[];
}

export function KPICards({ quarters }: KPICardsProps) {
  const latest = quarters[quarters.length - 1];
  const previous = quarters[quarters.length - 2];

  if (!latest || !previous) return null;

  const metrics = [
    {
      label: 'Revenue Growth (QoQ)',
      value: ((latest.sales - previous.sales) / previous.sales) * 100,
      display: `${(((latest.sales - previous.sales) / previous.sales) * 100).toFixed(1)}%`,
      icon: <BarChart3 className="w-4 h-4" />,
      color: 'text-brass',
      bg: 'bg-brass/10',
      border: 'border-brass/20',
      prefix: '',
    },
    {
      label: 'Net Profit Margin',
      value: (latest.net_profit / latest.sales) * 100,
      display: `${((latest.net_profit / latest.sales) * 100).toFixed(1)}%`,
      icon: <PieChart className="w-4 h-4" />,
      color: 'text-steel',
      bg: 'bg-steel/10',
      border: 'border-steel/20',
      prefix: '',
    },
    {
      label: 'Operating Margin',
      value: latest.opm_pct,
      display: `${latest.opm_pct}%`,
      icon: <Layers className="w-4 h-4" />,
      color: 'text-emerald',
      bg: 'bg-emerald/10',
      border: 'border-emerald/20',
      prefix: '',
    },
    {
      label: 'Profit Growth (QoQ)',
      value: ((latest.net_profit - previous.net_profit) / Math.abs(previous.net_profit)) * 100,
      display: `${(((latest.net_profit - previous.net_profit) / Math.abs(previous.net_profit)) * 100).toFixed(1)}%`,
      icon: latest.net_profit >= previous.net_profit
        ? <TrendingUp className="w-4 h-4" />
        : <TrendingDown className="w-4 h-4" />,
      color: latest.net_profit >= previous.net_profit ? 'text-emerald' : 'text-maroon',
      bg: latest.net_profit >= previous.net_profit ? 'bg-emerald/10' : 'bg-maroon/10',
      border: latest.net_profit >= previous.net_profit ? 'border-emerald/20' : 'border-maroon/20',
      prefix: '',
    },
    {
      label: 'Tax Rate',
      value: latest.tax_pct,
      display: `${latest.tax_pct}%`,
      icon: <Calculator className="w-4 h-4" />,
      color: 'text-maroon',
      bg: 'bg-maroon/10',
      border: 'border-maroon/20',
      prefix: '',
    },
    {
      label: 'Revenue / Employee Cost Ratio',
      value: latest.sales / (latest.expenses || 1),
      display: (latest.sales / (latest.expenses || 1)).toFixed(2),
      icon: <BarChart3 className="w-4 h-4" />,
      color: 'text-brass',
      bg: 'bg-brass/10',
      border: 'border-brass/20',
      prefix: '',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
      {metrics.map((metric, index) => (
        <motion.div
          key={metric.label}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 + index * 0.05 }}
          className={`bg-panel border ${metric.border} rounded-md p-4 hover:bg-panel-alt/50 transition-all duration-200`}
        >
          <div className={`inline-flex items-center justify-center w-9 h-9 rounded-md ${metric.bg} ${metric.color} mb-3`}>
            {metric.icon}
          </div>
          <div className={`font-display text-2xl font-semibold ${metric.color}`}>
            {metric.prefix}{metric.display}
          </div>
          <div className="font-mono text-xs uppercase tracking-wider text-paper-dim mt-1.5">
            {metric.label}
          </div>
        </motion.div>
      ))}
    </div>
  );
}
