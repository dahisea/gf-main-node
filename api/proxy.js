// api/[[...path]].js
import { Headers } from 'node-fetch';

export default async function handler(req, res) {
  try {
    // 1. 处理请求路径
    let path = req.query.path?.join('/') || '';
    if (path === '') path = 'en'; // 默认英文
    
    // 2. 替换中文路径
    path = path.replace(/^zh-hans/, 'zh-CN').replace(/^zh-hant/, 'zh-TW');
    
    // 3. 构建目标URL
    const targetUrl = new URL(`https://greasyfork.org/${path}${req.url.split('?')[1] || ''}`);
    
    // 4. 准备请求头
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (!['host', 'referer'].includes(key.toLowerCase())) {
        headers.set(key, value);
      }
    }
    headers.set('Origin', 'https://greasyfork.org');

    // 5. 获取原始内容
    const response = await fetch(targetUrl, {
      headers,
      redirect: 'manual'
    });

    // 6. 处理重定向
    if ([301, 302, 307, 308].includes(response.status)) {
      const location = response.headers.get('Location');
      if (location) {
        return res.redirect(response.status, location.replace('greasyfork.org', 'your-vercel-domain.vercel.app'));
      }
    }

    // 7. 处理响应内容
    let content = await response.text();
    
    // 8. 简单修改HTML内容
    content = content
      .replace(/greasyfork\.org/g, 'your-vercel-domain.vercel.app')
      .replace(/<title>(.*?)<\/title>/, '<title>GFork镜像 - $1</title>')
      .replace(/<\/head>/, '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@1/css/pico.min.css"></head>')
      .replace(/<\/body>/, '<footer><center><p>GFork镜像服务</p></center></footer></body>');

    // 9. 返回修改后的内容
    res
      .status(response.status)
      .setHeader('Content-Type', 'text/html; charset=utf-8')
      .send(content);
      
  } catch (error) {
    console.error('Error:', error);
    res.status(500).send('服务器错误');
  }
}