import https from 'https';
import zlib from 'zlib';
import { readFile } from 'fs/promises';
import path from 'path';

const FETCH_TIMEOUT = 10000;
let nseCookieHeader = '';

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

function withTimeout(promise, ms = 10000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`NSE call timed out after ${ms}ms`)), ms)
    ),
  ]);
}

async function refreshNseCookies() {
  console.log('[NSE API] Refreshing NSE cookies...');
  try {
    const response = await withTimeout(
      new Promise((resolve, reject) => {
        https.get('https://www.nseindia.com/', {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
          timeout: 8000,
        }, (res) => {
          const cookies = res.headers?.['set-cookie'];
          if (cookies) {
            const cookieString = Array.isArray(cookies)
              ? cookies.map(c => c.split(';')[0]).join('; ')
              : cookies.split(';')[0];
            resolve(cookieString);
          } else {
            reject(new Error('No Set-Cookie header received'));
          }
          res.destroy();
        }).on('error', reject);
      }),
      8000
    );
    
    nseCookieHeader = response;
    console.log('[NSE API] ✓ Cookies refreshed');
    return true;
  } catch (err) {
    console.warn('[NSE API] Cookie refresh failed:', err.message);
    return false;
  }
}

function fetchJson(url, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': 'https://www.nseindia.com/get-quote/equity?symbol=ONGC',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        ...(nseCookieHeader ? { 'Cookie': nseCookieHeader } : {}),
      },
      timeout: timeoutMs,
    }, (res) => {
      let data = '';
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

      stream.setEncoding('utf8');

      stream.on('data', chunk => { data += chunk; });

      stream.on('end', () => {
        if (statusCode < 200 || statusCode >= 300) {
          return reject(new Error(`HTTP status ${statusCode}`));
        }

        try {
          const parsed = JSON.parse(data);
          resolve({ statusCode, body: parsed });
        } catch (e) {
          reject(new Error(`JSON parse error: ${e.message}`));
        }
      });
    });

    req.on('error', (e) => {
      reject(new Error(`HTTP request error: ${e.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timed out after ${timeoutMs}ms`));
    });
  });
}

function parseNseNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value !== 'string') return 0;
  const parsed = parseFloat(value.replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeNsePayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (Array.isArray(payload.equityResponse) && payload.equityResponse.length > 0) {
    return payload.equityResponse[0];
  }
  if (payload.data && typeof payload.data === 'object') {
    if (Array.isArray(payload.data.equityResponse) && payload.data.equityResponse.length > 0) {
      return payload.data.equityResponse[0];
    }
    return payload.data;
  }
  if (payload.response && typeof payload.response === 'object') {
    return normalizeNsePayload(payload.response);
  }
  return payload;
}

function safeValue(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return undefined;
}

