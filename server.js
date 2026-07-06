import express from 'express';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';
import { NseIndia } from 'stock-nse-india';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// ── NSE Client (via stock-nse-india) ────────────────────────────────────────
// This library handles all the session/cookie management and Akamai bypass.
// We wrap it in a managed instance that auto-recreates on repeated failures
// (Akamai 403s, stale sessions, cookie expiry).
let nse = new NseIndia();
let nseConsecutiveFailures = 0;
const NSE_MAX_FAILURES_BEFORE_RESET = 3;

function isMarketHours() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    hour12: false,
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
  });

  const parts = formatter.formatToParts(now);
  const weekday = parts.find(p => p.type === 'weekday')?.value;
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);

  if (weekday === 'Sat' || weekday === 'Sun') return false;

  const istTimeMinutes = hour * 60 + minute;
  const marketOpen = 9 * 60 + 15;
  const marketClose = 15 * 60 + 30;

  return istTimeMinutes >= marketOpen && istTimeMinutes <= marketClose;
}

/**
 * Recreate the NseIndia client to force a fresh session/cookie handshake.
 * Called automatically after NSE_MAX_FAILURES_BEFORE_RESET consecutive failures.
 */
function resetNseClient(reason) {
  console.log(`[NSE] 🔄 Recreating NSE client (reason: ${reason})`);
  nse = new NseIndia();
  nseConsecutiveFailures = 0;
}

/** Track a successful NSE call — resets failure counter */
function nseCallSucceeded() {
  nseConsecutiveFailures = 0;
}

/** Track a failed NSE call — triggers client reset after threshold */
function nseCallFailed(err) {
  nseConsecutiveFailures++;
  console.warn(`[NSE] ⚠️  Failure #${nseConsecutiveFailures}: ${err.message}`);
  if (nseConsecutiveFailures >= NSE_MAX_FAILURES_BEFORE_RESET) {
    resetNseClient(`${nseConsecutiveFailures} consecutive failures`);
  }
}

/**
 * Retry wrapper with exponential backoff.
 * Retries up to `maxRetries` times with delays: 1s, 2s, 4s.
 * On final failure, triggers nseCallFailed() for client reset tracking.
 */
/**
 * Timeout wrapper — races a promise against a timer.
 * Prevents NSE library hangs from blocking the entire Express route.
 */
function withTimeout(promise, ms = 8000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`NSE call timed out after ${ms}ms`)), ms)
    ),
  ]);
}

async function withRetry(fn, label, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await withTimeout(fn(), 8000);
      nseCallSucceeded();
      return result;
    } catch (err) {
      const isLast = attempt === maxRetries;
      const delay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
      // Treat timeouts the same as connection failures for client reset tracking
      const isTimeout = err.message?.includes('timed out');
      console.warn(`[NSE] ⚠️  ${label} attempt ${attempt}/${maxRetries} failed${isTimeout ? ' (TIMEOUT)' : ''}: ${err.message}${isLast ? '' : ` — retrying in ${delay}ms...`}`);
      if (isLast) {
        nseCallFailed(err);
        throw err;
      }
      // On timeout, reset client immediately instead of waiting for threshold
      if (isTimeout && attempt >= 2) {
        resetNseClient('timeout on retry');
      }
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

// ── Response Cache ──────────────────────────────────────────────────────────
const cache = new Map();
const CACHE_TTL = 3 * 1000; // 3 seconds for quote freshness during active market hours
let dataVersion = 0;         // Incremented on each fresh NSE fetch
let nseCookieHeader = '';

// ── Persistent last-known values (survive cache expiry & market close) ───────
// NSE stops returning pe/marketCap outside market hours; we keep the last
// seen values so the UI never shows "—" just because the market is closed.
const lastKnown = new Map(); // symbol → { pe, sectorPE, marketCap }

function getCached(key) {
  const entry = cache.get(key);
  if (entry && (Date.now() - entry.timestamp) < CACHE_TTL) {
    return entry.data;
  }
  cache.delete(key);
  return null;
}

function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

function fetchJson(url, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.nseindia.com/get-quote/equity/ONGC/Oil-&-Natural-Gas-Corporation-Limited',
        ...(nseCookieHeader ? { Cookie: nseCookieHeader } : {}),
      },
      timeout: timeoutMs,
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`NSE JSON fetch failed with status ${res.statusCode}`));
          }
          resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('timeout', () => {
      req.destroy(new Error(`NSE JSON fetch timed out after ${timeoutMs}ms`));
    });
    req.on('error', reject);
  });
}

