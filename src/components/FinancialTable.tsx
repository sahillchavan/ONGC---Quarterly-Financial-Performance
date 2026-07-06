import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowUpDown, ArrowUp, ArrowDown, Table2 } from 'lucide-react';
import type { QuarterData, SortField, SortDirection } from '@/types/financial';
import { formatCurrency, formatNumber, getChangeColor } from '@/lib/utils';

interface FinancialTableProps {
  quarters: QuarterData[];
}

export function FinancialTable({ quarters }: FinancialTableProps) {
  const [sortField, setSortField] = useState<SortField>('period');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const sortedQuarters = [...quarters].sort((a, b) => {
    const aVal = a[sortField];
    const bVal = b[sortField];
    const multiplier = sortDirection === 'asc' ? 1 : -1;

    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return aVal.localeCompare(bVal) * multiplier;
    }
    return ((aVal as number) - (bVal as number)) * multiplier;
  });

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 text-paper-faint" />;
    return sortDirection === 'asc'
      ? <ArrowUp className="w-3 h-3 text-brass" />
      : <ArrowDown className="w-3 h-3 text-brass" />;
  };

  const Th = ({ field, children, className = '' }: { field: SortField; children: React.ReactNode; className?: string }) => (
    <th
      className={`sticky top-0 bg-panel-alt py-3.5 px-4 text-left font-mono text-xs uppercase tracking-wider text-paper-dim border-b border-line cursor-pointer select-none hover:text-paper transition-colors ${className}`}
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1.5">
        {children}
        <SortIcon field={field} />
      </div>
    </th>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.6 }}
      className="bg-panel border border-line rounded-md p-5 hover:border-line/80 transition-colors"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Table2 className="w-4 h-4 text-steel" />
          <h3 className="font-display text-sm font-semibold text-paper">
            Quarterly Results — Detail
          </h3>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-wider text-paper-faint border border-line px-2 py-1">
          Consolidated, ₹ Crore
        </span>
      </div>

      <div className="overflow-auto max-h-[520px] scrollbar-thin">
        <table className="w-full border-collapse text-sm font-mono">
          <thead>
            <tr>
              <Th field="period">Quarter</Th>
              <Th field="sales" className="text-right">Sales</Th>
              <Th field="operating_profit" className="text-right">Op. Profit</Th>
              <Th field="opm_pct" className="text-right">OPM %</Th>
              <Th field="net_profit" className="text-right">Net Profit</Th>
              <Th field="eps" className="text-right">EPS (₹)</Th>
              <th className="sticky top-0 bg-panel-alt py-3.5 px-4 text-right font-mono text-xs uppercase tracking-wider text-paper-dim border-b border-line">
                QoQ Change
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedQuarters.map((q) => {
              const prevQuarter = quarters.find((_qq, qi) => qi === quarters.indexOf(q) - 1);
              const profitChange = prevQuarter && prevQuarter.net_profit
                ? ((q.net_profit - prevQuarter.net_profit) / Math.abs(prevQuarter.net_profit)) * 100
                : null;

              return (
                <tr
                  key={q.period}
                  className="border-b border-line-soft hover:bg-brass/5 transition-colors"
                >
                  <td className="py-3.5 px-4">
                    <span className="font-medium text-paper text-sm">{q.period}</span>
                  </td>
                  <td className="py-3.5 px-4 text-right font-medium text-paper">
                    {formatCurrency(q.sales)}
                  </td>
                  <td className="py-3.5 px-4 text-right font-medium text-paper">
                    {formatCurrency(q.operating_profit)}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      q.opm_pct >= 15
                        ? 'bg-emerald/10 text-emerald'
                        : q.opm_pct >= 12
                        ? 'bg-brass/10 text-brass'
                        : 'bg-maroon/10 text-maroon'
                    }`}>
                      {q.opm_pct != null ? `${formatNumber(q.opm_pct)}%` : '—'}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right font-medium text-paper">
                    {formatCurrency(q.net_profit)}
                  </td>
                  <td className="py-3.5 px-4 text-right font-medium text-paper">
                    {q.eps != null ? `₹${formatNumber(q.eps, 2)}` : '—'}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    {profitChange !== null ? (
                      <span className={`inline-flex items-center gap-1 text-xs font-medium ${getChangeColor(profitChange)}`}>
                        {profitChange >= 0 ? '▲' : '▼'}
                        {Math.abs(profitChange).toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-paper-faint">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
