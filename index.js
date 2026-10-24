import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import url from 'node:url';

const PORT = process.env.PORT || process.env.SERVER_PORT || 8000;

// Hàm kiểm tra IP Egress cho Node.js
function fetchEgressIP(callback) {
  https.get('https://api.ipify.org?format=json', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        callback(null, json.ip);
      } catch (e) {
        callback(e);
      }
    });
  }).on('error', (err) => callback(err));
}

// 1. Nếu chạy trên môi trường Node.js (Render, Botkeep, Codespaces)
if (typeof WebSocketPair === 'undefined') {
  const server = http.createServer((req, res) => {
    if (req.url === '/' || req.url === '/ip') {
      fetchEgressIP((err, ip) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'online',
          message: 'Proxy Node is working!',
          node_public_ip: ip || 'Cannot detect',
          timestamp: new Date().toISOString()
        }, null, 2));
      });
      return;
    }

    const parsedUrl = url.parse(req.url);
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 80,
      path: parsedUrl.path,
      method: req.method,
      headers: req.headers
    };

    delete options.headers['x-forwarded-for'];
    delete options.headers['x-real-ip'];
    delete options.headers['via'];

    const proxyReq = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    });

    req.pipe(proxyReq, { end: true });

    proxyReq.on('error', (err) => {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('Proxy Error: ' + err.message);
    });
  });

  server.on('connect', (req, clientSocket, head) => {
    const { port, hostname } = url.parse(`//${req.url}`, false, true);
    const serverSocket = net.connect(port || 443, hostname, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      serverSocket.write(head);
      serverSocket.pipe(clientSocket);
      clientSocket.pipe(serverSocket);
    });

    serverSocket.on('error', () => {
      clientSocket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
    });

    clientSocket.on('error', () => {
      serverSocket.end();
    });
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`>>> Proxy Node running on port ${PORT}`);
  });
}

// 2. Export fetch handler cho Cloudflare Workers & Edge Networks
export default {
  async fetch(request) {
    const reqUrl = new URL(request.url);
    if (reqUrl.pathname === '/' || reqUrl.pathname === '/ip') {
      const res = await fetch('https://api.ipify.org?format=json');
      const { ip } = await res.json();
      return new Response(JSON.stringify({
        status: 'online',
        message: 'Cloudflare Edge Proxy Node is working!',
        node_public_ip: ip,
        timestamp: new Date().toISOString()
      }, null, 2), {
        headers: { 'content-type': 'application/json' }
      });
    }

    const target = reqUrl.searchParams.get('url') || request.headers.get('x-target-url');
    if (target) {
      const headers = new Headers(request.headers);
      headers.delete('x-forwarded-for');
      headers.delete('x-real-ip');
      headers.delete('via');
      return fetch(target, {
        method: request.method,
        headers: headers,
        body: request.body
      });
    }

    return new Response(JSON.stringify({
      status: 'online',
      message: 'Cloudflare Edge Proxy Node Active'
    }), {
      headers: { 'content-type': 'application/json' }
    });
  }
};