async function refreshNseCookies(timeoutMs = 12000) {
  const page = await fetchNsePageHtml('https://www.nseindia.com/', timeoutMs);
  const cookies = page.headers?.['set-cookie'];
  if (!cookies) {
    throw new Error('NSE cookie refresh failed: no Set-Cookie header');
  }
  nseCookieHeader = Array.isArray(cookies)
    ? cookies.map(c => c.split(';')[0]).join('; ')
    : cookies.split(';')[0];
  console.log('[NSE] 🔐 Refreshed NSE cookies for direct API requests');
}

async function fetchNseJsonWithRetry(url, timeoutMs = 12000) {
  try {
    return await fetchJson(url, timeoutMs);
  } catch (err) {
    console.warn(`[NSE] ⚠️  Direct NSE JSON fetch failed, retrying with refreshed cookies: ${err.message}`);
    await refreshNseCookies(timeoutMs);
    return await fetchJson(url, timeoutMs);
  }
}

function parseNseNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value !== 'string') return 0;
  const parsed = parseFloat(value.replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function fetchNsePageHtml(url, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.nseindia.com/',
      },
      timeout: timeoutMs,
    }, (res) => {
      let data = '';
      const headers = res.headers;
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data, headers }));
    });
    req.on('timeout', () => {
      req.destroy(new Error(`NSE page fetch timed out after ${timeoutMs}ms`));
    });
    req.on('error', reject);
  });
}

function parseNseDirectQuote(symbol, payload) {
  const entry = payload?.equityResponse?.[0];
  if (!entry) return null;

  const meta = entry.metaData || {};
  const trade = entry.tradeInfo || {};
  const sec = entry.secInfo || {};
  const priceInfo = entry.priceInfo || {};

  const lastPrice = parseNseNumber(trade.lastPrice || meta.lastPrice || meta.iep || 0);
  const previousClose = parseNseNumber(meta.previousClose || trade.basePrice || 0);
  const change = parseNseNumber(meta.change !== undefined ? meta.change : (lastPrice - previousClose));
  const pChange = previousClose > 0 ? parseFloat(((change / previousClose) * 100).toFixed(2)) : parseNseNumber(meta.pChange || meta.pchange || meta.ic_pchange || 0);
  const open = parseNseNumber(meta.open || 0);
  const high = parseNseNumber(meta.dayHigh || priceInfo.dayHigh || 0);
  const low = parseNseNumber(meta.dayLow || priceInfo.dayLow || 0);
  const weekHigh52 = parseNseNumber(priceInfo.yearHigh || priceInfo.yearHightDt || 0);
  const weekLow52 = parseNseNumber(priceInfo.yearLow || 0);

  const priceBand = typeof priceInfo.priceBand === 'string' ? priceInfo.priceBand : '';
  const [lowerBand, upperBand] = priceBand.split('-').map(v => v.trim());

  return {
    symbol: (meta.symbol || symbol).toUpperCase(),
    companyName: meta.companyName || '',
    industry: sec.basicIndustry || sec.industryInfo || '',
    lastPrice,
    change,
    pChange,
    previousClose,
    open,
    close: lastPrice,
    high,
    low,
    weekHigh52,
    weekLow52,
    totalTradedVolume: parseNseNumber(trade.totalTradedVolume || trade.quantitytraded || 0),
    totalTradedValue: parseNseNumber(trade.totalTradedValue || 0) / 10000000,
    marketCap: parseNseNumber(trade.totalMarketCap || 0) / 10000000,
    faceValue: parseNseNumber(trade.faceValue || 5),
    issuedSize: parseNseNumber(trade.issuedSize || 0) || null,
    pe: sec.pdSymbolPe || sec.pdSymbolPE || '',
    sectorPE: sec.pdSectorPe || sec.pdSectorPE || '',
    sectorIndex: sec.index || '',
    lastUpdateTime: meta.lastUpdateTime || '',
    listingDate: sec.listingDate || '',
    upperBand: upperBand || '',
    lowerBand: lowerBand || '',
    source: 'nse-direct-api',
  };
}

