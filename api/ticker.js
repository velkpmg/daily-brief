const https = require('https');

// Symbol map — using ETF proxies for indices since Finnhub free tier covers stocks/ETFs/crypto/forex
const SYMBOLS = [
  { finnhub: 'SPY',              label: 'SPY',     type: 'stock' },
  { finnhub: 'AAPL',             label: 'AAPL',    type: 'stock' },
  { finnhub: 'MSFT',             label: 'MSFT',    type: 'stock' },
  { finnhub: 'NVDA',             label: 'NVDA',    type: 'stock' },
  { finnhub: 'AMZN',             label: 'AMZN',    type: 'stock' },
  { finnhub: 'TSLA',             label: 'TSLA',    type: 'stock' },
  { finnhub: 'GOOGL',            label: 'GOOGL',   type: 'stock' },
  { finnhub: 'META',             label: 'META',    type: 'stock' },
  { finnhub: 'JPM',              label: 'JPM',     type: 'stock' },
  { finnhub: 'DIA',              label: 'DOW',     type: 'stock' },  // Dow Jones ETF
  { finnhub: 'QQQ',              label: 'NASDAQ',  type: 'stock' },  // NASDAQ-100 ETF
  { finnhub: 'VOO',              label: 'S&P 500', type: 'stock' },  // S&P 500 ETF
  { finnhub: 'VIXY',             label: 'VIX',     type: 'stock' },  // VIX futures ETF
  { finnhub: 'GLD',               label: 'GOLD',    type: 'stock'  },  // SPDR Gold ETF
  { finnhub: 'BINANCE:BTCUSDT',  label: 'BTC',     type: 'crypto' },
];

function fetchQuote(symbol, token) {
  return new Promise((resolve) => {
    const path = `/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${token}`;
    const req = https.request({
      hostname: 'finnhub.io',
      path,
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (_) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(6000, () => { req.destroy(); resolve(null); });
    req.end();
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=55, stale-while-revalidate=10');

  const token = process.env.FINNHUB_API_KEY;
  if (!token) {
    return res.status(500).json({ error: 'FINNHUB_API_KEY not set', quotes: [] });
  }

  // Fetch all quotes in parallel
  const results = await Promise.all(SYMBOLS.map(s => fetchQuote(s.finnhub, token)));

  const quotes = SYMBOLS.map((s, i) => {
    const q = results[i];
    if (!q || !q.c) return null;

    const price = q.c;
    const change = q.d || 0;
    const changePct = q.dp || 0;

    let priceStr;
    if (price >= 10000) priceStr = price.toLocaleString('en-US', { maximumFractionDigits: 0 });
    else if (price >= 1000) priceStr = price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    else priceStr = price.toFixed(2);

    return {
      label: s.label,
      price: priceStr,
      change: change >= 0 ? 1 : -1,
      changeStr: `${Math.abs(changePct).toFixed(2)}%`
    };
  }).filter(Boolean);

  return res.status(200).json({ quotes });
};
