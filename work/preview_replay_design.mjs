import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

// This preview serves only the standalone design, without APIs or file writes.
const design = new URL('../outputs/과거시각_재생_디자인_초안.html', import.meta.url);
createServer((req, res) => {
  if (req.method !== 'GET' || req.url !== '/') {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(readFileSync(design));
}).listen(5302, '127.0.0.1', () => console.log('Replay design: http://127.0.0.1:5302/'));
