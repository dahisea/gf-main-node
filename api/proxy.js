const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');

const app = express();

// 启用 CORS
app.use(cors());

const primaryServers = ['gf-n-main-1.dahiddwy.workers.dev', 'gf-n-main-2.dahiddwy.workers.dev'];
const backupServers = ['cn-greasyfork.org'];
const MAX_RETRIES = 1; // 主节点的最大重试次数
const REQUEST_TIMEOUT = 6000; // 请求超时时间

// 代理逻辑
app.use('/', async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    // 检查是否是 sitemap.xml 请求
    if (url.pathname === '/sitemap.xml') {
        res.setHeader('Content-Type', 'application/xml');
        return res.send(generateSitemap());
    }

    let retries = 0;
    let currentServerIndex = 0;

    // 先尝试主节点
    while (retries <= MAX_RETRIES) {
        try {
            const server = primaryServers[currentServerIndex];
            const proxyResponse = await fetchWithTimeout(rewriteRequestUrl(req, server), REQUEST_TIMEOUT);

            // 如果响应成功或重定向，直接返回
            if (proxyResponse.ok || (proxyResponse.status >= 300 && proxyResponse.status < 400)) {
                return res.status(proxyResponse.status).send(proxyResponse.body);
            }

            // 如果服务器返回429或503错误，直接切换到备用节点
            if (proxyResponse.status === 429 || proxyResponse.status === 503) {
                throw new Error('Server error');
            }
        } catch (error) {
            // 如果是超时错误，切换到下一个主节点
            if (error.message === 'Timeout') {
                currentServerIndex = (currentServerIndex + 1) % primaryServers.length;
                retries++;
                continue; // 继续尝试下一个主节点
            }

            // 如果是其他错误（如429、503），直接切换到备用节点
            break;
        }
    }

    // 如果所有主节点都失败，尝试备用节点
    const backupServer = getRandomServer(backupServers);
    try {
        const backupResponse = await fetchWithTimeout(rewriteRequestUrl(req, backupServer), REQUEST_TIMEOUT);
        return res.status(backupResponse.status).send(backupResponse.body);
    } catch (error) {
        // 备用节点也不处理错误，直接返回502错误
        return res.status(502).send('Error');
    }
});

// 生成 sitemap.xml 内容
function generateSitemap() {
    return ``;
}

function getRandomServer(servers) {
    return servers[Math.floor(Math.random() * servers.length)];
}

function rewriteRequestUrl(req, newHostname) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    url.hostname = newHostname;
    return new Request(url.toString(), {
        method: req.method,
        headers: req.headers,
        body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : null,
        redirect: 'manual'
    });
}

async function fetchWithTimeout(request, timeout) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(request, { signal: controller.signal });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        throw new Error('Timeout');
    }
}

// Vercel 需要导出 app
module.exports = app;