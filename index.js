const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const url = require('node:url');

const PORT = process.env.PORT || process.env.SERVER_PORT || 8853;

// Hàm kiểm tra IP Egress của chính máy chủ này
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

// 1. Tạo HTTP Proxy Server
const server = http.createServer((req, res) => {
  // Nếu truy cập trực tiếp qua trình duyệt để kiểm tra tình trạng Node
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

  // Xử lý chuyển tiếp HTTP Forward Request thông thường
  const parsedUrl = url.parse(req.url);
  const options = {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port || 80,
    path: parsedUrl.path,
    method: req.method,
    headers: req.headers
  };

  // Xóa các header có nguy cơ làm lộ IP nguồn
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

// 2. Xử lý đường hầm HTTPS CONNECT (Bảo mật tuyệt đối, không giải mã gói tin)
server.on('connect', (req, clientSocket, head) => {
  const { port, hostname } = url.parse(`//${req.url}`, false, true);

  const serverSocket = net.connect(port || 443, hostname, () => {
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    serverSocket.write(head);
    serverSocket.pipe(clientSocket);
    clientSocket.pipe(serverSocket);
  });

  serverSocket.on('error', (err) => {
    clientSocket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
  });

  clientSocket.on('error', () => {
    serverSocket.end();
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`>>> Proxy Node running on port ${PORT}`);
});
