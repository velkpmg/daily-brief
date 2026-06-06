const https = require('https');

const SYMBOLS = [
  { yahoo: 'SPY',     label: 'SPY' },
  { yahoo: 'AAPL',    label: 'AAPL' },
  { yahoo: 'MSFT',    label: 'MSFT' },
  { yahoo: 'NVDA',    label: 'NVDA' },
  { yahoo: 'AMZN',    label: 'AMZN' },
  { yahoo: 'TSLA',    label: 'TSLA' },
  { yahoo: 'GOOGL',   label: 'GOOGL' },
  { yahoo: 'META',    label: 'META' },
  { yahoo: 'JPM',     label: 'JPM' },
  { yahoo: '^DJI',    label: 'DOW' },
  { yahoo: '^IXIC',   label: 'NASDAQ' },
  { yahoo: '^GSPC',   label: 'S&P 500' },
  { yahoo: '^VIX',    label: 'VIX' },
  { yahoo: 'GC=F',    label: 'GOLD' },
  { yahoo: 'BTC-USD', label: 'BTC' },
];

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function get(options) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=55, stale-while-revalidate=10');

  try {
    // Step 1: get cookies from Yahoo Finance consent page
    const cookieRes = await get({
      hostname: 'fc.yahoo.com',
      path: '/',
      method: 'GET',
      headers: { 'User-Agent': UA }
    });
    const rawCookies = cookieRes.headers['set-cookie'] || [];
    const cookieStr = rawCookies.map(c => c.split(';')[0]).join('; ');

    // Step 2: get crumb
    const crumbRes = await get({
      hostname: 'query1.finance.yahoo.com',
      path: '/v1/test/getcrumb',
      method: 'GET',
      headers: { 'User-Agent': UA, 'Cookie': cookieStr }
    });
    const crumb = crumbRes.body.trim();
    if (!crumb || crumb.includes('{')) throw new Error('Could not get crumb');

    // Step 3: fetch all quotes in one call
    const symbolList = SYMBOLS.map(s => encodeURIComponent(s.yahoo)).join('%2C');
    const quoteRes = await get({
      hostname: 'query1.finance.yahoo.com',
      path: `/v7/finance/quote?symbols=${symbolList}&crumb=${encodeURIComponent(crumb)}`,
      method: 'GET',
      headers: { 'User-Agent': UA, 'Cookie': cookieStr, 'Accept': 'application/json' }
    });

    const data = JSON.parse(quoteRes.body);
    const results = data?.quoteResponse?.result || [];

    const quotes = SYMBOLS.map(s => {
      const q = results.find(r => r.symbol === s.yahoo);
      if (!q || q.regularMarketPrice == null) return null;

      const price = q.regularMarketPrice;
      const changePct = q.regularMarketChangePercent || 0;
      const change = q.regularMarketChange || 0;

      let priceStr;
      if (price >= 1000) priceStr = price.toLocaleString('en-US', { maximumFractionDigits: 2 });
      else priceStr = price.toFixed(2);

      return {
        label: s.label,
        price: priceStr,
        change: change >= 0 ? 1 : -1,
        changeStr: `${Math.abs(changePct).toFixed(2)}%`
      };
    }).filter(Boolean);

    return res.status(200).json({ quotes });

  } catch (e) {
    return res.status(500).json({ error: e.message, quotes: [] });
  }
};
