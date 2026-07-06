export interface QuarterData {
  period: string;
  sales: number;
  expenses: number;
  operating_profit: number;
  opm_pct: number;
  other_income: number;
  interest: number;
  depreciation: number;
  profit_before_tax: number;
  tax_pct: number;
  net_profit: number;
  eps: number;
}

export interface SnapshotData {
  [key: string]: string;
}

export interface FinancialData {
  source: string;
  source_url: string;
  fetched_at: string;
  currency: string;
  quarters: QuarterData[];
  snapshot: SnapshotData;
}

export type SortField = 'period' | 'sales' | 'operating_profit' | 'opm_pct' | 'net_profit' | 'eps';
export type SortDirection = 'asc' | 'desc';

export interface YoyComparison {
  period: string;
  prevPeriod: string;
  salesChange: number;
  profitChange: number;
  epsChange: number;
  opmChange: number;
}

// ── NSE Live Data Types ─────────────────────────────────────────────────────

export interface NSEQuoteData {
  symbol: string;
  companyName: string;
  industry: string;
  lastPrice: number;
  change: number;
  pChange: number;
  previousClose: number;
  open: number;
  close: number;
  high: number;
  low: number;
  weekHigh52: number;
  weekLow52: number;
  weekHighDate52: string;
  weekLowDate52: string;
  totalTradedVolume: number;
  totalTradedValue: number;
  upperBand: string;
  lowerBand: string;
  marketCap: number | null;
  faceValue: number;
  issuedSize: number | null;
  pe: string;
  sectorPE: string;
  sectorIndex: string;
  lastUpdateTime: string;
  listingDate: string;
  preOpenPrice: number | null;
  _source: string;
  _fetchedAt: string;
  _cached?: boolean;
  _stale?: boolean;
  _timeout?: boolean;
  _dataVersion?: number;
}

export interface NSEDataState {
  data: NSEQuoteData | null;
  loading: boolean;
  error: string | null;
  isLive: boolean;
  lastFetched: Date | null;
}
