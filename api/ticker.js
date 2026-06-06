const https = require('https');

// Symbol map — using ETF proxies for indices since Finnhub free tier covers stocks/ETFs/crypto/forex
const SYMBOLS = [
  { finnhub: 'SPY',             label: 'SPY'     },
  { finnhub: 'AAPL',            label: 'AAPL'    },
  { finnhub: 'MSFT',            label: 'MSFT'    },
  { finnhub: 'NVDA',            label: 'NVDA'    },
  { finnhub: 'AMZN',            label: 'AMZN'    },
  { finnhub: 'TSLA',            label: 'TSLA'    },
  { finnhub: 'GOOGL',           label: 'GOOGL'   },
  { finnhub: 'META',            label: 'META'    },
  { finnhub: 'JPM',             label: 'JPM'     },
  { finnhub: 'DIA',             label: 'DOW'     },  // Dow Jones ETF
  { finnhub: 'QQQ',             label: 'NASDAQ'  },  // NASDAQ-100 ETF
  { finnhub: 'VOO',             label: 'S&P 500' },  // S&P 500 ETF
  { finnhub: 'VIXY',            label: 'VIX'     },  // VIX futures ETF
  { finnhub: 'GLD',             label: 'GOLD'    },  // SPDR Gold ETF
  { finnhub: 'BINANCE:BTCUSDT', label: 'BTC'     },
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
