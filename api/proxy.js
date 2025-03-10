const httpProxy = require('http-proxy');
const { send } = require('micro');

// 创建代理实例
const proxy = httpProxy.createProxyServer({});

// 定义目标服务器
const TARGET_SERVER = 'https://example.com';

// 导出 Vercel 函数
module.exports = async (req, res) => {
    console.log(`Proxying request to: ${TARGET_SERVER}${req.url}`);

    // 将请求代理到目标服务器
    return new Promise((resolve, reject) => {
        proxy.web(req, res, { target: TARGET_SERVER }, (err) => {
            if (err) {
                console.error('Proxy error:', err);
                send(res, 500, 'Proxy error occurred.');
                reject(err);
            } else {
                resolve();
            }
        });
    });
};
