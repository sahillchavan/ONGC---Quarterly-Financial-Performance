import https from 'https';
import zlib from 'zlib';

// ── Constants ───────────────────────────────────────────────────────────────
const FETCH_TIMEOUT = 10000;
const ONGC_PRICE_MIN = 50;   // Sanity check: ONGC price should be within this range
const ONGC_PRICE_MAX = 1000;

// ── Persistent last-known values (warm lambdas) ──────────────────────────────
let lastKnownPe = '6.60';
let lastKnownSectorPe = '7.95';
let lastKnownMarketCap = 307462;
let lastKnownUpperBand = '';
let lastKnownLowerBand = '';
let cachedQuote = null;
let cachedQuoteTime = 0;
const CACHE_TTL = 3000; // 3 seconds cache TTL

// ── Market Hours ────────────────────────────────────────────────────────────
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
function parseNum(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value !== 'string') return 0;
  const parsed = parseFloat(value.replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

// ── Utility: Validate price is within reasonable range for ONGC ─────────────
function isValidPrice(price) {
  return typeof price === 'number' && price >= ONGC_PRICE_MIN && price <= ONGC_PRICE_MAX;
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

// ═══════════════════════════════════════════════════════════════════════════
// SOURCE 1: stock-nse-india library (handles cookies/sessions automatically)
// ═══════════════════════════════════════════════════════════════════════════
async function fetchFromStockNseIndia(symbol) {
  console.log('[NSE API] Trying source: stock-nse-india library...');

  // Dynamic import — the library is in package.json dependencies
  const { NseIndia } = await import('stock-nse-india');
  const nse = new NseIndia();

  const details = await withTimeout(nse.getEquityDetails(symbol), FETCH_TIMEOUT);

  if (!details || !details.priceInfo) {
    throw new Error('No priceInfo in stock-nse-india response');
  }

  const pi = details.priceInfo;
  const info = details.info || {};
  const secInfo = details.securityInfo || {};
  const metadata = details.metadata || {};

  const lastPrice = parseNum(pi.lastPrice);
  if (!isValidPrice(lastPrice)) {
    throw new Error(`Invalid lastPrice from stock-nse-india: ${pi.lastPrice}`);
  }

  const previousClose = parseNum(pi.previousClose || pi.close || 0);
  const change = parseNum(pi.change);
  const pChange = parseNum(pi.pChange);

  // weekHighLow has 52-week data (min/max/minDate/maxDate)
  const weekHL = pi.weekHighLow || {};
  // preOpenMarket has volume and IEP
  const preOpen = details.preOpenMarket || {};

  return {
    symbol: (info.symbol || metadata.symbol || symbol).toUpperCase(),
    companyName: info.companyName || metadata.companyName || 'Oil & Natural Gas Corporation Limited',
    industry: details.industryInfo?.basicIndustry || metadata.industry || info.industry || 'Oil Exploration & Production',
    lastPrice,
    change: change || (lastPrice - previousClose),
    pChange: pChange || (previousClose > 0 ? parseFloat(((lastPrice - previousClose) / previousClose * 100).toFixed(2)) : 0),
    previousClose,
    open: parseNum(pi.open || 0),
    close: parseNum(pi.close || lastPrice),
    high: 0,   // Not reliably available from this endpoint's intraday data
    low: 0,    // Not reliably available from this endpoint's intraday data
    weekHigh52: parseNum(weekHL.max || 0),
    weekLow52: parseNum(weekHL.min || 0),
    weekHighDate52: weekHL.maxDate || '',
    weekLowDate52: weekHL.minDate || '',
    totalTradedVolume: parseNum(preOpen.totalTradedVolume || 0),
    totalTradedValue: 0,
    upperBand: String(pi.upperCP || secInfo.upperBand || ''),
    lowerBand: String(pi.lowerCP || secInfo.lowerBand || ''),
    marketCap: null,
    faceValue: parseNum(secInfo.faceValue || 5),
    issuedSize: parseNum(secInfo.issuedSize || 0) || null,
    pe: parseNum(metadata.pdSymbolPe) > 0 ? String(metadata.pdSymbolPe) : '',
    sectorPE: parseNum(metadata.pdSectorPe) > 0 ? String(metadata.pdSectorPe) : '',
    sectorIndex: metadata.pdSectorInd || '',
    lastUpdateTime: metadata.lastUpdateTime || '',
    listingDate: metadata.listingDate || secInfo.listingDate || '',
    preOpenPrice: parseNum(preOpen.IEP || 0) || null,
    _source: 'stock-nse-india',
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SOURCE 2: Google Finance page scraping (very reliable, no auth needed)
// ═══════════════════════════════════════════════════════════════════════════
async function fetchFromGoogleFinance(symbol) {
  console.log('[NSE API] Trying source: Google Finance...');

  const url = `https://www.google.com/finance/quote/${encodeURIComponent(symbol)}:NSE`;
  const response = await withTimeout(
    fetchUrl(url, { expectJson: false, timeoutMs: 8000 }),
    10000
  );

  const html = response.body;

  // Google Finance embeds price data in the HTML as structured data and data attributes
  // The price is in a data-last-price attribute or in JSON-LD structured data
  let lastPrice = 0;
  let previousClose = 0;
  let change = 0;
  let pChange = 0;

  // Try to find price from data-last-price attribute
  const lastPriceMatch = html.match(/data-last-price="([0-9]+\.?[0-9]*)"/);
  if (lastPriceMatch) {
    lastPrice = parseFloat(lastPriceMatch[1]);
  }

  // Try to find previous close from data-previous-close attribute
  const prevCloseMatch = html.match(/data-previous-close="([0-9]+\.?[0-9]*)"/);
  if (prevCloseMatch) {
    previousClose = parseFloat(prevCloseMatch[1]);
  }

  // Try to find change values
  const changeMatch = html.match(/data-last-normal-market-change="([+-]?[0-9]+\.?[0-9]*)"/);
  if (changeMatch) {
    change = parseFloat(changeMatch[1]);
  }

  const pChangeMatch = html.match(/data-last-normal-market-change-percent="([+-]?[0-9]+\.?[0-9]*)"/);
  if (pChangeMatch) {
    pChange = parseFloat(pChangeMatch[1]);
  }

  // Alternative: try JSON-LD structured data
  if (!lastPrice) {
    const jsonLdMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
    if (jsonLdMatch) {
      for (const match of jsonLdMatch) {
        try {
          const jsonContent = match.replace(/<script[^>]*>/, '').replace(/<\/script>/, '');
          const ld = JSON.parse(jsonContent);
          if (ld.price || ld.currentPrice) {
            lastPrice = parseFloat(ld.price || ld.currentPrice);
          }
        } catch (e) {
          // Skip invalid JSON-LD blocks
        }
      }
    }
  }

  // Alternative: try to find price from the page content patterns
  if (!lastPrice) {
    // Google Finance shows the price as a large number — look for patterns like "₹243.46" or just the number
    const pricePatterns = [
      /class="[^"]*YMlKec[^"]*"[^>]*>([0-9,]+\.[0-9]{2})</,  // Main price display class
      /class="[^"]*fxKbKc[^"]*"[^>]*>([0-9,]+\.[0-9]{2})</,  // Alternative price class
      /data-value="([0-9]+\.[0-9]+)"/,                          // data-value attribute
    ];

    for (const pattern of pricePatterns) {
      const m = html.match(pattern);
      if (m) {
        const val = parseFloat(m[1].replace(/,/g, ''));
        if (isValidPrice(val)) {
          lastPrice = val;
          break;
        }
      }
    }
  }

  if (!isValidPrice(lastPrice)) {
    throw new Error(`Could not parse valid price from Google Finance (got: ${lastPrice})`);
  }

  // Calculate change if we have previousClose but not change
  if (previousClose > 0 && change === 0) {
    change = parseFloat((lastPrice - previousClose).toFixed(2));
    pChange = parseFloat(((change / previousClose) * 100).toFixed(2));
  }

  return {
    symbol: symbol.toUpperCase(),
    companyName: 'Oil & Natural Gas Corporation Limited',
    industry: 'Oil Exploration & Production',
    lastPrice,
    change,
    pChange,
    previousClose: previousClose || lastPrice,
    open: 0,
    close: lastPrice,
    high: 0,
    low: 0,
    weekHigh52: 0,
    weekLow52: 0,
    weekHighDate52: '',
    weekLowDate52: '',
    totalTradedVolume: 0,
    totalTradedValue: 0,
    upperBand: '',
    lowerBand: '',
    marketCap: null,
    faceValue: 5,
    issuedSize: null,
    pe: '',
    sectorPE: '',
    sectorIndex: '',
    lastUpdateTime: '',
    listingDate: '',
    preOpenPrice: null,
    _source: 'google-finance',
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SOURCE 3: Yahoo Finance API (unofficial but reliable)
// ═══════════════════════════════════════════════════════════════════════════
async function fetchFromYahooFinance(symbol) {
  console.log('[NSE API] Trying source: Yahoo Finance...');

  const yahooSymbol = `${symbol}.NS`;  // NSE stocks use .NS suffix on Yahoo
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=1d`;

  const response = await withTimeout(
    fetchUrl(url, {
      expectJson: true,
      timeoutMs: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*',
      },
    }),
    10000
  );

  let data;
  try {
    data = JSON.parse(response.body);
  } catch (e) {
    throw new Error('Yahoo Finance returned invalid JSON');
  }

  const result = data?.chart?.result?.[0];
  if (!result) {
    throw new Error('No chart result from Yahoo Finance');
  }

  const meta = result.meta || {};
  const lastPrice = parseNum(meta.regularMarketPrice);

  if (!isValidPrice(lastPrice)) {
    throw new Error(`Invalid price from Yahoo Finance: ${meta.regularMarketPrice}`);
  }

  const previousClose = parseNum(meta.chartPreviousClose || meta.previousClose || 0);
  const change = previousClose > 0 ? parseFloat((lastPrice - previousClose).toFixed(2)) : 0;
  const pChange = previousClose > 0 ? parseFloat(((change / previousClose) * 100).toFixed(2)) : 0;

  return {
    symbol: symbol.toUpperCase(),
    companyName: 'Oil & Natural Gas Corporation Limited',
    industry: 'Oil Exploration & Production',
    lastPrice,
    change,
    pChange,
    previousClose: previousClose || lastPrice,
    open: parseNum(meta.regularMarketOpen || 0),
    close: lastPrice,
    high: parseNum(meta.regularMarketDayHigh || meta.dayHigh || 0),
    low: parseNum(meta.regularMarketDayLow || meta.dayLow || 0),
    weekHigh52: parseNum(meta.fiftyTwoWeekHigh || 0),
    weekLow52: parseNum(meta.fiftyTwoWeekLow || 0),
    weekHighDate52: '',
    weekLowDate52: '',
    totalTradedVolume: parseNum(meta.regularMarketVolume || 0),
    totalTradedValue: 0,
    upperBand: '',
    lowerBand: '',
    marketCap: null,
    faceValue: 5,
    issuedSize: null,
    pe: '',
    sectorPE: '',
    sectorIndex: '',
    lastUpdateTime: '',
    listingDate: '',
    preOpenPrice: null,
    _source: 'yahoo-finance',
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SOURCE 4: Direct NSE API (original approach, kept as last resort)
// ═══════════════════════════════════════════════════════════════════════════
let nseCookieHeader = '';

async function refreshNseCookies() {
  console.log('[NSE API] Refreshing NSE cookies...');
  try {
    const response = await withTimeout(
      fetchUrl('https://www.nseindia.com/', {
        expectJson: false,
        timeoutMs: 8000,
      }),
      8000
    );

    const cookies = response.headers?.['set-cookie'];
    if (cookies) {
      nseCookieHeader = Array.isArray(cookies)
        ? cookies.map(c => c.split(';')[0]).join('; ')
        : cookies.split(';')[0];
      console.log('[NSE API] ✓ Cookies refreshed');
      return true;
    }
    return false;
  } catch (err) {
    console.warn('[NSE API] Cookie refresh failed:', err.message);
    return false;
  }
}

function parseNseDirectQuote(symbol, payload) {
  const entry = payload?.equityResponse?.[0];
  if (!entry) return null;

  const meta = entry.metaData || {};
  const trade = entry.tradeInfo || {};
  const sec = entry.secInfo || {};
  const priceInfo = entry.priceInfo || {};

  const lastPrice = parseNum(trade.lastPrice || meta.lastPrice || meta.iep || 0);
  const previousClose = parseNum(meta.previousClose || trade.basePrice || 0);
  const change = parseNum(meta.change !== undefined ? meta.change : (lastPrice - previousClose));
  const pChange = previousClose > 0 ? parseFloat(((change / previousClose) * 100).toFixed(2)) : parseNum(meta.pChange || meta.pchange || meta.ic_pchange || 0);
  const open = parseNum(meta.open || 0);
  const high = parseNum(meta.dayHigh || priceInfo.dayHigh || 0);
  const low = parseNum(meta.dayLow || priceInfo.dayLow || 0);
  const weekHigh52 = parseNum(priceInfo.yearHigh || 0);
  const weekLow52 = parseNum(priceInfo.yearLow || 0);

  const priceBand = typeof priceInfo.priceBand === 'string' ? priceInfo.priceBand : '';
  const [lowerBand, upperBand] = priceBand.split('-').map(v => v.trim());

  return {
    symbol: (meta.symbol || symbol).toUpperCase(),
    companyName: meta.companyName || 'Oil & Natural Gas Corporation Limited',
    industry: sec.basicIndustry || sec.industryInfo || 'Oil Exploration & Production',
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
    totalTradedVolume: parseNum(trade.totalTradedVolume || trade.quantitytraded || 0),
    totalTradedValue: parseNum(trade.totalTradedValue || 0) / 10000000,
    marketCap: parseNum(trade.totalMarketCap || 0) / 10000000,
    faceValue: parseNum(trade.faceValue || 5),
    issuedSize: parseNum(trade.issuedSize || 0) || null,
    pe: String(sec.pdSymbolPe || sec.pdSymbolPE || ''),
    sectorPE: String(sec.pdSectorPe || sec.pdSectorPE || ''),
    sectorIndex: String(sec.index || ''),
    lastUpdateTime: meta.lastUpdateTime || '',
    listingDate: sec.listingDate || '',
    upperBand: upperBand || '',
    lowerBand: lowerBand || '',
    preOpenPrice: null,
    _source: 'nse-direct-api',
  };
}

async function fetchFromNseDirectApi(symbol) {
  console.log('[NSE API] Trying source: NSE Direct API (GetQuoteApi)...');

  await refreshNseCookies();

  const url = `https://www.nseindia.com/api/NextApi/apiClient/GetQuoteApi?functionName=getSymbolData&marketType=N&series=EQ&symbol=${encodeURIComponent(symbol.toUpperCase())}`;
  const response = await withTimeout(
    fetchUrl(url, {
      expectJson: true,
      timeoutMs: 8000,
      headers: {
        'Referer': `https://www.nseindia.com/get-quote/equity?symbol=${encodeURIComponent(symbol.toUpperCase())}`,
        ...(nseCookieHeader ? { 'Cookie': nseCookieHeader } : {}),
      },
    }),
    10000
  );

  let data;
  try {
    data = JSON.parse(response.body);
  } catch (e) {
    throw new Error('NSE Direct API returned invalid JSON');
  }

  const directQuote = parseNseDirectQuote(symbol, data);
  if (!directQuote || !isValidPrice(directQuote.lastPrice)) {
    throw new Error(`Invalid price parsed from NSE Direct API`);
  }

  return directQuote;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN HANDLER: Cascading fetch with multiple sources + data enrichment
// ═══════════════════════════════════════════════════════════════════════════
export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
  // Prevent Vercel edge from caching stale prices
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  let symbol = req.query.symbol;
  if (Array.isArray(symbol)) symbol = symbol[0];
  if (!symbol) return res.status(400).json({ error: 'Symbol parameter is required' });
  if (symbol.toUpperCase() !== 'ONGC') return res.status(403).json({ error: 'Only ONGC data is available' });

  symbol = symbol.toUpperCase();
  const marketOpen = isMarketHours();
  const forceRefresh = req.query.force === '1';

  // 1. Check warm lambda cache to prevent rate-limiting and conflict issues
  if (!forceRefresh && cachedQuote && (Date.now() - cachedQuoteTime) < CACHE_TTL) {
    console.log('[NSE API] Serving cached quote');
    return res.status(200).json({
      ...cachedQuote,
      _cached: true,
      _stale: !marketOpen,
    });
  }

  // 2. Fetch directly from official NSE GetQuoteApi (Single source of truth)
  try {
    console.log('[NSE API] ━━━ Attempting fetch from nse-direct-api (GetQuoteApi)...');
    const quote = await fetchFromNseDirectApi(symbol);

    if (quote && isValidPrice(quote.lastPrice)) {
      console.log(`[NSE API] ✅ Success: ₹${quote.lastPrice}`);

      // Save last known metadata fields
      if (quote.pe && quote.pe !== '0' && quote.pe !== '') lastKnownPe = quote.pe;
      if (quote.sectorPE && quote.sectorPE !== '0' && quote.sectorPE !== '') lastKnownSectorPe = quote.sectorPE;
      if (quote.marketCap && quote.marketCap > 0) lastKnownMarketCap = quote.marketCap;
      if (quote.upperBand && quote.upperBand !== '') lastKnownUpperBand = quote.upperBand;
      if (quote.lowerBand && quote.lowerBand !== '') lastKnownLowerBand = quote.lowerBand;

      // Supplement any missing metadata
      if ((!quote.pe || quote.pe === '') && lastKnownPe) quote.pe = lastKnownPe;
      if ((!quote.sectorPE || quote.sectorPE === '') && lastKnownSectorPe) quote.sectorPE = lastKnownSectorPe;
      if ((!quote.marketCap || quote.marketCap === 0 || quote.marketCap === null) && lastKnownMarketCap) quote.marketCap = lastKnownMarketCap;
      if ((!quote.upperBand || quote.upperBand === '') && lastKnownUpperBand) quote.upperBand = lastKnownUpperBand;
      if ((!quote.lowerBand || quote.lowerBand === '') && lastKnownLowerBand) quote.lowerBand = lastKnownLowerBand;

      const formattedQuote = {
        ...quote,
        _fetchedAt: new Date().toISOString(),
        _priceAsOf: new Date().toLocaleTimeString('en-IN', {
          timeZone: 'Asia/Kolkata',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
        _stale: !marketOpen,
      };

      // Store in warm cache
      cachedQuote = formattedQuote;
      cachedQuoteTime = Date.now();

      return res.status(200).json(formattedQuote);
    }

    throw new Error('nse-direct-api returned invalid price data');
  } catch (err) {
    console.warn(`[NSE API] ✗ nse-direct-api failed: ${err.message}`);

    // 3. Fallback to cached quote (even if expired) to prevent failing the page load
    if (cachedQuote) {
      console.log('[NSE API] ⚠️ Serving stale cached quote after API failure');
      return res.status(200).json({
        ...cachedQuote,
        _cached: true,
        _stale: true,
        _staleReason: 'api-failure',
      });
    }

    // 4. If everything fails and no cache exists, return 502
    console.error('[NSE API] ❌ Live quote failed and no cached data is available');
    return res.status(502).json({
      error: 'Failed to fetch live stock price',
      message: err.message,
      _fetchedAt: new Date().toISOString(),
    });
  }
}

