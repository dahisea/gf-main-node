import { Headers } from 'node-fetch';

export default async (req, res) => {
  try {
    // Construct target URL
    const baseUrl = 'https://example.com';
    const path = req.query.path?.join('/') || '';
    const search = req.url.includes('?') ? req.url.split('?')[1] : '';
    const targetUrl = new URL(`${baseUrl}/${path}${search ? `?${search}` : ''}`);

    // Clone and clean headers
    const headers = new Headers(req.headers);
    headers.delete('host');
    headers.set('x-forwarded-for', req.headers['x-real-ip'] || req.socket.remoteAddress);

    // Forward request
    const response = await fetch(targetUrl, {
      headers,
      method: req.method,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? req : undefined,
      redirect: 'follow'
    });

    // Forward response
    res.status(response.status);
    response.headers.forEach((value, key) => {
      if (!['content-encoding', 'transfer-encoding'].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });
    
    const buffer = await response.arrayBuffer();
    res.end(Buffer.from(buffer));
    
  } catch (error) {
    console.error('Proxy Error:', error.message);
    res.status(500).json({ error: 'Proxy failed', details: error.message });
  }
}