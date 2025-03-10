const http = require('http');
const httpProxy = require('http-proxy');

// 创建代理实例
const proxy = httpProxy.createProxyServer({});

// 定义目标服务器
const TARGET_SERVER = 'https://example.com'; // 替换为你的目标服务器

// 创建 HTTP 服务器
const server = http.createServer((req, res) => {
    console.log(`Proxying request to: ${TARGET_SERVER}${req.url}`);

    // 将请求代理到目标服务器
    proxy.web(req, res, { target: TARGET_SERVER });
});

// 监听代理服务器的错误事件
proxy.on('error', (err, req, res) => {
    console.error('Proxy error:', err);
    res.writeHead(500, {
        'Content-Type': 'text/plain'
    });
    res.end('Proxy error occurred.');
});

// 启动服务器
const PORT = process.env.PORT || 3000; // 使用环境变量中的端口号，或默认 3000
server.listen(PORT, () => {
    console.log(`Proxy server is running on http://localhost:${PORT}`);
});