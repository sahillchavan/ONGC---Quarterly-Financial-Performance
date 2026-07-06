import { motion } from 'framer-motion';
import { Header } from '@/components/Header';
import { WellLogStrip } from '@/components/WellLogStrip';
import { MarketStrip } from '@/components/MarketStrip';
import { KPICards } from '@/components/KPICards';
import { RevenueChart } from '@/components/RevenueChart';
import { EPSChart } from '@/components/EPSChart';
import { StockPriceChart } from '@/components/StockPriceChart';
import { ExpenseBreakdown } from '@/components/ExpenseBreakdown';
import { TaxAnalysis } from '@/components/TaxAnalysis';
import { YoYComparison } from '@/components/YoYComparison';
import { FinancialTable } from '@/components/FinancialTable';
import { Footer } from '@/components/Footer';
import { LoadingState } from '@/components/LoadingState';
import { ErrorState } from '@/components/ErrorState';
import { useFinancialData, useYoyComparison } from '@/hooks/useFinancialData';
import { useNSEQuote } from '@/hooks/useNSEData';
import { TrendingUp, BarChart3, PieChart, GitCompare, Table2 } from 'lucide-react';

export default function Home() {
  const { data, loading, error, isLive: isQuarterlyLive } = useFinancialData();
  const yoyData = useYoyComparison(data);
  const nse = useNSEQuote('ONGC');
  const symbol = nse.data?.symbol ?? 'ONGC';

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error || 'Failed to load data'} />;

  const { quarters, snapshot, fetched_at } = data;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header
        fetchedAt={fetched_at}
        isNSELive={nse.isLive}
        isQuarterlyLive={isQuarterlyLive}
        nseLastUpdate={nse.data?.lastUpdateTime}
        hasNSEData={!!nse.data}
      />
      <WellLogStrip />

      <main className="max-w-[1480px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Market Snapshot — Live from NSE */}
        <MarketStrip
          nseData={nse.data}
          isLive={nse.isLive}
          nseLoading={nse.loading}
          nseError={nse.error}
          onRefresh={nse.refresh}
          fallbackSnapshot={snapshot}
          priceChanged={nse.priceChanged}
          secondsSinceUpdate={nse.secondsSinceUpdate}
        />

        {/* KPI Cards */}
        <KPICards quarters={quarters} />

        {/* Revenue & Profit Charts Row */}
        <section className="revenue-section">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <RevenueChart quarters={quarters} />
            <EPSChart quarters={quarters} />
          </div>
        </section>

        {/* Stock Price & Expense Breakdown Row */}
        <section className="expense-section">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <StockPriceChart nseData={nse.data} isLive={nse.isLive} />
            <ExpenseBreakdown quarters={quarters} />
          </div>
        </section>

        {/* Tax Analysis & YoY Comparison Row */}
        <section className="yoy-section">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <TaxAnalysis quarters={quarters} />
            <YoYComparison comparisons={yoyData} />
          </div>
        </section>

        {/* Full-width Detail Table */}
        <FinancialTable quarters={quarters} />

        {/* Section Navigation - Quick Links */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="mt-8 pt-6 border-t border-line"
        >
          <div className="flex flex-wrap items-center justify-center gap-4">
            <span className="font-mono text-[10px] uppercase tracking-wider text-paper-faint">Jump to:</span>
            <a href="#" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="flex items-center gap-1.5 text-xs font-mono text-paper-dim hover:text-brass transition-colors">
              <TrendingUp className="w-3 h-3" /> Overview
            </a>
            <a href="#" onClick={(e) => { e.preventDefault(); document.querySelector('.revenue-section')?.scrollIntoView({ behavior: 'smooth' }); }} className="flex items-center gap-1.5 text-xs font-mono text-paper-dim hover:text-brass transition-colors">
              <BarChart3 className="w-3 h-3" /> Revenue
            </a>
            <a href="#" onClick={(e) => { e.preventDefault(); document.querySelector('.expense-section')?.scrollIntoView({ behavior: 'smooth' }); }} className="flex items-center gap-1.5 text-xs font-mono text-paper-dim hover:text-brass transition-colors">
              <PieChart className="w-3 h-3" /> Expenses
            </a>
            <a href="#" onClick={(e) => { e.preventDefault(); document.querySelector('.yoy-section')?.scrollIntoView({ behavior: 'smooth' }); }} className="flex items-center gap-1.5 text-xs font-mono text-paper-dim hover:text-brass transition-colors">
              <GitCompare className="w-3 h-3" /> YoY Compare
            </a>
            <a href="#" onClick={(e) => { e.preventDefault(); document.querySelector('table')?.scrollIntoView({ behavior: 'smooth' }); }} className="flex items-center gap-1.5 text-xs font-mono text-paper-dim hover:text-brass transition-colors">
              <Table2 className="w-3 h-3" /> Detail Table
            </a>
          </div>
        </motion.div>
      </main>

      <Footer symbol={symbol} />
    </div>
  );
}
