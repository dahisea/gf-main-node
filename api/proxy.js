// api/[[...path]].js
import fetch from 'node-fetch';

export default async (req, res) => {
  try {
    // 1. Construct target URL
    const path = req.query.path?.join('/') || '';
    const targetUrl = new URL(`https://example.com/${path}`);
    
    // 2. Clone and modify headers
    const headers = { ...req.headers };
    delete headers.host;
    delete.headers.referer;
    headers['x-forwarded-host'] = req.headers.host;

    // 3. Forward the request
    const response = await fetch(targetUrl.toString(), {
      headers,
      method: req.method,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : req,
      redirect: 'manual'
    });

    // 4. Forward response headers
    for (const [key, value] of response.headers) {
      if (!['content-encoding'].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    }

    // 5. Stream the response
    response.body.pipe(res);
    
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: 'Proxy failed', message: error.message });
  }
};