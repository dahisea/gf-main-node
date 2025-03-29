import fetch from 'node-fetch';

export default async (req, res) => {
  try {
    // 1. Construct target URL
    const path = Array.isArray(req.query.path) ? req.query.path.join('/') : '';
    const search = req.url.includes('?') ? req.url.split('?')[1] : '';
    const targetUrl = new URL(`https://example.com/${path}${search ? `?${search}` : ''}`);

    // 2. Forward request without modifying headers
    const response = await fetch(targetUrl.toString(), {
      method: req.method,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : req,
      redirect: 'manual'
    });

    // 3. Stream response directly without header processing
    res.status(response.status);
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