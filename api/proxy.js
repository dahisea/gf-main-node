import fetch from 'node-fetch';
import { Headers } from 'node-fetch';

// Configuration
const CONFIG = {
  primaryServers: ['sh67jx.dahiicu-36a.workers.dev'],
  backupServers: ['shudhdks2882h.didyjwi3837dyd.zh-cn.eu.org'],
  maxRetries: 25,
  requestTimeout: 8000,
  retryBaseDelay: 100,
  retryMaxDelay: 1500
};

export default async function handler(req, res) {
  try {
    const response = await handleRequest(req);
    
    // Convert Fetch API Response to Express-like response
    const headers = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });
    
    res
      .status(response.status)
      .set(headers)
      .send(await response.text());
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(502).send('All servers failed to respond');
  }
}

/**
 * Handles the incoming request with retry logic + exponential backoff
 */
async function handleRequest(request) {
  let retryCount = 0;
  let currentServer = getRandomServer(CONFIG.primaryServers);
  let isUsingBackup = false;

  while (retryCount <= CONFIG.maxRetries) {
    try {
      const rewrittenRequest = rewriteRequestUrl(request, currentServer);
      const response = await fetchWithTimeout(rewrittenRequest, CONFIG.requestTimeout);

      if (response.ok || (response.status >= 300 && response.status < 400)) {
        return response;
      }

      if (response.status === 429 || response.status === 404) {
        if (!isUsingBackup) {
          currentServer = getRandomServer(CONFIG.backupServers);
          isUsingBackup = true;
          await sleep(calculateBackoffDelay(retryCount));
          continue;
        } else {
          throw new Error('All servers returned 429/404');
        }
      }

      if (response.status === 503) {
        throw new Error('Server unavailable, retrying...');
      }

    } catch (error) {
      console.error(`Attempt ${retryCount + 1} failed:`, error.message);
      retryCount++;
      
      if (retryCount > CONFIG.maxRetries) break;
      
      await sleep(calculateBackoffDelay(retryCount));
      
      if (!isUsingBackup) {
        currentServer = getRandomServer(CONFIG.backupServers);
        isUsingBackup = true;
      }
    }
  }

  return new Response('Service Unavailable', {
    status: 502,
    statusText: 'All servers failed to respond'
  });
}

/**
 * Rewrites the request URL to target the selected server
 */
function rewriteRequestUrl(request, server) {
  const url = new URL(request.url, `https://${request.headers.host}`);
  url.hostname = server;

  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    headers.set(key, value);
  }
  headers.set('node', 'dahi');

  return new Request(url, {
    method: request.method,
    headers: headers,
    body: request.method === 'POST' ? request.body : null,
    redirect: 'manual'
  });
}

/**
 * Fetches with a timeout
 */
function fetchWithTimeout(request, timeout) {
  return Promise.race([
    fetch(request),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Timeout')), timeout)
    )
  ]);
}

/**
 * Calculates exponential backoff delay
 */
function calculateBackoffDelay(retryCount) {
  const delay = Math.min(
    CONFIG.retryBaseDelay * Math.pow(2, retryCount),
    CONFIG.retryMaxDelay
  );
  return delay + Math.random() * 50;
}

/**
 * Sleep for a given duration
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Selects a random server from the provided list
 */
function getRandomServer(servers) {
  return servers[Math.floor(Math.random() * servers.length)];
}