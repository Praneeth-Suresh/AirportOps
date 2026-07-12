import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';

const PORT = Number(process.env.PORT || 8080);
const root = process.cwd();

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

const server = createServer((req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  let pathname = decodeURIComponent(url.pathname);

  if (pathname === '/') {
    pathname = '/index.html';
  }

  const filePath = path.join(root, pathname);

  if (!filePath.startsWith(root)) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bad Request');
    return;
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  const file = fs.readFileSync(filePath);
  res.writeHead(200, { 'Content-Type': contentType });
  res.end(file);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Static server listening on :${PORT}`);
});
