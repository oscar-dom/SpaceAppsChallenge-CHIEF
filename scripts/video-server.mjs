// Static server for video/ (storyboard, animator, screenshots, voice-over), used by
// `npm run video` and `npm run video:render`. Resolves with the server and its URL.
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';

const root = join(import.meta.dirname, '..', 'video');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.woff2': 'font/woff2',
};

export function serveVideo(port = Number(process.env.PORT) || 5180) {
  const server = createServer((req, res) => {
    let path = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
    if (path !== root && !path.startsWith(root + sep)) return res.writeHead(403).end();
    try {
      if (statSync(path).isDirectory()) path = join(path, 'index.html');
      const { size } = statSync(path);
      res.writeHead(200, {
        'Content-Type': types[extname(path)] || 'application/octet-stream',
        'Content-Length': size,
      });
      createReadStream(path).pipe(res);
    } catch {
      res.writeHead(404).end('Not found');
    }
  });
  return new Promise((resolve, reject) => {
    server.on('error', (err) => {
      if (err.code !== 'EADDRINUSE') return reject(err);
      server.listen(++port); // port taken: try the next one
    });
    server.on('listening', () => resolve({ server, url: `http://localhost:${port}` }));
    server.listen(port);
  });
}
