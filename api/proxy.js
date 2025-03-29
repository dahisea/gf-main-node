import fetch from 'node-fetch';
import { Headers } from 'node-fetch';

export default async (req, res) => {
  try {
    // 1. Construct target URL (使用IP但强制Host头)
    const path = Array.isArray(req.query.path) ? req.query.path.join('/') : '';
    const search = req.url.includes('?') ? req.url.split('?')[1] : '';
    const targetUrl = new URL(`https://50.116.4.196/${path}${search ? `?${search}` : ''}`);

    // 2. 准备特殊处理的headers
    const headers = new Headers();
    Object.entries(req.headers).forEach(([key, value]) => {
      if (value && typeof value === 'string' && key.toLowerCase() !== 'host') {
        headers.set(key, value);
      }
    });
    
    // 强制设置Host头并添加SNI指示
    headers.set('Host', 'greasyfork.org');
    headers.set('X-Forwarded-Server', 'greasyfork.org');
    
    // 3. 特殊fetch配置
    const response = await fetch(targetUrl.toString(), {
      headers,
      method: req.method,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : req,
      redirect: 'manual',
      // 强制使用TLS SNI
      agent: https.globalAgent // 需要添加: import https from 'https'
    });

    // ...其余代码保持不变...
    
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ 
      error: 'Proxy failed', 
      message: error.message 
    });
  }
};