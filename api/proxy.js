import fetch from 'node-fetch';
import { Headers } from 'node-fetch';

export default async (req, res) => {
  try {
    // 1. Construct target URL
    const path = Array.isArray(req.query.path) ? req.query.path.join('/') : '';
    const search = req.url.includes('?') ? req.url.split('?')[1] : '';
    const targetUrl = new URL(`https://greasyfork.org/${path}${search ? `?${search}` : ''}`);

    // 2. Prepare headers to mimic browser
    const headers = new Headers({
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Referer': 'https://greasyfork.org/',
      'Connection': 'keep-alive'
    });
    
    // Copy selected headers from original request
    if (req.headers['accept']) headers.set('Accept', req.headers['accept']);
    if (req.headers['accept-language']) headers.set('Accept-Language', req.headers['accept-language']);

    // 3. Forward request with proper headers
    const response = await fetch(targetUrl.toString(), {
      headers,
      method: req.method,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : req,
      redirect: 'follow',
      credentials: 'include' // Important for cookies
    });

    // 4. Forward response with headers
    response.headers.forEach((value, key) => {
      if (!['content-encoding', 'transfer-encoding'].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });
    
    res.status(response.status);
    
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