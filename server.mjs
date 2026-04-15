/**
 * Local HTTP + WebSocket server for dual-display setup:
 * - Monitor: http://<this-pc-ip>:8080/index.html?mode=display  (video + ripples)
 * - Tablet:  http://<this-pc-ip>:8080/controller.html         (buttons only)
 *
 * Run: npm install && npm start
 * Same WiFi required; firewall must allow inbound TCP on the chosen port.
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(err.code === 'ENOENT' ? 404 : 500);
      res.end(err.code === 'ENOENT' ? 'Not found' : 'Server error');
      return;
    }
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0];
  // Lets controller.html verify it is talking to this Node relay (not python http.server)
  if (urlPath === '/__relay_ok') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('digital-ripples-relay');
    return;
  }
  if (urlPath === '/') urlPath = '/index.html';
  const safe = path.normalize(urlPath).replace(/^(\.\.(\/|\\|$))+/, '');
  const filePath = path.join(ROOT, safe);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    sendFile(res, filePath);
  });
});

const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let text = raw.toString();
    try {
      const msg = JSON.parse(text);
      if (msg.type !== 'input' || !msg.action) return;
    } catch {
      return;
    }
    for (const client of wss.clients) {
      if (client.readyState === 1) {
        client.send(text);
      }
    }
  });
});

server.on('upgrade', (req, socket, head) => {
  if (req.url === '/ws' || req.url.startsWith('/ws?')) {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  } else {
    socket.destroy();
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Digital Ripples server http://0.0.0.0:${PORT}/`);
  console.log(`  Display:  http://<this-machine-ip>:${PORT}/index.html?mode=display`);
  console.log(`  Tablet:   http://<this-machine-ip>:${PORT}/controller.html`);
  console.log(`  WebSocket: ws://<this-machine-ip>:${PORT}/ws`);
});
