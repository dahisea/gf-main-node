import fetch from 'node-fetch';
import { Headers } from 'node-fetch';

export default async (req, res) => {
  try {
    // 1. Construct target URL
    const path = Array.isArray(req.query.path) ? req.query.path.join('/') : '';
    const search = req.url.includes('?') ? req.url.split('?')[1] : '';
    const targetUrl = new URL(`https://greasyfork.org/${path}${search ? `?${search}` : ''}`);

    // 2. Forward request with headers
    const headers = new Headers(req.headers);
    headers.delete('host'); // Remove original host header
    
    const response = await fetch(targetUrl.toString(), {
      headers,
      method: req.method,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : req,
      redirect: 'manual'
    });

    // 3. Forward response with headers
    response.headers.forEach((value, key) => {
      // Skip problematic headers
      if (!['content-encoding', 'transfer-encoding'].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });
    
    res.status(response.status);
    
    // 4. Stream response
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