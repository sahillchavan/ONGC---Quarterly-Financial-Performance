import https from 'https';

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
        'Cache-Control': 'max-age=0',
        ...(nseCookieHeader ? { 'Cookie': nseCookieHeader } : {}),
      },
      timeout: timeoutMs,
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      
      res.on('data', chunk => { 
        data += chunk; 
      });
      
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ statusCode: res.statusCode, body: parsed });
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

function parseNseDirectQuote(symbol, payload) {
  console.log('[NSE API] Parsing NSE response...');
  
  // Handle new API response structure: { equityResponse: [...] }
  const entry = payload?.equityResponse?.[0];
  
  if (!entry) {
    console.log('[NSE API] Missing equityResponse[0] in payload. Available keys:', Object.keys(payload || {}));
    return null;
  }

  const meta = entry.metaData || {};
  const trade = entry.tradeInfo || {};
  const sec = entry.secInfo || {};
  const priceInfo = entry.priceInfo || {};

  console.log('[NSE API] Extracted metaData:', { 
    symbol: meta.symbol, 
    companyName: meta.companyName,
    lastPrice: meta.lastPrice,
    iep: meta.iep
  });

  const lastPrice = parseNseNumber(trade.lastPrice || meta.lastPrice || meta.iep || 0);
  const previousClose = parseNseNumber(meta.previousClose || trade.basePrice || 0);
  const change = parseNseNumber(meta.change !== undefined ? meta.change : (lastPrice - previousClose));
  const pChange = previousClose > 0 
    ? parseFloat(((change / previousClose) * 100).toFixed(2)) 
    : parseNseNumber(meta.pChange || meta.pchange || meta.ic_pchange || 0);
  const open = parseNseNumber(meta.open || 0);
  const high = parseNseNumber(meta.dayHigh || priceInfo.dayHigh || 0);
  const low = parseNseNumber(meta.dayLow || priceInfo.dayLow || 0);
  const weekHigh52 = parseNseNumber(priceInfo.yearHigh || priceInfo.yearHightDt || 0);
  const weekLow52 = parseNseNumber(priceInfo.yearLow || 0);

  const priceBand = typeof priceInfo.priceBand === 'string' ? priceInfo.priceBand : '';
  const [lowerBand, upperBand] = priceBand.split('-').map(v => (v || '').trim());

  if (!lastPrice || lastPrice <= 0) {
    console.log('[NSE API] Invalid lastPrice:', lastPrice);
    return null;
  }

  console.log('[NSE API] ✓ Parsed successfully - lastPrice:', lastPrice);

  return {
    symbol: (meta.symbol || symbol).toUpperCase(),
    companyName: meta.companyName || 'Oil & Natural Gas Corporation Limited',
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
    pe: sec.pdSymbolPe || sec.pdSymbolPE || null,
    sectorPE: sec.pdSectorPe || sec.pdSectorPE || null,
    sectorIndex: sec.index || '',
    lastUpdateTime: meta.lastUpdateTime || '',
    listingDate: sec.listingDate || '',
    upperBand: upperBand || '',
    lowerBand: lowerBand || '',
    upperBandValue: parseNseNumber(upperBand) || null,
    lowerBandValue: parseNseNumber(lowerBand) || null,
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
    
    // Try direct NSE API with retries
    let lastError = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const directUrl = `https://www.nseindia.com/api/NextApi/apiClient/GetQuoteApi?functionName=getSymbolData&marketType=N&series=EQ&symbol=${encodeURIComponent(symbol.toUpperCase())}`;
        
        console.log(`[NSE API] Attempt ${attempt}: Fetching from NSE...`);
        const response = await withTimeout(fetchJson(directUrl, FETCH_TIMEOUT), FETCH_TIMEOUT);
        
        if (!response || !response.body) {
          throw new Error('Empty response from NSE API');
        }

        console.log(`[NSE API] Response received. Keys:`, Object.keys(response.body));
        
        const quote = parseNseDirectQuote(symbol, response.body);

        if (quote && quote.lastPrice > 0) {
          const marketOpen = isMarketHours();
          console.log(`[NSE API] ✅ Success! lastPrice: ₹${quote.lastPrice}`);
          
          return res.status(200).json({
            ...quote,
            _source: 'NSE Direct API',
            _fetchedAt: new Date().toISOString(),
            _priceAsOf: new Date().toLocaleTimeString('en-IN', { 
              timeZone: 'Asia/Kolkata', 
              hour: '2-digit', 
              minute: '2-digit', 
              second: '2-digit' 
            }),
            _stale: !marketOpen,
          });
        }

        throw new Error('Invalid or missing price data from NSE API');
      } catch (attemptErr) {
        lastError = attemptErr;
        console.warn(`[NSE API] Attempt ${attempt} failed: ${attemptErr.message}`);
        
        if (attempt === 1) {
          // Before second attempt, try refreshing cookies
          console.log('[NSE API] Refreshing cookies and retrying...');
          await refreshNseCookies();
          await new Promise(r => setTimeout(r, 500)); // Wait 500ms before retry
        }
      }
    }

    throw lastError || new Error('All NSE API attempts failed');
  } catch (err) {
    console.error(`[NSE API] ❌ Final error:`, err.message);
    
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
