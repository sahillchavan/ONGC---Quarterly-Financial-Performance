import https from 'https';

const FETCH_TIMEOUT = 8000;

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

function withTimeout(promise, ms = 8000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`NSE call timed out after ${ms}ms`)), ms)
    ),
  ]);
}

function fetchJson(url, timeoutMs = 8000) {
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

function parseNseDirectQuote(symbol, body) {
  if (!body) {
    console.log('[NSE API] body is null/undefined');
    return null;
  }

  if (!body.data) {
    console.log('[NSE API] body.data is missing:', Object.keys(body));
    return null;
  }

  const info = body.data.priceInfo;
  if (!info) {
    console.log('[NSE API] priceInfo is missing');
    return null;
  }

  const lastPrice = parseFloat(info.lastPrice);
  if (!lastPrice || lastPrice <= 0) {
    console.log('[NSE API] Invalid lastPrice:', info.lastPrice);
    return null;
  }

  console.log('[NSE API] Parsed quote - lastPrice:', lastPrice);

  return {
    symbol: symbol.toUpperCase(),
    companyName: (body.data.info?.companyName || '').trim() || 'Oil & Natural Gas Corporation Limited',
    lastPrice: lastPrice,
    change: parseFloat(info.change) || 0,
    pChange: parseFloat(info.pChange) || 0,
    previousClose: parseFloat(info.previousClose) || 0,
    open: parseFloat(info.open) || 0,
    high: parseFloat(info.high) || 0,
    low: parseFloat(info.low) || 0,
    weekHigh52: parseFloat(info['52WeekHigh']) || 0,
    weekLow52: parseFloat(info['52WeekLow']) || 0,
    totalTradedVolume: parseFloat(info.totalTradedVolume) || 0,
    totalTradedValue: parseFloat(info.totalTradedValue) || 0,
    upperBand: parseFloat(info.upperBand) || 0,
    lowerBand: parseFloat(info.lowerBand) || 0,
    marketCap: body.data.info?.marketCap || null,
    pe: body.data.info?.pe || null,
    sectorPE: body.data.info?.sectorPE || null,
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

  // In Vercel, dynamic route params come through req.query
  let symbol = req.query.symbol;
  
  // Handle both patterns: /api/nse/quote/ONGC and /api/nse/quote?symbol=ONGC
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
    
    // Try direct NSE API with multiple retries
    let lastError = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const directUrl = `https://www.nseindia.com/api/NextApi/apiClient/GetQuoteApi?functionName=getSymbolData&marketType=N&series=EQ&symbol=${encodeURIComponent(symbol.toUpperCase())}`;
        
        console.log(`[NSE API] Attempt ${attempt}: Fetching from NSE...`);
        const response = await withTimeout(fetchJson(directUrl, FETCH_TIMEOUT), FETCH_TIMEOUT);
        
        if (!response || !response.body) {
          throw new Error('Empty response from NSE API');
        }

        console.log(`[NSE API] Response status: ${response.statusCode}`);
        
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
        if (attempt < 2) {
          await new Promise(r => setTimeout(r, 1000)); // Wait 1s before retry
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

    // Return 200 with demo data so frontend knows this is intentional, not a server error
    res.status(200).json(demoResponse);
  }
}
