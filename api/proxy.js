import fetch from 'node-fetch';
import { Headers } from 'node-fetch';

// 配置
const CONFIG = {
  primaryServers: ['sh67jx.dahiicu-36a.workers.dev'],
  backupServers: ['shudhdks2882h.didyjwi3837dyd.zh-cn.eu.org'],
  maxRetries: 25,
  requestTimeout: 8000,
  retryBaseDelay: 100,
  retryMaxDelay: 1500
};

// 需要透传的请求头
const ALLOWED_HEADERS = [
  'accept',
  'accept-language',
  'content-type',
  'cookie',
  'user-agent',
  'referer',
  'x-requested-with'
];

export default async function handler(req, res) {
  try {
    // 1. 从用户请求中获取所有headers
    const userHeaders = getHeadersFromRequest(req);
    
    // 2. 处理请求
    const response = await handleRequest({
      url: req.url,
      method: req.method,
      headers: userHeaders,
      body: req
    });
    
    // 3. 透传响应headers
    const responseHeaders = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });
    
    // 4. 返回响应
    res
      .status(response.status)
      .set(responseHeaders)
      .send(await response.text());
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(502).send('Proxy error occurred');
  }
}

// 从用户请求中提取headers
function getHeadersFromRequest(req) {
  const headers = new Headers();
  
  // 1. 透传允许的headers
  for (const [key, value] of Object.entries(req.headers)) {
    const lowerKey = key.toLowerCase();
    if (value && ALLOWED_HEADERS.includes(lowerKey)) {
      headers.set(key, value);
    }
  }
  
  // 2. 设置必要headers
  headers.set('host', 'greasyfork.org');
  headers.set('origin', 'https://greasyfork.org');
  headers.set('x-forwarded-for', req.headers['x-real-ip'] || req.ip);
  headers.set('node', 'dahi'); // 添加自定义header
  
  return headers;
}

// 主请求处理函数
async function handleRequest({ url, method, headers, body }) {
  let retryCount = 0;
  let currentServer = getRandomServer(CONFIG.primaryServers);
  let isUsingBackup = false;

  while (retryCount <= CONFIG.maxRetries) {
    try {
      // 构造目标URL
      const targetUrl = new URL(url, `https://${currentServer}`);
      
      // 创建请求对象
      const request = new Request(targetUrl, {
        method,
        headers,
        body: method === 'GET' ? undefined : await getRequestBody(body),
        redirect: 'manual'
      });
      
      // 发起请求
      const response = await fetchWithTimeout(request, CONFIG.requestTimeout);

      if (response.ok || (response.status >= 300 && response.status < 400)) {
        return response;
      }

      if (response.status === 429 || response.status === 404) {
        if (!isUsingBackup) {
          currentServer = getRandomServer(CONFIG.backupServers);
          isUsingBackup = true;
          await sleep(calculateBackoffDelay(retryCount));
          continue;
        }
      }

      if (response.status === 503) {
        throw new Error('Server unavailable');
      }

    } catch (error) {
      retryCount++;
      if (retryCount > CONFIG.maxRetries) break;
      
      await sleep(calculateBackoffDelay(retryCount));
      
      if (!isUsingBackup) {
        currentServer = getRandomServer(CONFIG.backupServers);
        isUsingBackup = true;
      }
    }
  }

  return new Response('All servers failed', { status: 502 });
}

// 辅助函数
async function getRequestBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

function fetchWithTimeout(request, timeout) {
  return Promise.race([
    fetch(request),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Timeout')), timeout)
    )
  ]);
}

function calculateBackoffDelay(retryCount) {
  return Math.min(
    CONFIG.retryBaseDelay * Math.pow(2, retryCount),
    CONFIG.retryMaxDelay
  ) + Math.random() * 50;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getRandomServer(servers) {
  return servers[Math.floor(Math.random() * servers.length)];
}