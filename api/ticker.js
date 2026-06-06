const https = require('https');

// Map Yahoo Finance symbols to display labels
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

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=55, stale-while-revalidate=10');

  const symbolList = SYMBOLS.map(s => s.yahoo).join(',');
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbolList)}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketPreviousClose`;

  return new Promise((resolve) => {
    const options = {
      hostname: 'query1.finance.yahoo.com',
      path: `/v7/finance/quote?symbols=${encodeURIComponent(symbolList)}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent`,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DailyBrief/1.0)',
        'Accept': 'application/json',
      }
    };

    const request = https.request(options, (response) => {
      let data = '';
      response.on('data', chunk => { data += chunk; });
      response.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const results = parsed?.quoteResponse?.result || [];

          const quotes = SYMBOLS.map(s => {
            const q = results.find(r => r.symbol === s.yahoo);
            if (!q) return null;

            const price = q.regularMarketPrice;
            const change = q.regularMarketChange;
            const changePct = q.regularMarketChangePercent;

            // Format price based on magnitude
            let priceStr;
            if (price >= 10000) priceStr = price.toLocaleString('en-US', { maximumFractionDigits: 0 });
            else if (price >= 100) priceStr = price.toFixed(2);
            else priceStr = price.toFixed(2);

            return {
              label: s.label,
              price: priceStr,
              change: change >= 0 ? 1 : -1,
              changeStr: `${Math.abs(changePct).toFixed(2)}%`
            };
          }).filter(Boolean);

          res.status(200).json({ quotes });
        } catch (e) {
          res.status(500).json({ error: 'Failed to parse ticker data', detail: e.message });
        }
        resolve();
      });
    });

    request.on('error', (err) => {
      res.status(500).json({ error: 'Ticker fetch failed', detail: err.message });
      resolve();
    });

    request.setTimeout(8000, () => {
      request.destroy();
      res.status(504).json({ error: 'Ticker request timed out' });
      resolve();
    });

    request.end();
  });
};
