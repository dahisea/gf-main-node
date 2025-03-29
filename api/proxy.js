import { Headers } from 'node-fetch';

export default async (req, res) => {
  try {
    // Prepare target URL
    const path = req.query.path?.join('/') || '';
    const targetUrl = new URL(`https://greasyfork.org/${path}${req.url.split('?')[1] || ''}`);

    // Proxy the request
    const headers = new Headers(req.headers);
    headers.delete('host');
    const response = await fetch(targetUrl, { headers });

    // Proxy the response
    const content = await response.text();
    res.status(response.status)
       .set('Content-Type', response.headers.get('Content-Type'))
       .send(content);
      
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).send('Proxy error');
  }
}