function parseNsePageQuote(html, symbol) {
  const priceMatch = html.match(/([0-9]{2,3}(?:,\d{3})*|\d+)(?:\s*\.\s*\d{2})?/);
  const normalized = (priceMatch?.[1] || '').replace(/,/g, '');
  const price = parseFloat(normalized);
  if (!Number.isFinite(price)) return null;

  const changeMatch = html.match(/([+-]?\d+(?:\.\d+)?)\s*\((\s*[+-]?\d+(?:\.\d+)?)%\)/);
  const change = changeMatch ? parseFloat(changeMatch[1]) : 0;
  const pChange = changeMatch ? parseFloat(changeMatch[2]) : 0;
  const prevCloseMatch = html.match(/Prev\.\s*Close[^\n]*?([0-9]{2,3}(?:,\d{3})*|\d+)(?:\s*\.\s*\d{2})?/i);
  const prevClose = prevCloseMatch ? parseFloat((prevCloseMatch[1] || '').replace(/,/g, '')) : 0;
  const highMatch = html.match(/High[^\n]*?([0-9]{2,3}(?:,\d{3})*|\d+)(?:\s*\.\s*\d{2})?/i);
  const lowMatch = html.match(/Low[^\n]*?([0-9]{2,3}(?:,\d{3})*|\d+)(?:\s*\.\s*\d{2})?/i);
  const openMatch = html.match(/Open[^\n]*?([0-9]{2,3}(?:,\d{3})*|\d+)(?:\s*\.\s*\d{2})?/i);
  const high = highMatch ? parseFloat((highMatch[1] || '').replace(/,/g, '')) : 0;
  const low = lowMatch ? parseFloat((lowMatch[1] || '').replace(/,/g, '')) : 0;
  const open = openMatch ? parseFloat((openMatch[1] || '').replace(/,/g, '')) : 0;

  return {
    symbol: symbol.toUpperCase(),
    companyName: 'Oil & Natural Gas Corporation Limited',
    lastPrice: price,
    change,
    pChange,
    previousClose: prevClose || price,
    open,
    close: price,
    high,
    low,
    source: 'nse-page-fallback',
  };
}

// ── CORS for dev ────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// ── Express request-level timeout ───────────────────────────────────────────
// Ensures no request hangs longer than 15 seconds even if NSE library freezes
app.use('/api/nse', (req, res, next) => {
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      console.warn(`[NSE] ⏱️  Request timeout: ${req.originalUrl}`);
      // Return stale cache if available
      const symbol = req.params?.symbol || 'ONGC';
      const stale = cache.get(`quote-${symbol}`);
      if (stale) {
        return res.json({ ...stale.data, _cached: true, _stale: true, _timeout: true });
      }
      res.status(504).json({ error: 'Request timed out', message: 'NSE API did not respond in time' });
    }
  }, 20000);
  res.on('finish', () => clearTimeout(timeout));
  res.on('close', () => clearTimeout(timeout));
  next();
});

// ── API Routes ──────────────────────────────────────────────────────────────