function parseNseDirectQuote(symbol, payload) {
  console.log('[NSE API] Parsing NSE response...');
  console.log('[NSE API] Payload keys:', Object.keys(payload || {}));

  const entry = normalizeNsePayload(payload);
  if (!entry) {
    console.log('[NSE API] ✗ No recognized structure found');
    return null;
  }

  const meta = entry.metaData || entry.meta || entry;
  const trade = entry.tradeInfo || entry.trade || entry;
  const sec = entry.secInfo || entry.sec || entry;
  const priceInfo = entry.priceInfo || entry.priceinfo || entry;

  console.log('[NSE API] Entry keys:', Object.keys(entry).slice(0, 10));

  const lastPrice = parseNseNumber(
    safeValue(trade.lastPrice, meta.lastPrice, meta.iep, meta.ltp, entry.lastPrice, entry.ltp, entry['last_traded_price']) || 0
  );

  if (!lastPrice || lastPrice <= 0) {
    console.log('[NSE API] ✗ Could not find valid lastPrice');
    return null;
  }

  const previousClose = parseNseNumber(
    safeValue(meta.previousClose, meta.prevClose, trade.basePrice, priceInfo.previousClose, entry.previousClose, 0)
  );

  const change = parseNseNumber(
    safeValue(meta.change, meta.chg, entry.change, trade.change, lastPrice - previousClose)
  );

  const pChange = previousClose > 0
    ? parseFloat(((change / previousClose) * 100).toFixed(2))
    : parseNseNumber(safeValue(meta.pChange, meta.pchange, meta.ic_pchange, entry.pChange, entry.pchange, 0));

  const companyName = safeValue(meta.companyName, meta.company, meta.stockName, entry.companyName, 'Oil & Natural Gas Corporation Limited');
  const symbolParsed = safeValue(meta.symbol, meta.stock, entry.symbol, symbol).toString().toUpperCase();

  const priceBand = typeof priceInfo.priceBand === 'string' ? priceInfo.priceBand : '';
  const [lowerBand, upperBand] = priceBand.split('-').map(v => (v || '').trim());

  return {
    symbol: symbolParsed,
    companyName: companyName.toString().trim(),
    industry: safeValue(sec.basicIndustry, sec.industryInfo, sec.industry, entry.industry, ''),
    lastPrice,
    change,
    pChange,
    previousClose,
    open: parseNseNumber(safeValue(meta.open, priceInfo.open, entry.open, 0)),
    close: lastPrice,
    high: parseNseNumber(safeValue(meta.dayHigh, meta.high, priceInfo.dayHigh, entry.high, 0)),
    low: parseNseNumber(safeValue(meta.dayLow, meta.low, priceInfo.dayLow, entry.low, 0)),
    weekHigh52: parseNseNumber(safeValue(priceInfo.yearHigh, priceInfo['52WeekHigh'], entry.weekHigh52, 0)),
    weekLow52: parseNseNumber(safeValue(priceInfo.yearLow, priceInfo['52WeekLow'], entry.weekLow52, 0)),
    totalTradedVolume: parseNseNumber(safeValue(trade.totalTradedVolume, trade.quantitytraded, trade.volume, entry.totalTradedVolume, entry.volume, 0)),
    totalTradedValue: parseNseNumber(safeValue(trade.totalTradedValue, trade.value, entry.totalTradedValue, 0)) / 10000000,
    marketCap: parseNseNumber(safeValue(trade.totalMarketCap, entry.marketCap, 0)) / 10000000,
    faceValue: parseNseNumber(safeValue(trade.faceValue, entry.faceValue, 5)),
    pe: safeValue(sec.pdSymbolPe, sec.pdSymbolPE, sec.pe, entry.pe, null),
    sectorPE: safeValue(sec.pdSectorPe, sec.pdSectorPE, sec.sectorPE, entry.sectorPE, null),
    sectorIndex: safeValue(sec.index, sec.indexName, entry.sectorIndex, ''),
    lastUpdateTime: safeValue(meta.lastUpdateTime, meta.updateTime, entry.lastUpdateTime, ''),
    listingDate: safeValue(sec.listingDate, entry.listingDate, ''),
    upperBand: upperBand || safeValue(entry.upperBand, ''),
    lowerBand: lowerBand || safeValue(entry.lowerBand, ''),
  };
}

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  let symbol = req.query.symbol;
  
  if (Array.isArray(symbol)) {
    symbol = symbol[0];
  }

  if (!symbol) {
    return res.status(400).json({ error: 'Symbol parameter is required' });
  }

  if (symbol.toUpperCase() !== 'ONGC') {
    return res.status(403).json({ error: 'Only ONGC data is available' });
  }

  try {
    console.log(`[NSE API] Fetching quote for ${symbol}`);
    
    // Refresh cookies for first attempt
    await refreshNseCookies();
    
    // Try the NSE JSON quote endpoints with cookie refresh and fallback support
    const endpoints = [
      {
        url: `https://www.nseindia.com/api/NextApi/apiClient/GetQuoteApi?functionName=getSymbolData&marketType=N&series=EQ&symbol=${encodeURIComponent(symbol.toUpperCase())}`,
        source: 'NSE Direct API',
      },
      {
        url: `https://www.nseindia.com/api/quote-equity?symbol=${encodeURIComponent(symbol.toUpperCase())}`,
        source: 'NSE Quote Equity API',
      },
    ];

    let lastError = null;

    for (let attempt = 0; attempt < endpoints.length; attempt++) {
      const { url, source } = endpoints[attempt];
      try {
        console.log(`[NSE API] Attempt ${attempt + 1}: Fetching from ${source}`);
        const response = await withTimeout(fetchJson(url, FETCH_TIMEOUT), FETCH_TIMEOUT);

        if (!response || !response.body) {
          throw new Error(`Empty response from ${source}`);
        }

        console.log(`[NSE API] Response received from ${source}. Keys:`, Object.keys(response.body));
        const quote = parseNseDirectQuote(symbol, response.body);

        if (quote && quote.lastPrice > 0) {
          const marketOpen = isMarketHours();
          console.log(`[NSE API] ✅ Success from ${source}! lastPrice: ₹${quote.lastPrice}`);

          return res.status(200).json({
            ...quote,
            _source: source,
            _fetchedAt: new Date().toISOString(),
            _priceAsOf: new Date().toLocaleTimeString('en-IN', {
              timeZone: 'Asia/Kolkata',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            }),
            _stale: !marketOpen,
          });
        }

        throw new Error(`Invalid or missing price data from ${source}`);
      } catch (attemptErr) {
        lastError = attemptErr;
        console.warn(`[NSE API] Attempt ${attempt + 1} failed for ${source}: ${attemptErr.message}`);

        if (attempt === 0) {
          console.log('[NSE API] Refreshing cookies and retrying with fallback endpoint...');
          await refreshNseCookies();
          await new Promise(r => setTimeout(r, 500));
        }
      }
    }

    throw lastError || new Error('All NSE API attempts failed');
  } catch (err) {
    console.error(`[NSE API] ❌ Final error:`, err.message);
    
    // Try returning a local snapshot from public/data when NSE is unreachable
    try {
      const snapshotPath = path.join(process.cwd(), 'public', 'data', 'ongc-snapshot.json');
      const raw = await readFile(snapshotPath, 'utf8');
      const parsed = JSON.parse(raw);
      parsed._source = 'local-snapshot';
      parsed._cached = true;
      parsed._stale = true;
      parsed._fetchedAt = new Date().toISOString();
      console.log('[NSE API] Returning local snapshot due to NSE fetch failure');
      return res.status(200).json(parsed);
    } catch (fsErr) {
      console.warn('[NSE API] Failed to read local snapshot:', fsErr.message);
    }

    // Return demo data with error indicator
    const demoResponse = {
      symbol: 'ONGC',
      companyName: 'Oil & Natural Gas Corporation Limited',
      lastPrice: 325.50,
      change: 2.25,
      pChange: 0.70,
      previousClose: 323.25,
      open: 324.00,
      high: 326.75,
      low: 323.00,
      weekHigh52: 485.00,
      weekLow52: 285.50,
      totalTradedVolume: 2500000,
      totalTradedValue: 812500000,
      pe: 8.5,
      marketCap: 185000,
      _source: 'Cached/Demo Data',
      _cached: true,
      _timeout: true,
      _stale: true,
      _fetchedAt: new Date().toISOString(),
      error: err.message,
    };

    // Return 200 with demo data so frontend knows this is intentional
    res.status(200).json(demoResponse);
  }
}
