import https from 'https';
import zlib from 'zlib';
import { readFileSync } from 'fs';
import { join } from 'path';

// ── Constants ───────────────────────────────────────────────────────────────
const FETCH_TIMEOUT = 15000;

// ── Utility: Timeout wrapper ────────────────────────────────────────────────
function withTimeout(promise, ms = FETCH_TIMEOUT) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms)
    ),
  ]);
}

// ── Utility: Parse numeric values ───────────────────────────────────────────
function parseNum(val) {
  if (val === null || val === undefined || val === '-' || val === '') return 0;
  if (typeof val === 'number') return val;
  const cleaned = String(val).replace(/,/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

// ── Convert lakhs to crores ─────────────────────────────────────────────────
function lakhsToCrores(val) {
  return Math.round(parseNum(val) / 100);
}

// ── HTTP fetch with decompression support ───────────────────────────────────
function fetchUrl(url, options = {}) {
  const { timeoutMs = FETCH_TIMEOUT, headers = {}, expectJson = true } = options;

  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': expectJson
          ? 'application/json, text/plain, */*'
          : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        ...headers,
      },
      timeout: timeoutMs,
    }, (res) => {
      const statusCode = res.statusCode || 0;
      const encoding = (res.headers['content-encoding'] || '').toLowerCase();
      let stream = res;

      if (encoding === 'gzip') {
        stream = res.pipe(zlib.createGunzip());
      } else if (encoding === 'br') {
        stream = res.pipe(zlib.createBrotliDecompress());
      } else if (encoding === 'deflate') {
        stream = res.pipe(zlib.createInflate());
      }

      let data = '';
      stream.setEncoding('utf8');
      stream.on('data', chunk => { data += chunk; });
      stream.on('end', () => {
        if (statusCode < 200 || statusCode >= 300) {
          return reject(new Error(`HTTP ${statusCode} from ${url}`));
        }
        resolve({ statusCode, body: data, headers: res.headers });
      });
      stream.on('error', reject);
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timed out after ${timeoutMs}ms`));
    });
  });
}

// ── Quarter period derivation ───────────────────────────────────────────────
/**
 * Derive the quarter-end period label from the quarter-start date.
 * NSE returns re_from_dt like "01-OCT-2024" → quarter ends "Dec 2024"
 * Also handles re_to_dt like "31-DEC-2024"
 */
function toQuarterPeriod(fromDt, toDt) {
  const dateStr = toDt || fromDt;
  if (!dateStr) return null;

  const monthMap = {
    JAN: 'Jan', FEB: 'Feb', MAR: 'Mar', APR: 'Apr', MAY: 'May', JUN: 'Jun',
    JUL: 'Jul', AUG: 'Aug', SEP: 'Sep', OCT: 'Oct', NOV: 'Nov', DEC: 'Dec'
  };

  const quarterEndMap = {
    JAN: 'Mar', FEB: 'Mar', MAR: 'Mar',
    APR: 'Jun', MAY: 'Jun', JUN: 'Jun',
    JUL: 'Sep', AUG: 'Sep', SEP: 'Sep',
    OCT: 'Dec', NOV: 'Dec', DEC: 'Dec'
  };

  const match = dateStr.match(/\d{1,2}-(\w{3})-(\d{4})/);
  if (!match) return null;

  const month = match[1].toUpperCase();
  let year = parseInt(match[2], 10);

  if (toDt) {
    return `${monthMap[month] || month} ${year}`;
  }

  const endMonth = quarterEndMap[month];
  if (!endMonth) return null;

  return `${endMonth} ${year}`;
}

// ── Map NSE result row to QuarterData ───────────────────────────────────────
/**
 * Map a single NSE result row to our QuarterData format.
 * NSE field names: re_from_dt, re_net_sale, re_oth_tot_exp, re_oth_inc_new,
 *   re_int_new, re_depr_und_exp, re_pro_loss_bef_tax, re_curr_tax,
 *   re_deff_tax, re_net_profit, re_basic_eps_for_cont_dic_opr, etc.
 * Values are in LAKHS — divide by 100 for Crores.
 */
function mapNseResultToQuarter(row) {
  const period = toQuarterPeriod(row.re_from_dt, row.re_to_dt);
  if (!period) return null;

  const sales = lakhsToCrores(row.re_net_sale || row.re_income || 0);
  const expenses = lakhsToCrores(row.re_oth_tot_exp || row.re_tot_exp || 0);
  const operating_profit = sales - expenses;
  const opm_pct = sales > 0 ? Math.round((operating_profit / sales) * 100) : 0;
  const other_income = lakhsToCrores(row.re_oth_inc_new || row.re_oth_inc || 0);
  const interest = lakhsToCrores(row.re_int_new || row.re_int_expd || 0);
  const depreciation = lakhsToCrores(row.re_depr_und_exp || 0);
  const profit_before_tax = lakhsToCrores(row.re_pro_loss_bef_tax || 0);

  const currentTax = parseNum(row.re_curr_tax || 0);
  const deferredTax = parseNum(row.re_deff_tax || 0);
  const totalTaxLakhs = currentTax + deferredTax;
  const pbtLakhs = parseNum(row.re_pro_loss_bef_tax || 0);
  const tax_pct = pbtLakhs > 0 ? Math.round((totalTaxLakhs / pbtLakhs) * 100) : 0;

  const net_profit = lakhsToCrores(row.re_net_profit || row.re_con_pro_loss || 0);
  const eps = parseNum(row.re_basic_eps_for_cont_dic_opr || row.re_basic_eps || row.re_diluted_eps || 0);

  return {
    period, sales, expenses, operating_profit, opm_pct,
    other_income, interest, depreciation, profit_before_tax,
    tax_pct, net_profit, eps,
  };
}

// ── Sort helper ─────────────────────────────────────────────────────────────
const MONTH_ORDER = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
function sortQuarters(arr) {
  return [...arr].sort((a, b) => {
    const [am, ay] = a.period.split(' ');
    const [bm, by] = b.period.split(' ');
    return (parseInt(ay) - parseInt(by)) || (MONTH_ORDER[am] - MONTH_ORDER[bm]);
  });
}

// ── Merge live NSE quarters on top of historical baseline ───────────────────
function mergeQuarters(historical, live) {
  const map = new Map();
  for (const q of historical) map.set(q.period, q);
  for (const q of live) map.set(q.period, q);
  return sortQuarters([...map.values()]);
}

// ── Load historical data from bundled static JSON ───────────────────────────
// On Vercel, public/ files are served from dist/ at build time but NOT available
// via the filesystem in serverless functions. We read from the source location
// which IS bundled by Vercel into the function's deployment.
let historicalData = null;

function loadHistoricalData() {
  if (historicalData) return historicalData;

  try {
    // In Vercel serverless, the file structure relative to the function is preserved.
    // public/data/quarterly.json is at the project root level.
    const possiblePaths = [
      join(process.cwd(), 'public', 'data', 'quarterly.json'),
      join(process.cwd(), 'dist', 'data', 'quarterly.json'),
    ];

    for (const p of possiblePaths) {
      try {
        historicalData = JSON.parse(readFileSync(p, 'utf-8'));
        console.log(`[Quarterly] ✅ Loaded ${historicalData.quarters.length} historical quarters from ${p}`);
        return historicalData;
      } catch {
        // Try next path
      }
    }

    throw new Error('quarterly.json not found at any expected path');
  } catch (e) {
    console.error('[Quarterly] ❌ Failed to load historical data:', e.message);
    historicalData = { quarters: [], snapshot: {} };
    return historicalData;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SOURCE 1: stock-nse-india library
// ═══════════════════════════════════════════════════════════════════════════
async function fetchFromStockNseIndia(symbol) {
  console.log('[Quarterly] Trying source: stock-nse-india library...');

  const { NseIndia } = await import('stock-nse-india');
  const nse = new NseIndia();

  const rawData = await withTimeout(
    nse.getDataByEndpoint(`/api/results-comparision?symbol=${encodeURIComponent(symbol.toUpperCase())}`),
    FETCH_TIMEOUT
  );

  const rows = rawData?.resCmpData || rawData?.data || (Array.isArray(rawData) ? rawData : []);
  if (!rows.length) throw new Error('stock-nse-india returned empty results');

  console.log(`[Quarterly] ✓ stock-nse-india returned ${rows.length} rows`);
  return rows;
}

// ═══════════════════════════════════════════════════════════════════════════
// SOURCE 2: Direct NSE API with cookie handling
// ═══════════════════════════════════════════════════════════════════════════
async function fetchFromNseDirectApi(symbol) {
  console.log('[Quarterly] Trying source: NSE Direct API...');

  // Step 1: Get cookies from NSE homepage
  let cookieHeader = '';
  try {
    const homePage = await withTimeout(
      fetchUrl('https://www.nseindia.com/', { expectJson: false, timeoutMs: 8000 }),
      10000
    );
    const cookies = homePage.headers?.['set-cookie'];
    if (cookies) {
      cookieHeader = Array.isArray(cookies)
        ? cookies.map(c => c.split(';')[0]).join('; ')
        : cookies.split(';')[0];
    }
  } catch (e) {
    console.warn('[Quarterly] Cookie fetch failed:', e.message);
  }

  // Step 2: Fetch quarterly results
  const url = `https://www.nseindia.com/api/results-comparision?symbol=${encodeURIComponent(symbol.toUpperCase())}`;
  const response = await withTimeout(
    fetchUrl(url, {
      expectJson: true,
      timeoutMs: 12000,
      headers: {
        'Referer': 'https://www.nseindia.com/companies-listing/corporate-filings-financial-results',
        ...(cookieHeader ? { 'Cookie': cookieHeader } : {}),
      },
    }),
    15000
  );

  let data;
  try {
    data = JSON.parse(response.body);
  } catch (e) {
    throw new Error('NSE Direct API returned invalid JSON');
  }

  const rows = data?.resCmpData || data?.data || (Array.isArray(data) ? data : []);
  if (!rows.length) throw new Error('NSE Direct API returned empty results');

  console.log(`[Quarterly] ✓ NSE Direct API returned ${rows.length} rows`);
  return rows;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════
export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  let symbol = req.query.symbol;
  if (Array.isArray(symbol)) symbol = symbol[0];
  if (!symbol) return res.status(400).json({ error: 'Symbol parameter is required' });
  if (symbol.toUpperCase() !== 'ONGC') return res.status(403).json({ error: 'Only ONGC data is available' });

  symbol = symbol.toUpperCase();

  // Load historical baseline
  const historical = loadHistoricalData();

  // Try to fetch live data from NSE
  const sources = [
    { name: 'stock-nse-india', fn: () => fetchFromStockNseIndia(symbol) },
    { name: 'nse-direct-api', fn: () => fetchFromNseDirectApi(symbol) },
  ];

  const errors = [];

  for (const source of sources) {
    try {
      console.log(`[Quarterly] ━━━ Attempting ${source.name}...`);
      const rows = await source.fn();

      // Map live NSE rows
      const liveQuarters = rows
        .map(mapNseResultToQuarter)
        .filter(q => q !== null);

      if (liveQuarters.length === 0) {
        throw new Error(`${source.name} returned rows but none could be mapped`);
      }

      // Merge: historical baseline + live NSE on top
      const merged = mergeQuarters(historical.quarters, liveQuarters);

      const result = {
        source: 'NSE India — Corporate Filings + Historical BSE/NSE Filings',
        source_url: `https://www.nseindia.com/companies-listing/corporate-filings-financial-results-comparision?symbol=${symbol}`,
        fetched_at: new Date().toISOString(),
        currency: 'INR Crores (financials), INR (price)',
        quarters: merged,
        snapshot: historical.snapshot || {},
        _live: true,
        _source: source.name,
        _liveQuarters: liveQuarters.length,
        _totalQuarters: merged.length,
        _attemptedSources: sources.map(s => s.name).slice(0, sources.indexOf(source) + 1),
        _failedSources: errors.map(e => e.source),
      };

      console.log(`[Quarterly] ✅ Success from ${source.name}: ${merged.length} total quarters (${merged[0].period} → ${merged[merged.length - 1].period})`);
      return res.status(200).json(result);
    } catch (err) {
      console.warn(`[Quarterly] ✗ ${source.name} failed: ${err.message}`);
      errors.push({ source: source.name, error: err.message });
    }
  }

  // All live sources failed — return historical-only data
  if (historical.quarters.length > 0) {
    console.log(`[Quarterly] ⚠️ All live sources failed. Serving historical-only data (${historical.quarters.length} quarters)`);
    return res.status(200).json({
      ...historical,
      fetched_at: new Date().toISOString(),
      _live: false,
      _fallback: true,
      _failedSources: errors,
    });
  }

  // No data at all
  console.error('[Quarterly] ❌ All sources failed and no historical data:', errors);
  return res.status(502).json({
    error: 'All quarterly data sources failed',
    message: 'Unable to fetch quarterly financial data from any source. Please try again shortly.',
    _failedSources: errors,
    _fetchedAt: new Date().toISOString(),
  });
}