// Live stock quote from NSE
app.get('/api/nse/quote/:symbol', async (req, res) => {
  const { symbol } = req.params;
  
  // Restricted to ONGC stock
  if (symbol.toUpperCase() !== 'ONGC') {
    return res.status(403).json({ error: 'Data access is restricted to ONGC stock only.' });
  }

  const cacheKey = `quote-${symbol}`;
  const forceRefresh = req.query.force === '1';

  try {
    if (!forceRefresh) {
      const cached = getCached(cacheKey);
      if (cached) {
        console.log(`[NSE] Serving cached quote for ${symbol}`);
        return res.json({ ...cached, _cached: true, _dataVersion: dataVersion });
      }
    } else {
      console.log(`[NSE] Force refresh requested for ${symbol}`);
    }

    console.log(`[NSE] Fetching live quote for ${symbol}...`);

    const directUrl = `https://www.nseindia.com/api/NextApi/apiClient/GetQuoteApi?functionName=getSymbolData&marketType=N&series=EQ&symbol=${encodeURIComponent(symbol.toUpperCase())}`;
    const directResponse = await fetchNseJsonWithRetry(directUrl, 12000);
    if (!directResponse || directResponse.statusCode < 200 || directResponse.statusCode >= 300) {
      throw new Error(`NSE direct API returned status ${directResponse?.statusCode}`);
    }

    const directQuote = parseNseDirectQuote(symbol, directResponse.body);
    if (!directQuote || directQuote.lastPrice <= 0) {
      throw new Error('Invalid NSE direct quote payload');
    }

    const marketOpen = isMarketHours();
    const quote = {
      symbol: directQuote.symbol,
      companyName: directQuote.companyName || 'Oil & Natural Gas Corporation Limited',
      industry: directQuote.industry || 'Oil Exploration & Production',
      lastPrice: directQuote.lastPrice,
      change: directQuote.change,
      pChange: directQuote.pChange,
      previousClose: directQuote.previousClose,
      open: directQuote.open,
      close: directQuote.close,
      high: directQuote.high,
      low: directQuote.low,
      weekHigh52: directQuote.weekHigh52,
      weekLow52: directQuote.weekLow52,
      weekHighDate52: '',
      weekLowDate52: '',
      totalTradedVolume: directQuote.totalTradedVolume,
      totalTradedValue: directQuote.totalTradedValue,
      upperBand: directQuote.upperBand,
      lowerBand: directQuote.lowerBand,
      marketCap: directQuote.marketCap,
      faceValue: directQuote.faceValue,
      issuedSize: directQuote.issuedSize,
      pe: directQuote.pe,
      sectorPE: directQuote.sectorPE,
      sectorIndex: directQuote.sectorIndex,
      lastUpdateTime: directQuote.lastUpdateTime || '',
      listingDate: directQuote.listingDate || '',
      preOpenPrice: null,
      _source: 'NSE India (direct-api)',
      _priceSource: 'nse-direct-api',
      _fetchedAt: new Date().toISOString(),
      _priceAsOf: new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      _stale: !marketOpen,
      _staleReason: marketOpen ? '' : 'market-closed',
    };

    dataVersion++;
    setCache(cacheKey, quote);
    console.log(`[NSE] ✅ Direct NSE quote fetched for ${symbol}: ₹${quote.lastPrice}`);
    return res.json({ ...quote, _dataVersion: dataVersion });
  } catch (err) {
    console.error(`[NSE] ❌ Quote fetch error for ${symbol}:`, err.message);

    // Return cached data even if stale
    const stale = cache.get(cacheKey);
    if (stale && !res.headersSent) {
      return res.json({ ...stale.data, _cached: true, _stale: true, _cachedAgeMs: Date.now() - stale.timestamp, _dataVersion: dataVersion });
    }

    if (!res.headersSent) {
      res.status(502).json({
        error: 'Failed to fetch from NSE',
        message: err.message,
      });
    }
  }
});

