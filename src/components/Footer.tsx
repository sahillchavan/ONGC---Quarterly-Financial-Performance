import { Database, ExternalLink } from 'lucide-react';

interface FooterProps {
  symbol: string;
}

export function Footer({ symbol }: FooterProps) {
  const quoteUrl = `https://www.nseindia.com/get-quotes/equity?symbol=${encodeURIComponent(symbol)}`;
  const filingsUrl = `https://www.nseindia.com/companies-listing/corporate-filings-financial-results?symbol=${encodeURIComponent(symbol)}`;

  return (
    <footer className="border-t border-line mt-8">
      <div className="max-w-[1480px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <div className="flex items-center gap-2 text-paper-faint">
            <Database className="w-3.5 h-3.5" />
            <span className="font-mono text-[10px] sm:text-xs uppercase tracking-wider">
              {symbol} Quarterly Financial Performance
            </span>
          </div>
          <div className="flex items-center gap-4 font-mono text-[10px] sm:text-xs">
            <a
              href={quoteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-brass hover:text-brass/80 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              NSE India (Live Market Data)
            </a>
            <span className="text-paper-faint">•</span>
            <a
              href={filingsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-paper-dim hover:text-paper transition-colors"
            >
              NSE/BSE Corporate Filings (Quarterly)
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
