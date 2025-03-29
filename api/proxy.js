import fetch from 'node-fetch';
import { Headers } from 'node-fetch';

export default async (req, res) => {
  try {
    // 1. Construct target URL
    const path = Array.isArray(req.query.path) ? req.query.path.join('/') : '';
    const search = req.url.includes('?') ? req.url.split('?')[1] : '';
    const targetUrl = new URL(`https://50.116.4.196/${path}${search ? `?${search}` : ''}`);

    // 2. Prepare headers with modified Host
    const headers = new Headers();
    // Copy all headers except host
    Object.entries(req.headers).forEach(([key, value]) => {
      if (value && typeof value === 'string') {
        headers.set(key, value);
      }
    });
    // Set specific Host header for greasyfork.org
    headers.set('Host', 'greasyfork.org');
    // Add X-Forwarded headers for tracking
    headers.set('X-Forwarded-For', req.headers['x-real-ip'] || req.socket.remoteAddress);
    headers.set('X-Forwarded-Host', req.headers.host || 'proxy-server');

    // 3. Forward request
    const response = await fetch(targetUrl.toString(), {
      headers,
      method: req.method,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : req,
      redirect: 'manual'
    });

    // 4. Forward response headers
    const excludedHeaders = ['content-encoding', 'transfer-encoding'];
    response.headers.forEach((value, key) => {
      if (!excludedHeaders.includes(key.toLowerCase())) {
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