// Trade info from NSE
app.get('/api/nse/trade-info/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const cacheKey = `trade-${symbol}`;

  try {
    const cached = getCached(cacheKey);
    if (cached) {
      return res.json({ ...cached, _cached: true });
    }

    console.log(`[NSE] Fetching trade info for ${symbol}...`);
    const data = await withRetry(() => nse.getEquityTradeInfo(symbol), `getEquityTradeInfo(${symbol})`);

    setCache(cacheKey, data);
    res.json(data);
  } catch (err) {
    console.error(`[NSE] Trade info error for ${symbol}:`, err.message);

    const stale = cache.get(cacheKey);
    if (stale) {
      return res.json({ ...stale.data, _cached: true, _stale: true, _cachedAgeMs: Date.now() - stale.timestamp });
    }

    res.status(502).json({
      error: 'Failed to fetch trade info from NSE',
      message: err.message,
    });
  }
});

// ── Quarterly Financial Results from NSE Corporate Filings ──────────────────
const QUARTERLY_CACHE_TTL = 30 * 60 * 1000; // 30 minutes — results don't change intraday
let quarterlyDebugLogged = false;

/**
 * Derive the quarter-end period label from the quarter-start date.
 * NSE returns re_from_dt like "01-OCT-2024" → quarter ends "Dec 2024"
 * Also handles re_to_dt like "31-DEC-2024"
 */
function toQuarterPeriod(fromDt, toDt) {
  // Prefer to_dt if available (it's the actual quarter-end)
  const dateStr = toDt || fromDt;
  if (!dateStr) return null;

  const monthMap = {
    JAN: 'Jan', FEB: 'Feb', MAR: 'Mar', APR: 'Apr', MAY: 'May', JUN: 'Jun',
    JUL: 'Jul', AUG: 'Aug', SEP: 'Sep', OCT: 'Oct', NOV: 'Nov', DEC: 'Dec'
  };

  // Quarter-start to quarter-end month mapping
  const quarterEndMap = {
    JAN: 'Mar', FEB: 'Mar', MAR: 'Mar',
    APR: 'Jun', MAY: 'Jun', JUN: 'Jun',
    JUL: 'Sep', AUG: 'Sep', SEP: 'Sep',
    OCT: 'Dec', NOV: 'Dec', DEC: 'Dec'
  };

  // Parse "DD-MON-YYYY" format (e.g., "01-OCT-2024" or "31-DEC-2024")
  const match = dateStr.match(/\d{1,2}-(\w{3})-(\d{4})/);
  if (!match) return null;

  const month = match[1].toUpperCase();
  let year = parseInt(match[2], 10);

  if (toDt) {
    // If we have to_dt, use its month directly
    return `${monthMap[month] || month} ${year}`;
  }

  // from_dt: map start month to end month
  const endMonth = quarterEndMap[month];
  if (!endMonth) return null;

  return `${endMonth} ${year}`;
}

/**
 * Safely parse a numeric value from NSE response, stripping commas and handling '-'
 */
