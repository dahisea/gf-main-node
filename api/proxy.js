const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');

const app = express();
app.use(cors());

const primaryServers = ['https://example.com'];
const backupServers = ['https://cn-greasyfork.org'];
const MAX_RETRIES = 1;
const REQUEST_TIMEOUT = 6000;

function getRandomServer(servers) {
    return servers[Math.floor(Math.random() * servers.length)];
}

function createProxy(target) {
    return createProxyMiddleware({
        target,
        changeOrigin: true,
        timeout: REQUEST_TIMEOUT,
        proxyTimeout: REQUEST_TIMEOUT,
        onError: (err, req, res) => res.status(502).send('Error'),
        onProxyReq: (proxyReq, req) => {
            proxyReq.setHeader('Host', new URL(target).host);
        }
    });
}

const proxyHandlers = primaryServers.map(createProxy);
const backupProxy = createProxy(getRandomServer(backupServers));

app.use('/', (req, res, next) => {
    let retries = 0;
    const tryProxy = () => {
        if (retries < proxyHandlers.length) {
            proxyHandlers[retries](req, res, (err) => {
                if (err || res.statusCode === 429 || res.statusCode === 503) {
                    retries++;
                    tryProxy();
                }
            });
        } else {
            backupProxy(req, res, next);
        }
    };
    tryProxy();
});

module.exports = app;
