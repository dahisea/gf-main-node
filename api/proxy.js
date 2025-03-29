import fetch from 'node-fetch';

export default async (req, res) => {
  try {
    // 1. Construct target URL
    const path = req.query.path?.join('/') || '';
    const search = req.url.includes('?') ? `?${req.url.split('?')[1]}` : '';
    const targetUrl = new URL(`https://example.com/${path}${search}`);

    // 2. Prepare headers
    const headers = new Headers(req.headers);
    headers.delete('host');
    headers.set('x-forwarded-host', req.headers.host || '');

    // 3. Forward request
    const response = await fetch(targetUrl, {
      headers,
      method: req.method,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : req,
      redirect: 'manual'
    });

    // 4. Forward response headers
    response.headers.forEach((value, key) => {
      if (!['content-encoding'].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });

    // 5. Stream response
    if (response.body) {
      response.body.pipe(res);
    } else {
      res.end();
    }
    
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ 
      error: 'Proxy failed', 
      message: error.message 
    });
  }
};