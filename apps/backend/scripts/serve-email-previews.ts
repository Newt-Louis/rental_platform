import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '../../..');
const previewDir = path.join(repoRoot, 'artifacts', 'email-previews');
const logoPath = path.join(repoRoot, 'apps', 'frontend', 'public', 'logo.png');
const port = Number(process.env.EMAIL_PREVIEW_PORT || 4173);

const server = http.createServer((request, response) => {
  const pathname = new URL(request.url || '/', `http://127.0.0.1:${port}`).pathname;
  const requested = pathname === '/' ? '/index.html' : pathname;
  const filePath = requested === '/logo.png'
    ? logoPath
    : path.resolve(previewDir, `.${requested}`);
  if (filePath !== logoPath && !filePath.startsWith(`${previewDir}${path.sep}`)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    response.writeHead(404).end('Not found');
    return;
  }
  const ext = path.extname(filePath);
  const contentType = ext === '.html' ? 'text/html; charset=utf-8'
    : ext === '.png' ? 'image/png'
      : ext === '.json' ? 'application/json; charset=utf-8'
        : 'text/plain; charset=utf-8';
  response.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
  fs.createReadStream(filePath).pipe(response);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`CR-119 preview server: http://127.0.0.1:${port}`);
});
