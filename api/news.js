const https = require('https');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  const { prompt } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'Missing prompt in request body' });

  const payload = JSON.stringify({
    model: 'claude-sonnet-4-5',
    max_tokens: 4096,
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 1 }],
    messages: [{ role: 'user', content: prompt }]
  });

  const options = {
    hostname: 'api.anthropic.com',
    path: '/v1/messages',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'web-search-2025-03-05'
    }
  };

  return new Promise((resolve) => {
    const request = https.request(options, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        try {
          const parsed = JSON.parse(data);

          // Pass through non-200 errors (rate limits, auth, etc.)
          if (response.statusCode !== 200) {
            const errMsg = parsed?.error?.message || parsed?.error || `API error ${response.statusCode}`;
            return res.status(response.statusCode).json({ error: errMsg });
          }

          // Extract the text blocks from the response
          const textBlocks = (parsed.content || [])
            .filter(b => b.type === 'text')
            .map(b => b.text)
            .join('\n');

          // Strip markdown code fences
          const cleaned = textBlocks
            .replace(/```json\s*/gi, '')
            .replace(/```\s*/g, '')
            .trim();

          // Try direct parse first (if entire response is the array)
          let articles = null;
          try {
            const direct = JSON.parse(cleaned);
            if (Array.isArray(direct) && direct.length && direct[0].title) {
              articles = direct;
            }
          } catch (_) {}

          // Fallback: find first [...] block that parses as article array
          if (!articles) {
            const start = cleaned.indexOf('[');
            const end = cleaned.lastIndexOf(']');
            if (start !== -1 && end > start) {
              try {
                const slice = cleaned.slice(start, end + 1);
                const arr = JSON.parse(slice);
                if (Array.isArray(arr) && arr.length && arr[0].title) {
                  articles = arr;
                }
              } catch (_) {}
            }
          }

          if (!articles) {
            // Return debug info so we can see what came back
            return res.status(500).json({
              error: 'Could not extract articles from response',
              debug: cleaned.slice(0, 500)
            });
          }

          resolve();
          return res.status(200).json({ articles });
        } catch (e) {
          res.status(500).json({ error: 'Failed to parse Anthropic response', detail: e.message });
          resolve();
        }
      });
    });

    request.on('error', (err) => {
      res.status(500).json({ error: 'Request to Anthropic failed', detail: err.message });
      resolve();
    });

    request.write(payload);
    request.end();
  });
};
