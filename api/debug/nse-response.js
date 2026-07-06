import https from 'https';

function fetchJson(url, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.nseindia.com/get-quote/equity/ONGC/Oil-&-Natural-Gas-Corporation-Limited',
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
          resolve({ statusCode: res.statusCode, body: parsed, headers: res.headers });
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  try {
    const directUrl = `https://www.nseindia.com/api/NextApi/apiClient/GetQuoteApi?functionName=getSymbolData&marketType=N&series=EQ&symbol=ONGC`;
    
    console.log('[DEBUG] Fetching from:', directUrl);
    const response = await fetchJson(directUrl, 10000);
    
    // Return the raw response structure
    return res.status(200).json({
      success: true,
      statusCode: response.statusCode,
      responseKeys: Object.keys(response.body || {}),
      fullResponse: response.body,
      message: 'Raw NSE API response for debugging',
    });
  } catch (err) {
    console.error('[DEBUG] Error:', err.message);
    return res.status(200).json({
      success: false,
      error: err.message,
      message: 'Failed to fetch NSE API',
    });
  }
}