function parseNum(val) {
  if (val === null || val === undefined || val === '-' || val === '') return 0;
  if (typeof val === 'number') return val;
  const cleaned = String(val).replace(/,/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * Convert lakhs to crores (divide by 100)
 */
function lakhsToCrores(val) {
  return Math.round(parseNum(val) / 100);
}

/**
 * Map a single NSE result row to our QuarterData format.
 * Actual NSE field names (discovered from live API response):
 *   re_from_dt, re_net_sale, re_oth_tot_exp, re_oth_inc_new,
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

  // Tax % — compute from current + deferred tax vs PBT
  const currentTax = parseNum(row.re_curr_tax || 0);
  const deferredTax = parseNum(row.re_deff_tax || 0);
  const totalTaxLakhs = currentTax + deferredTax;
  const pbtLakhs = parseNum(row.re_pro_loss_bef_tax || 0);
  const tax_pct = pbtLakhs > 0 ? Math.round((totalTaxLakhs / pbtLakhs) * 100) : 0;

  const net_profit = lakhsToCrores(row.re_net_profit || row.re_con_pro_loss || 0);

  // EPS — already in rupees, no conversion needed
  const eps = parseNum(row.re_basic_eps_for_cont_dic_opr || row.re_basic_eps || row.re_diluted_eps || 0);

  return {
    period, sales, expenses, operating_profit, opm_pct,
    other_income, interest, depreciation, profit_before_tax,
    tax_pct, net_profit, eps,
  };
}

// ── Load historical quarterly.json once at startup ───────────────────────────
import { readFile } from 'fs/promises';

let historicalData = null;
async function loadHistoricalData() {
  try {
    const staticPath = path.join(__dirname, 'public', 'data', 'quarterly.json');
    historicalData = JSON.parse(await readFile(staticPath, 'utf-8'));
    console.log(`[Data] ✅ Loaded ${historicalData.quarters.length} historical quarters (${historicalData.quarters[0].period} → ${historicalData.quarters[historicalData.quarters.length - 1].period})`);
  } catch (e) {
    console.error('[Data] ❌ Failed to load historical quarterly.json:', e.message);
    historicalData = { quarters: [], snapshot: {} };
  }
}
await loadHistoricalData();

// ── Sort helper ───────────────────────────────────────────────────────────────
const MONTH_ORDER = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
function sortQuarters(arr) {
  return [...arr].sort((a, b) => {
    const [am, ay] = a.period.split(' ');
    const [bm, by] = b.period.split(' ');
    return (parseInt(ay) - parseInt(by)) || (MONTH_ORDER[am] - MONTH_ORDER[bm]);
  });
}

// ── Merge live NSE quarters on top of historical baseline ────────────────────
// Live data wins for any period that overlaps; historical fills everything older.
function mergeQuarters(historical, live) {
  const map = new Map();
  // Load historical first (baseline)
  for (const q of historical) map.set(q.period, q);
  // Overwrite with live data (more accurate for recent quarters)
  for (const q of live) map.set(q.period, q);
  return sortQuarters([...map.values()]);
}

app.get('/api/quarterly/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const cacheKey = `quarterly-${symbol}`;

  try {
    // Serve from cache if fresh
    const entry = cache.get(cacheKey);
    if (entry && (Date.now() - entry.timestamp) < QUARTERLY_CACHE_TTL) {
      console.log(`[NSE] Serving cached quarterly results for ${symbol}`);
      return res.json({ ...entry.data, _cached: true });
    }

    console.log(`[NSE] Fetching live quarterly results for ${symbol} from NSE...`);
    const rawData = await withRetry(
      () => nse.getDataByEndpoint(`/api/results-comparision?symbol=${encodeURIComponent(symbol.toUpperCase())}`),
      `getQuarterlyResults(${symbol})`
    );

    // Debug log on first fetch
    if (!quarterlyDebugLogged) {
      quarterlyDebugLogged = true;
      const sample = rawData?.resCmpData?.[0] || (Array.isArray(rawData) ? rawData[0] : rawData);
      if (sample) {
        console.log(`[NSE] 🔍 Raw keys:`, Object.keys(sample));
        console.log(`[NSE] 🔍 Sample:`, JSON.stringify(sample, null, 2).substring(0, 1500));
      }
    }

    const rows = rawData?.resCmpData || rawData?.data || (Array.isArray(rawData) ? rawData : []);
    if (!rows.length) throw new Error('NSE returned empty quarterly results');

    console.log(`[NSE] 📊 Received ${rows.length} live rows for ${symbol}`);

    // Map live NSE rows
    const liveQuarters = rows
      .map(mapNseResultToQuarter)
      .filter(q => q !== null);

    // ✅ Merge: historical baseline + live NSE on top
    const merged = mergeQuarters(historicalData.quarters, liveQuarters);

    const result = {
      source: 'NSE India — Corporate Filings + Historical BSE/NSE Filings',
      source_url: `https://www.nseindia.com/companies-listing/corporate-filings-financial-results-comparision?symbol=${symbol}`,
      fetched_at: new Date().toISOString(),
      currency: 'INR Crores (financials), INR (price)',
      quarters: merged,
      snapshot: historicalData.snapshot || {}, // ✅ always carry snapshot through
      _live: true,
    };

    setCache(cacheKey, result);
    console.log(`[NSE] ✅ Merged: ${merged.length} total quarters (${merged[0].period} → ${merged[merged.length - 1].period})`);
    res.json(result);

  } catch (err) {
    console.error(`[NSE] ❌ Quarterly fetch error for ${symbol}:`, err.message);

    // Stale cache fallback
    const stale = cache.get(cacheKey);
    if (stale) {
      console.log(`[NSE] Serving stale cache for ${symbol}`);
      return res.json({ ...stale.data, _cached: true, _stale: true, _cachedAgeMs: Date.now() - stale.timestamp });
    }

    // Historical-only fallback (still shows all data, just no live overlay)
    if (historicalData.quarters.length > 0) {
      console.log(`[NSE] ⚠️  Serving historical-only data for ${symbol}`);
      return res.json({ ...historicalData, _fallback: true });
    }

    res.status(502).json({ error: 'Failed to fetch quarterly results', message: err.message });
  }
});




// Debug: dump raw NSE equity details (remove before production)
app.get('/api/debug/raw/:symbol', async (req, res) => {
  try {
    const data = await nse.getEquityDetails(req.params.symbol);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Debug: dump raw tradeInfo
app.get('/api/debug/trade/:symbol', async (req, res) => {
  try {
    const data = await nse.getEquityTradeInfo(req.params.symbol);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Debug: test multiple NSE endpoints to find PE/MarketCap source
app.get('/api/debug/meta/:symbol', async (req, res) => {
  const sym = req.params.symbol.toUpperCase();
  const results = {};
  const endpoints = [
    `/api/quote-equity?symbol=${sym}&section=trade_info`,
    `/api/quote-equity?symbol=${sym}`,
    `/api/stock-reached-price-band?symbol=${sym}`,
  ];
  for (const ep of endpoints) {
    try {
      results[ep] = await nse.getDataByEndpoint(ep);
    } catch (e) {
      results[ep] = { error: e.message };
    }
  }
  res.json(results);
});

// Health check + cache status
app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    cacheEntries: cache.size,
    uptime: Math.round(process.uptime()) + 's',
  });
});

// ── Serve static quarterly data ─────────────────────────────────────────────
app.use('/data', express.static(path.join(__dirname, 'public', 'data')));

// ── Serve built frontend in production ──────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}

// ── Periodic NSE Health Check ───────────────────────────────────────────────
// Every 5 minutes, ping NSE with a lightweight call to proactively detect
// session issues and recreate the client before real requests fail.
const HEALTH_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

async function nseHealthCheck() {
  try {
    console.log('[NSE] 🏥 Running health check...');
    const directUrl = `https://www.nseindia.com/api/NextApi/apiClient/GetQuoteApi?functionName=getSymbolData&marketType=N&series=EQ&symbol=ONGC`;
    await fetchNseJsonWithRetry(directUrl, 12000);
    nseCallSucceeded();
    console.log('[NSE] 🏥 Health check passed ✅');
  } catch (err) {
    console.warn(`[NSE] 🏥 Health check FAILED ❌: ${err.message}`);
    nseCallFailed(err);
  }
}

setInterval(nseHealthCheck, HEALTH_CHECK_INTERVAL);

// Run initial health check 30s after startup (gives NSE library time to warm up)
setTimeout(nseHealthCheck, 30 * 1000);

// ── Start ───────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  🛢️  ONGC Dashboard Proxy Server`);
  console.log(`  ➜  Local:   http://localhost:${PORT}`);
  console.log(`  ➜  NSE API: Using stock-nse-india library (with auto-recovery)`);
  console.log(`  ➜  Health:  Every 5 min | Auto-reset after ${NSE_MAX_FAILURES_BEFORE_RESET} failures`);
  console.log(`  ➜  Status:  http://localhost:${PORT}/api/status\n`);
});
